import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAgentActiveForProjectTask } from '../store.js';
import { getProjectRegistry, publicProjectView } from '../projects/projectRegistry.js';
import { toStructuredResult } from '../result/structuredResult.js';
import { loadRelayConfig } from '../relay/relayConfig.js';
import { buildGithubRelayRepoTargets, loadGithubRelayConfig, redactGithubRelayConfig } from '../github/githubRelayConfig.js';
import { readRelayRuntimeStatus, relayRuntimePathForStore } from '../github/relayRuntimeStatus.js';
import { isPidAlive } from '../store.js';
import { resolveDashboardIssueState } from './issueState.js';
import {
  elapsedSince,
  isTerminalStatus,
  resolveLifecycle,
  taskSource,
} from './present.js';
import { publicAgentSession, sanitizeErrorMessage, sanitizeObject, sanitizeText } from './sanitize.js';

const require = createRequire(import.meta.url);
const { version: bridgeVersion } = require('../../package.json');
const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const RECENT_LIMIT = 40;
const ACTIVITY_COMPARE_FIELDS = [
  'status',
  'claimedAt',
  'updatedAt',
  'completedAt',
  'summary',
];

function taskMeta(task) {
  return task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
}

function countBy(list, fn) {
  const out = Object.create(null);
  for (const item of list) {
    const key = fn(item);
    if (!key) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function workspaceHealth(workspaceRoot) {
  if (!workspaceRoot) return { state: 'UNKNOWN', exists: null };
  try {
    return existsSync(workspaceRoot)
      ? { state: 'ONLINE', exists: true }
      : { state: 'MISSING', exists: false };
  } catch {
    return { state: 'UNKNOWN', exists: null };
  }
}

function launchState(task) {
  const meta = taskMeta(task);
  if (meta.agentLaunchErrorAt && !meta.agentLaunchedAt) return 'ERROR';
  if (meta.agentLaunchedAt) return 'LAUNCHED';
  if (meta.agentLaunchStartedAt) return 'LAUNCHING';
  return 'IDLE';
}

function sessionState(task, { now, active }) {
  const meta = taskMeta(task);
  if (active) {
    if (meta.agentSession) return 'REGISTERED';
    if (meta.agentLaunchedAt) return 'HANDOFF';
    if (meta.agentLaunchStartedAt) return 'LAUNCHING';
    return 'ACTIVE';
  }
  if (meta.agentAutoCloseCompletedAt) return 'CLOSED';
  if (meta.agentSessionDeadObservedAt) return 'LOST';
  if (meta.agentLaunchErrorAt) return 'ERROR';
  return 'IDLE';
}

function resultPublishState(task) {
  const meta = taskMeta(task);
  if (meta.githubResultPostedAt) return 'POSTED';
  if (isTerminalStatus(task.status) && meta.githubIssueNumber) return 'PENDING';
  if (task.summary) return 'STORED';
  return 'IDLE';
}

export function summarizeTask(task, {
  debug = false,
  now = Date.now(),
  openIssueNumbersByRepo = null,
  openIssuesKnown = false,
} = {}) {
  if (!task) return null;
  const meta = taskMeta(task);
  const active = isAgentActiveForProjectTask(task, { now });
  const issueState = resolveDashboardIssueState(task, { openIssueNumbersByRepo, openIssuesKnown });
  const started = task.claimedAt || meta.agentLaunchStartedAt || task.createdAt;
  const ended = task.completedAt || (isTerminalStatus(task.status) ? task.updatedAt : null);
  const durationMs = Date.parse(ended || '') && Date.parse(started || '')
    ? Math.max(0, Date.parse(ended) - Date.parse(started))
    : (active || task.status === 'IN_PROGRESS' ? Math.max(0, now - Date.parse(started || now)) : null);

  const view = {
    taskId: task.id,
    projectId: task.projectId || null,
    project: task.projectDisplayName || task.project || task.projectId || null,
    title: sanitizeText(task.title || '', { debug }),
    status: task.status || 'UNKNOWN',
    source: taskSource(task),
    priority: task.priority || 'normal',
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
    claimedAt: task.claimedAt || null,
    claimedBy: task.claimedBy || null,
    completedAt: task.completedAt || null,
    githubRepo: meta.githubRepo || null,
    githubIssueNumber: meta.githubIssueNumber ? String(meta.githubIssueNumber) : null,
    githubIssueUrl: meta.githubIssueUrl || null,
    issueState,
    launchState: launchState(task),
    sessionState: sessionState(task, { now, active }),
    resultState: resultPublishState(task),
    agentActive: active,
    elapsed: elapsedSince(started, now),
    duration: Number.isFinite(durationMs) ? elapsedSince(new Date(now - durationMs).toISOString(), now) : null,
    lastUpdate: task.updatedAt || null,
    lifecycle: resolveLifecycle(task),
    warnings: [],
  };

  if (meta.projectRoutingError) view.warnings.push('PROJECT ROUTE ERROR');
  if (meta.agentLaunchError) view.warnings.push('AGENT LAUNCH FAILURE');
  if (meta.agentSessionDeadObservedAt) view.warnings.push('AGENT SESSION LOST');
  if (meta.cleanupReason) view.warnings.push('SOURCE ISSUE CLOSED');

  const v2 = meta.v2 && typeof meta.v2 === 'object' ? meta.v2 : null;
  view.provider = v2?.execution?.provider || 'legacy';
  view.executionState = v2?.execution?.state || null;
  view.executionId = v2?.execution?.executionId || null;
  view.verificationState = v2?.verification?.state || null;
  view.gateState = v2?.gate?.status || null;
  view.gateId = v2?.gate?.gateId || null;
  if (view.gateState === 'WAITING') view.warnings.push('WAITING FOR OPERATOR');

  if (debug) {
    view.debug = {
      createdAt: task.createdAt || null,
      updatedAt: task.updatedAt || null,
      agentLaunchStartedAt: meta.agentLaunchStartedAt || null,
      agentLaunchedAt: meta.agentLaunchedAt || null,
      agentLaunchMethod: meta.agentLaunchMethod || null,
      githubAckPostedAt: meta.githubAckPostedAt || null,
      githubResultPostedAt: meta.githubResultPostedAt || null,
      githubSourceIssueState: meta.githubSourceIssueState || null,
      v2: v2 ? sanitizeObject(v2, { debug: false }) : null,
    };
  }
  return view;
}

export function presentTaskDetail(task, {
  debug = false,
  now = Date.now(),
  openIssueNumbersByRepo = null,
  openIssuesKnown = false,
} = {}) {
  const summary = summarizeTask(task, { debug, now, openIssueNumbersByRepo, openIssuesKnown });
  if (!summary) return null;
  const result = toStructuredResult(task);
  const meta = taskMeta(task);
  const detail = {
    ...summary,
    resultSummary: result.resultSummary,
    rootCause: result.rootCause,
    changedFiles: result.changedFiles,
    tests: result.tests,
    build: result.build,
    behaviorChanged: result.behaviorChanged,
    behaviorPreserved: result.behaviorPreserved,
    warnings: [...summary.warnings, ...result.warnings],
    remainingIssues: result.remainingIssues,
    nextRecommendedStep: result.nextRecommendedStep,
    agent: publicAgentSession(meta.agentSession, { debug }),
    launch: {
      state: summary.launchState,
      startedAt: meta.agentLaunchStartedAt || null,
      launchedAt: meta.agentLaunchedAt || null,
      method: meta.agentLaunchMethod || null,
      error: meta.agentLaunchError ? sanitizeErrorMessage(meta.agentLaunchError) : null,
    },
  };
  if (debug) {
    detail.raw = sanitizeObject({
      id: task.id,
      status: task.status,
      projectId: task.projectId,
      metadata: {
        githubIssueNumber: meta.githubIssueNumber || null,
        githubRepo: meta.githubRepo || null,
        githubAckPostedAt: meta.githubAckPostedAt || null,
        githubResultPostedAt: meta.githubResultPostedAt || null,
        githubSourceIssueState: meta.githubSourceIssueState || null,
        agentLaunchStartedAt: meta.agentLaunchStartedAt || null,
        agentLaunchedAt: meta.agentLaunchedAt || null,
        agentLaunchMethod: meta.agentLaunchMethod || null,
        agentLaunchErrorAt: meta.agentLaunchErrorAt || null,
        agentAutoCloseCompletedAt: meta.agentAutoCloseCompletedAt || null,
        source: meta.source || null,
      },
    }, { debug: true, context: 'task' });
  }
  return detail;
}

export function presentAgent(task, { now = Date.now(), debug = false } = {}) {
  const meta = taskMeta(task);
  const active = isAgentActiveForProjectTask(task, { now });
  return {
    projectId: task.projectId || null,
    project: task.projectDisplayName || task.project || task.projectId,
    taskId: task.id,
    sessionStatus: sessionState(task, { now, active }),
    startedAt: meta.agentSession?.startedAt || meta.agentLaunchedAt || meta.agentLaunchStartedAt || null,
    elapsed: elapsedSince(meta.agentSession?.startedAt || meta.agentLaunchedAt || meta.agentLaunchStartedAt, now),
    launcherState: launchState(task),
    claimState: task.claimedAt ? 'CLAIMED' : 'UNCLAIMED',
    pid: debug ? (Number(meta.agentSession?.pid) || meta.agentPid || null) : (Number(meta.agentSession?.pid) || null),
  };
}

function subsystem(name, state, extra = {}) {
  return {
    id: name,
    name,
    state: state || 'UNKNOWN',
    lastActivity: extra.lastActivity || null,
    activeTask: extra.activeTask || null,
    errorCount: extra.errorCount ?? 0,
    latencyMs: extra.latencyMs ?? null,
    queueCount: extra.queueCount ?? 0,
    detail: extra.detail || null,
  };
}

function overallState(subsystems) {
  const states = subsystems.map((item) => item.state);
  if (states.includes('ERROR')) return 'DEGRADED';
  if (states.includes('DEGRADED')) return 'DEGRADED';
  if (states.filter((state) => state === 'OFFLINE').length >= 2) return 'DEGRADED';
  const core = subsystems.find((item) => item.id === 'BRIDGE CORE');
  if (core?.state === 'ONLINE') return 'ONLINE';
  return 'UNKNOWN';
}

export function diffActivity(previousTasks, nextTasks) {
  const prevMap = new Map((previousTasks || []).map((task) => [task.id, task]));
  const events = [];
  for (const task of nextTasks || []) {
    const prev = prevMap.get(task.id);
    const meta = taskMeta(task);
    const prevMeta = taskMeta(prev);
    if (!prev) {
      events.push({
        type: 'TASK_RECEIVED',
        taskId: task.id,
        projectId: task.projectId || null,
        message: `${task.id} received`,
      });
      continue;
    }
    if (!prevMeta.githubAckPostedAt && meta.githubAckPostedAt) {
      events.push({ type: 'TASK_ACKNOWLEDGED', taskId: task.id, projectId: task.projectId, message: `${task.id} acknowledged` });
    }
    if (!prevMeta.agentLaunchStartedAt && meta.agentLaunchStartedAt) {
      events.push({ type: 'AGENT_LAUNCH_REQUESTED', taskId: task.id, projectId: task.projectId, message: `${task.id} agent launch requested` });
    }
    if (!prevMeta.agentSession && meta.agentSession) {
      events.push({ type: 'AGENT_SESSION_REGISTERED', taskId: task.id, projectId: task.projectId, message: `${task.id} agent session registered` });
    }
    if (!prev.claimedAt && task.claimedAt) {
      events.push({ type: 'TASK_CLAIMED', taskId: task.id, projectId: task.projectId, message: `${task.id} claimed` });
    }
    if (prev.status !== task.status) {
      const type = task.status === 'COMPLETED'
        ? 'TASK_COMPLETED'
        : task.status === 'CANCELLED'
          ? 'TASK_CANCELLED'
          : task.status === 'FAILED'
            ? 'TASK_COMPLETED'
            : 'TASK_UPDATED';
      events.push({
        type,
        taskId: task.id,
        projectId: task.projectId,
        message: `${task.id} ${prev.status} -> ${task.status}`,
      });
    } else if (ACTIVITY_COMPARE_FIELDS.some((field) => prev[field] !== task[field]) || prev.updatedAt !== task.updatedAt) {
      if (prev.updatedAt !== task.updatedAt) {
        events.push({ type: 'TASK_UPDATED', taskId: task.id, projectId: task.projectId, message: `${task.id} updated` });
      }
    }
    if (!prevMeta.githubResultPostedAt && meta.githubResultPostedAt) {
      events.push({ type: 'RESULT_POSTED', taskId: task.id, projectId: task.projectId, message: `${task.id} result posted` });
    }
    if (prevMeta.githubSourceIssueState !== 'closed' && meta.githubSourceIssueState === 'closed') {
      events.push({ type: 'ISSUE_CLOSED', taskId: task.id, projectId: task.projectId, message: `${task.id} issue closed` });
    }
    if (!prevMeta.agentSessionDeadObservedAt && meta.agentSessionDeadObservedAt) {
      events.push({ type: 'AGENT_RECOVERY', taskId: task.id, projectId: task.projectId, message: `${task.id} agent session lost` });
    }
    prevMap.delete(task.id);
  }
  return events;
}

export async function buildDashboardSnapshot({
  store,
  supervisor = null,
  now = Date.now(),
  debug = false,
  startedAt = null,
  host = '127.0.0.1',
  port = 8787,
  runtimeStatus = undefined,
} = {}) {
  const state = await store.readSnapshot();
  const registry = getProjectRegistry();
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const runtime = runtimeStatus === undefined
    ? await readRelayRuntimeStatus(relayRuntimePathForStore(store.filePath))
    : runtimeStatus;

  let openIssueNumbersByRepo = runtime?.openIssueNumbersByRepo || null;
  const openIssuesKnown = Boolean(runtime?.openIssueNumbersByRepo);

  const relayOwned = Boolean(supervisor?.isOwnedRelayLive?.());
  const observedPid = Number(runtime?.pid);
  const observedLive = Number.isInteger(observedPid) && observedPid > 0 && isPidAlive(observedPid);
  let relayState = 'OFFLINE';
  let relayPid = null;
  let relayOwnedFlag = relayOwned;
  if (relayOwned) {
    relayState = 'ONLINE';
    relayPid = supervisor.relayPid;
  } else if (observedLive) {
    relayState = 'ONLINE';
    relayPid = observedPid;
    relayOwnedFlag = false;
  } else if (runtime && runtime.online === false) {
    relayState = 'OFFLINE';
  }

  const byStatus = countBy(tasks, (task) => task.status);
  const activeAgents = tasks.filter((task) => isAgentActiveForProjectTask(task, { now }));
  const activeTasks = tasks.filter((task) => (
    task.status === 'IN_PROGRESS' || isAgentActiveForProjectTask(task, { now })
  ));

  const githubConfig = (() => {
    try {
      return redactGithubRelayConfig(loadGithubRelayConfig());
    } catch {
      return null;
    }
  })();
  const firebaseConfig = (() => {
    try {
      const config = loadRelayConfig();
      return {
        apiConfigured: Boolean(config.apiUrl),
        tokenConfigured: Boolean(config.token),
        agentId: config.agentId || null,
      };
    } catch {
      return { apiConfigured: false, tokenConfigured: false, agentId: null };
    }
  })();

  const projectViews = registry.projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const counts = countBy(projectTasks, (task) => task.status);
    const active = projectTasks.find((task) => isAgentActiveForProjectTask(task, { now })) || null;
    const activeTask = projectTasks.find((task) => task.status === 'IN_PROGRESS') || active;
    const lastTask = [...projectTasks].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
    const failedBlocked = (counts.FAILED || 0) + (counts.BLOCKED || 0);
    const ws = workspaceHealth(project.workspaceRoot);
    let health = 'ONLINE';
    if (ws.state === 'MISSING') health = 'DEGRADED';
    if ((counts.FAILED || 0) > 0 && (counts.IN_PROGRESS || 0) === 0 && !active) health = health === 'DEGRADED' ? 'DEGRADED' : 'IDLE';
    if (active || (counts.IN_PROGRESS || 0) > 0) health = 'ACTIVE';
    if (ws.state === 'UNKNOWN') health = 'UNKNOWN';
    const view = {
      ...publicProjectView(project, { includeWorkspace: Boolean(debug) }),
      projectId: project.id,
      workspaceState: ws.state,
      health,
      activeAgent: active ? presentAgent(active, { now, debug }) : null,
      activeTask: activeTask ? summarizeTask(activeTask, { debug, now, openIssueNumbersByRepo, openIssuesKnown }) : null,
      lastTask: lastTask ? summarizeTask(lastTask, { debug, now, openIssueNumbersByRepo, openIssuesKnown }) : null,
      counts: {
        READY: counts.READY || 0,
        IN_PROGRESS: counts.IN_PROGRESS || 0,
        COMPLETED: counts.COMPLETED || 0,
        FAILED: counts.FAILED || 0,
        BLOCKED: counts.BLOCKED || 0,
        CANCELLED: counts.CANCELLED || 0,
        FAILED_BLOCKED: failedBlocked,
      },
    };
    return view;
  });

  const summarized = [...tasks]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map((task) => summarizeTask(task, { debug, now, openIssueNumbersByRepo, openIssuesKnown }));

  const storeState = state?.schemaVersion ? 'ONLINE' : 'UNKNOWN';
  const routerState = registry.projects.length ? 'ONLINE' : 'UNKNOWN';
  const agentSubsystemState = activeAgents.length ? 'ACTIVE' : 'IDLE';
  const firebaseState = firebaseConfig.apiConfigured ? 'UNKNOWN' : 'IDLE';
  const coreState = 'ONLINE';

  const lastTaskUpdate = tasks.reduce((latest, task) => {
    const at = task.updatedAt || task.createdAt;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);

  const githubTargets = githubConfig ? buildGithubRelayRepoTargets(loadGithubRelayConfig()) : [];
  const resultPosts = tasks.filter((task) => taskMeta(task).githubResultPostedAt).length;
  const closeOps = tasks.filter((task) => (
    taskMeta(task).githubSourceIssueState === 'closed' || task.status === 'CANCELLED'
  )).length;

  const subsystems = [
    subsystem('BRIDGE CORE', coreState, { lastActivity: startedAt, detail: 'Supervisor HTTP' }),
    subsystem('GITHUB RELAY', relayState, {
      lastActivity: runtime?.lastPollAt || null,
      errorCount: runtime?.errorCount || 0,
      queueCount: runtime?.eligibleIssueCount ?? 0,
      detail: relayOwnedFlag ? 'Supervisor-owned' : (relayPid ? 'Observed' : 'Not owned'),
    }),
    subsystem('TASK STORE', storeState, {
      lastActivity: lastTaskUpdate,
      queueCount: (byStatus.READY || 0) + (byStatus.IN_PROGRESS || 0),
      detail: store.filePath ? 'durable snapshot' : null,
    }),
    subsystem('CURSOR AGENT', agentSubsystemState, {
      lastActivity: activeAgents[0] ? (taskMeta(activeAgents[0]).agentLaunchedAt || null) : null,
      activeTask: activeAgents[0]?.id || null,
      queueCount: activeAgents.length,
    }),
    subsystem('PROJECT ROUTER', routerState, {
      queueCount: registry.projects.length,
      detail: `${registry.projects.length} registered`,
    }),
    subsystem('FIREBASE TRANSPORT', firebaseState, {
      detail: firebaseConfig.apiConfigured ? 'Configured (no live probe)' : 'Not configured',
    }),
    subsystem('PROVIDER LEGACY', 'ONLINE', {
      detail: 'Default production provider',
      queueCount: registry.projects.filter((p) => (p.execution?.mode || 'legacy') === 'legacy').length,
    }),
    subsystem('PROVIDER CURSOR SDK', 'IDLE', {
      detail: 'Opt-in only — disabled for production projects',
    }),
    subsystem('PROVIDER CURSOR ACP', 'IDLE', {
      detail: 'Opt-in only — probe via npm run provider:probe',
    }),
    subsystem('PLAYWRIGHT VERIFY', 'ONLINE', {
      detail: 'Isolated dashboard suite available (npm run test:playwright)',
    }),
  ];

  const providers = {
    legacy: { state: 'ONLINE', default: true },
    'cursor-sdk': { state: 'DISABLED', default: false },
    'cursor-acp': { state: 'DISABLED', default: false },
  };

  const stats = {
    totalTasks: tasks.length,
    READY: byStatus.READY || 0,
    IN_PROGRESS: byStatus.IN_PROGRESS || 0,
    COMPLETED: byStatus.COMPLETED || 0,
    FAILED: byStatus.FAILED || 0,
    BLOCKED: byStatus.BLOCKED || 0,
    CANCELLED: byStatus.CANCELLED || 0,
    activeAgents: activeAgents.length,
    activeProjects: projectViews.filter((project) => project.activeAgent || (project.counts.IN_PROGRESS > 0)).length,
  };

  const github = {
    state: relayState,
    pid: relayPid,
    owned: relayOwnedFlag,
    repositories: githubTargets.map((target) => target.githubRepo),
    lastPollAt: runtime?.lastPollAt || null,
    nextPollAt: runtime?.nextPollAt || null,
    eligibleIssueCount: runtime?.eligibleIssueCount ?? null,
    resultPosts,
    closeOperations: closeOps,
    lastError: runtime?.lastError || supervisor?.lastRelayError || null,
    intervalMs: runtime?.intervalMs || githubConfig?.intervalMs || null,
  };

  const firebase = {
    state: firebaseState,
    apiConfigured: firebaseConfig.apiConfigured,
    inline: { state: firebaseConfig.apiConfigured ? 'UNKNOWN' : 'IDLE', requests: null },
    chunks: { state: firebaseConfig.apiConfigured ? 'UNKNOWN' : 'IDLE', sessions: null },
    lastActivity: null,
  };

  return {
    name: 'YZ DEV BRIDGE',
    subtitle: 'LIVE CONTROL CENTER',
    version: bridgeVersion,
    build: {
      version: bridgeVersion,
      schemaVersion: state.schemaVersion || null,
      root: debug ? BRIDGE_ROOT : undefined,
    },
    host,
    port,
    startedAt,
    now: new Date(now).toISOString(),
    uptimeMs: startedAt ? Math.max(0, now - Date.parse(startedAt)) : 0,
    systemState: overallState(subsystems),
    stats,
    subsystems,
    providers,
    projects: projectViews,
    agents: activeAgents.map((task) => presentAgent(task, { now, debug })),
    activeTasks: activeTasks.map((task) => presentTaskDetail(task, {
      debug, now, openIssueNumbersByRepo, openIssuesKnown,
    })),
    recentTasks: summarized.slice(0, RECENT_LIMIT),
    github,
    firebase,
    store: {
      state: storeState,
      taskCount: tasks.length,
      schemaVersion: state.schemaVersion || null,
    },
    relay: {
      state: relayState,
      pid: relayPid,
      owned: relayOwnedFlag,
      pendingRestartAfterTask: Boolean(supervisor?.pendingRestartAfterTask),
    },
    debug: Boolean(debug),
  };
}

export function compactSsePayload(snapshot) {
  return {
    systemState: snapshot.systemState,
    now: snapshot.now,
    uptimeMs: snapshot.uptimeMs,
    stats: snapshot.stats,
    subsystems: snapshot.subsystems,
    projects: snapshot.projects,
    agents: snapshot.agents,
    activeTasks: snapshot.activeTasks,
    recentTasks: snapshot.recentTasks,
    github: snapshot.github,
    firebase: snapshot.firebase,
    relay: snapshot.relay,
    store: snapshot.store,
    version: snapshot.version,
  };
}
