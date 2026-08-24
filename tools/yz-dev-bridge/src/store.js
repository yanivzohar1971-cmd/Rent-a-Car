import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseJsonBomSafe } from './jsonBom.js';
import {
  getProjectRegistry,
  hydrateTaskProjectFields,
  legacyProjectIdForTask,
  publicProjectView,
  resolveProject,
} from './projects/projectRegistry.js';
import {
  hasCompleteRegisteredAgentSession,
  isRegisteredAgentSessionLive,
} from './agent/agentSessionLiveness.js';

const SCHEMA_VERSION = 1;
export const AGENT_LAUNCH_RETRY_AFTER_MS = 60_000;
/**
 * Bounded grace for LAUNCHING reservations / post-start session handoff.
 * Visible WindowsApps wt.exe + Cursor Agent registration can exceed the short
 * waitForAgentSessionRegistration poll; 60s matches retry cooldown and avoids
 * rapid relaunch loops while still unlocking abandoned reservations.
 */
export const AGENT_LAUNCH_STALE_AFTER_MS = 60_000;
export const GITHUB_BACKLOG_CLEANUP_REASON = 'source-github-issue-closed';
export const GITHUB_BACKLOG_CLEANUP_VERSION = 'stale-github-backlog-v1';
/** Max wait for exclusive cross-process Store lock acquisition. */
export const STORE_LOCK_WAIT_MS = 30_000;
/** Bounded rename/replace attempts for Windows EPERM/EBUSY. */
export const STORE_RENAME_MAX_ATTEMPTS = 10;
export const STORE_RENAME_BASE_DELAY_MS = 25;

export function isPidAlive(pid, killImpl = process.kill.bind(process)) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    killImpl(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but we cannot signal it — treat as alive.
    if (error?.code === 'EPERM') return true;
    return false;
  }
}

export function isTransientFsError(error) {
  const code = String(error?.code || '');
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

export function parseStoreLockOwner(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const firstLine = text.split(/\r?\n/)[0].trim();
  try {
    const parsed = JSON.parse(firstLine);
    if (parsed && typeof parsed === 'object') {
      const pid = Number(parsed.pid);
      if (Number.isInteger(pid) && pid > 0) {
        return {
          pid,
          at: parsed.at ? String(parsed.at) : null,
          file: parsed.file ? String(parsed.file) : null,
        };
      }
    }
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed > 0) {
      return { pid: parsed, at: null, file: null };
    }
  } catch {
    // fall through to plain-integer legacy format
  }
  const pid = Number(firstLine);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid, at: null, file: null };
}

/**
 * Atomic replace with bounded retry for transient Windows rename denials.
 * Does not invent success — exhausted retries rethrow the original error.
 */
export async function renameWithRetry(fromPath, toPath, {
  renameImpl = rename,
  sleepImpl = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  maxAttempts = STORE_RENAME_MAX_ATTEMPTS,
  baseDelayMs = STORE_RENAME_BASE_DELAY_MS,
  onRetry = null,
} = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await renameImpl(fromPath, toPath);
      return { attempts: attempt, recovered: attempt > 1 };
    } catch (error) {
      lastError = error;
      if (!isTransientFsError(error) || attempt >= maxAttempts) throw error;
      if (typeof onRetry === 'function') {
        onRetry({ attempt, code: error?.code || null, message: error?.message || String(error) });
      }
      const delay = baseDelayMs * attempt + Math.floor(Math.random() * 20);
      await sleepImpl(delay);
    }
  }
  throw lastError || new Error('renameWithRetry exhausted without an error');
}

/**
 * Strip temp filenames, UUIDs, and absolute paths from Store/FS error text
 * so normal-mode BBS cards never leak internal rename targets.
 */
export function sanitizeStoreErrorReason(message, code = 'STORE') {
  let text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return code === 'LOCK_TIMEOUT'
      ? 'Bridge lock wait timed out'
      : 'Store operation failed';
  }
  text = text.replace(/'[^']+'/g, "'<path>'");
  text = text.replace(/"[^"]+"/g, '"<path>"');
  text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>');
  text = text.replace(/\b[A-Za-z]:\\[^\s'"]+/g, '<path>');
  text = text.replace(/\/(?:Users|home|tmp|var)\/[^\s'"]+/g, '<path>');
  text = text.replace(/\b[\w.-]+\.tmp\b/gi, '<temp>');
  if (text.length > 120) text = `${text.slice(0, 117)}...`;
  return text;
}

/** Safe classification for console cards — never embeds temp paths/UUIDs. */
export function classifyStoreError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = error?.code
    || (/EPERM/i.test(message) ? 'EPERM'
      : /EBUSY/i.test(message) ? 'EBUSY'
        : /Timed out waiting for bridge lock/i.test(message) ? 'LOCK_TIMEOUT'
          : 'STORE');
  const isStore = isTransientFsError(error)
    || /Timed out waiting for bridge lock/i.test(message)
    || /rename/i.test(message)
    || /bridge lock/i.test(message)
    || code === 'EPERM'
    || code === 'EBUSY'
    || code === 'LOCK_TIMEOUT';
  const operation = isStore
    ? (/lock/i.test(message) || code === 'LOCK_TIMEOUT' ? 'STORE LOCK' : 'STORE COMMIT')
    : 'TICK';
  return {
    component: isStore ? 'Bridge Store' : 'GitHub Relay',
    operation,
    code: String(code),
    status: 'FAILED',
    message,
    safeReason: sanitizeStoreErrorReason(message, String(code)),
  };
}

function taskMetadata(task) {
  return task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
}

function parseIsoAgeMs(iso, nowMs) {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return null;
  return Math.max(0, nowMs - at);
}

function isWithinLaunchGrace(iso, nowMs, staleAfterMs) {
  const age = parseIsoAgeMs(iso, nowMs);
  return age != null && age < staleAfterMs;
}

function wasTaskClaimedByAgent(task) {
  const meta = taskMetadata(task);
  if (task?.claimedBy && task?.claimedAt) return true;
  if (task?.status === 'IN_PROGRESS' && task?.claimedBy) return true;
  if (meta.agentClaimedAt) return true;
  return false;
}

function isTerminalAgentTaskStatus(status) {
  return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
}

export function normalizeGithubRepoKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function isGithubBackedTask(task) {
  const meta = taskMetadata(task);
  return Boolean(String(meta.githubIssueNumber || '').trim());
}

/**
 * Durable GitHub identity: normalized githubRepo + issueNumber.
 * Legacy tasks without githubRepo may still match when projectId aligns.
 */
export function tasksShareGithubIssueIdentity(task, {
  githubIssueNumber,
  githubRepo = null,
  projectId = null,
} = {}) {
  if (!task) return false;
  const issueNumber = String(githubIssueNumber || '').trim();
  if (!issueNumber) return false;
  if (String(task.metadata?.githubIssueNumber || '').trim() !== issueNumber) return false;

  const repoKey = normalizeGithubRepoKey(githubRepo);
  const taskRepo = normalizeGithubRepoKey(task.metadata?.githubRepo);
  if (repoKey && taskRepo) return taskRepo === repoKey;
  if (repoKey && !taskRepo) {
    const projectKey = String(projectId || '').trim().toLowerCase();
    if (!projectKey) return true;
    return legacyProjectIdForTask(task) === projectKey;
  }
  if (!repoKey) return true;
  return false;
}

export function findExistingGithubTask(tasks, {
  githubIssueNumber,
  githubRepo = null,
  projectId = null,
} = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  return list.find((task) => tasksShareGithubIssueIdentity(task, {
    githubIssueNumber,
    githubRepo,
    projectId,
  })) || null;
}

export function isGithubSourceIssueOpen(task, openIssueNumbers) {
  if (!isGithubBackedTask(task)) return true;
  if (!openIssueNumbers) return true;
  const open = openIssueNumbers instanceof Set
    ? openIssueNumbers
    : new Set([...openIssueNumbers].map((value) => String(value)));
  return open.has(String(task.metadata.githubIssueNumber).trim());
}

/**
 * Launch eligibility for Store predicates (no network).
 * GitHub-backed tasks marked closed-source are never launchable.
 */
export function isTaskEligibleForAgentLaunch(task, {
  now = Date.now(),
  staleAfterMs = AGENT_LAUNCH_STALE_AFTER_MS,
  retryAfterMs = AGENT_LAUNCH_RETRY_AFTER_MS,
  openIssueNumbers = null,
} = {}) {
  if (!task || task.status !== 'READY') return false;
  const meta = taskMetadata(task);
  if (meta.projectRoutingError) return false;
  if (meta.cleanupReason === GITHUB_BACKLOG_CLEANUP_REASON) return false;
  if (meta.githubSourceIssueState === 'closed') return false;
  if (isGithubBackedTask(task) && openIssueNumbers != null && !isGithubSourceIssueOpen(task, openIssueNumbers)) {
    return false;
  }
  if (meta.agentLaunchedAt || meta.agentLaunchStartedAt) return false;
  const errorAt = Date.parse(meta.agentLaunchErrorAt || '');
  if (Number.isFinite(errorAt) && now - errorAt < retryAfterMs) return false;
  const recoveryAt = Date.parse(meta.agentRecoveryAt || '');
  if (Number.isFinite(recoveryAt) && now - recoveryAt < retryAfterMs) return false;
  void staleAfterMs;
  return true;
}

/**
 * CURRENT project-Agent occupancy after reconciliation semantics.
 * Does not probe processes; consume durable fields + launch grace only.
 */
export function isAgentActiveForProjectTask(task, {
  now = Date.now(),
  staleAfterMs = AGENT_LAUNCH_STALE_AFTER_MS,
} = {}) {
  if (!task) return false;
  const meta = taskMetadata(task);
  if (meta.agentAutoCloseCompletedAt) return false;
  if (meta.agentLifecycleInactiveAt && !meta.agentLaunchStartedAt && !meta.agentLaunchedAt) {
    return false;
  }

  // A. LAUNCHING — reservation without completed launch, only during grace.
  if (meta.agentLaunchStartedAt && !meta.agentLaunchedAt && !meta.agentLaunchErrorAt) {
    return isWithinLaunchGrace(meta.agentLaunchStartedAt, now, staleAfterMs);
  }

  if (!meta.agentLaunchedAt) return false;

  const hasSession = hasCompleteRegisteredAgentSession(meta.agentSession);
  if (meta.agentSessionDeadObservedAt && !hasSession) return false;

  if (hasSession) {
    // Optimistic: complete registered session counts active until reconcile marks it dead.
    if (isTerminalAgentTaskStatus(task.status)) {
      return !meta.agentAutoCloseCompletedAt;
    }
    return true;
  }

  // Launched / handoff window without a registered session yet — grace only.
  // Do NOT treat launcher/wt shim PID survival as proof of Agent liveness.
  if (isTerminalAgentTaskStatus(task.status)) return false;
  const anchor = meta.agentLaunchedAt || meta.agentLaunchStartedAt;
  return isWithinLaunchGrace(anchor, now, staleAfterMs);
}

function snapshotAgentRecoveryPreviousState(task) {
  const meta = taskMetadata(task);
  return {
    status: task.status || null,
    claimedBy: task.claimedBy || null,
    claimedAt: task.claimedAt || null,
    agentLaunchStartedAt: meta.agentLaunchStartedAt || null,
    agentLaunchedAt: meta.agentLaunchedAt || null,
    agentPid: meta.agentPid ?? null,
    agentLaunchMethod: meta.agentLaunchMethod || null,
    hadAgentSession: hasCompleteRegisteredAgentSession(meta.agentSession),
    agentSessionPid: meta.agentSession?.pid ?? null,
    agentSessionStartedAt: meta.agentSession?.startedAt || null,
    agentAutoCloseCompletedAt: meta.agentAutoCloseCompletedAt || null,
  };
}

function clearAgentReservationFields(meta, {
  timestamp,
  reason,
  action,
  previousState,
  markSessionDead = false,
  markAutoCloseCompleted = false,
}) {
  return {
    ...meta,
    agentLaunchStartedAt: null,
    agentLaunchedAt: null,
    agentPid: null,
    agentSession: null,
    agentLaunchError: meta.agentLaunchError || null,
    agentLaunchErrorAt: meta.agentLaunchErrorAt || null,
    agentLifecycleInactiveAt: timestamp,
    agentRecoveryAt: timestamp,
    agentRecoveryReason: reason,
    agentRecoveryAction: action,
    agentRecoveryPreviousState: previousState,
    agentSessionDeadObservedAt: markSessionDead ? timestamp : (meta.agentSessionDeadObservedAt || null),
    agentAutoCloseCompletedAt: markAutoCloseCompleted
      ? (meta.agentAutoCloseCompletedAt || timestamp)
      : (meta.agentAutoCloseCompletedAt || null),
  };
}

/**
 * Decide whether a task needs stale-Agent recovery.
 * Process liveness is injected; default uses registered session identity.
 */
export function evaluateAgentLifecycleTransition(task, {
  now = Date.now(),
  staleAfterMs = AGENT_LAUNCH_STALE_AFTER_MS,
  isSessionProcessLive = null,
} = {}) {
  if (!task) return { action: 'none' };
  const meta = taskMetadata(task);
  const timestamp = new Date(now).toISOString();
  const sessionLive = hasCompleteRegisteredAgentSession(meta.agentSession)
    ? isRegisteredAgentSessionLive(meta.agentSession, { isSessionProcessLive })
    : false;
  const previousState = snapshotAgentRecoveryPreviousState(task);

  // Already released for this reservation generation.
  if (
    meta.agentLifecycleInactiveAt
    && !meta.agentLaunchStartedAt
    && !meta.agentLaunchedAt
    && !hasCompleteRegisteredAgentSession(meta.agentSession)
  ) {
    return { action: 'none' };
  }

  // A. LAUNCHING reservation
  if (meta.agentLaunchStartedAt && !meta.agentLaunchedAt && !meta.agentLaunchErrorAt) {
    if (isWithinLaunchGrace(meta.agentLaunchStartedAt, now, staleAfterMs)) {
      return { action: 'none', state: 'launching' };
    }
    // Grace expired without a live registered session → PRE-CLAIM recovery.
    if (wasTaskClaimedByAgent(task) || task.status === 'IN_PROGRESS') {
      return {
        action: 'block-post-claim',
        reason: 'agent-session-lost',
        detail: 'stale-launch-after-claim',
        timestamp,
        previousState,
      };
    }
    return {
      action: 'release-pre-claim',
      reason: 'stale-launch-reservation',
      timestamp,
      previousState,
    };
  }

  if (!meta.agentLaunchedAt && !hasCompleteRegisteredAgentSession(meta.agentSession)) {
    return { action: 'none' };
  }

  if (meta.agentAutoCloseCompletedAt) {
    return { action: 'none', state: 'inactive' };
  }

  const hasSession = hasCompleteRegisteredAgentSession(meta.agentSession);

  if (hasSession) {
    // Registered session is protected during launch/handoff grace so WindowsApps wt
    // shim disappearance and brief startup windows do not false-stale the Agent.
    // After grace, require exact registered-session liveness (pid + StartTime).
    // Prefer agentLaunchedAt (Store clock) over session.registeredAt so brief
    // handoff windows stay protected even when session timestamps are older fixtures.
    const sessionAnchor = meta.agentLaunchedAt
      || meta.agentSession?.registeredAt
      || meta.agentLaunchStartedAt;
    if (isWithinLaunchGrace(sessionAnchor, now, staleAfterMs)) {
      return { action: 'none', state: 'active' };
    }
    if (sessionLive) {
      return { action: 'none', state: 'active' };
    }
    if (isTerminalAgentTaskStatus(task.status)) {
      return {
        action: 'release-terminal',
        reason: 'terminal-dead-session',
        timestamp,
        previousState,
      };
    }
    if (wasTaskClaimedByAgent(task) || task.status === 'IN_PROGRESS') {
      return {
        action: 'block-post-claim',
        reason: 'agent-session-lost',
        timestamp,
        previousState,
      };
    }
    return {
      action: 'release-pre-claim',
      reason: 'dead-session-pre-claim',
      timestamp,
      previousState,
    };
  }

  // Launched without complete registered session (or session cleared) — grace then stale.
  const anchor = meta.agentLaunchedAt || meta.agentLaunchStartedAt;
  if (isWithinLaunchGrace(anchor, now, staleAfterMs)) {
    return { action: 'none', state: 'launching' };
  }

  if (isTerminalAgentTaskStatus(task.status)) {
    return {
      action: 'release-terminal',
      reason: 'terminal-dead-session',
      timestamp,
      previousState,
    };
  }

  if (wasTaskClaimedByAgent(task) || task.status === 'IN_PROGRESS') {
    return {
      action: 'block-post-claim',
      reason: 'agent-session-lost',
      detail: 'launched-without-live-session',
      timestamp,
      previousState,
    };
  }

  return {
    action: 'release-pre-claim',
    reason: 'stale-launch-reservation',
    detail: 'launched-without-live-session',
    timestamp,
    previousState,
  };
}

function applyAgentLifecycleTransition(task, transition) {
  if (!transition || transition.action === 'none') return null;
  const timestamp = transition.timestamp || nowIso();
  const meta = taskMetadata(task);
  const previousState = transition.previousState || snapshotAgentRecoveryPreviousState(task);

  if (transition.action === 'release-pre-claim') {
    task.metadata = clearAgentReservationFields(meta, {
      timestamp,
      reason: transition.reason,
      action: 'released-for-retry',
      previousState,
      markSessionDead: true,
    });
    task.updatedAt = timestamp;
    return {
      taskId: task.id,
      projectId: legacyProjectIdForTask(task),
      project: hydrateTaskProjectFields(task).project || task.project,
      action: 'released-for-retry',
      reason: transition.reason,
      previous: previousState,
      status: task.status,
    };
  }

  if (transition.action === 'block-post-claim') {
    task.status = 'BLOCKED';
    task.summary = task.summary || 'Agent session lost; manual review required (agent-session-lost).';
    task.notes = Array.isArray(task.notes) ? task.notes : [];
    task.notes.push({
      at: timestamp,
      by: 'yz-dev-bridge',
      text: 'agent-session-lost: registered Agent process is gone; project reservation released; do not auto-rerun.',
    });
    task.metadata = clearAgentReservationFields(meta, {
      timestamp,
      reason: transition.reason || 'agent-session-lost',
      action: 'blocked-manual-review',
      previousState,
      markSessionDead: true,
    });
    task.metadata.agentBlockedReason = 'agent-session-lost';
    task.updatedAt = timestamp;
    return {
      taskId: task.id,
      projectId: legacyProjectIdForTask(task),
      project: hydrateTaskProjectFields(task).project || task.project,
      action: 'blocked-manual-review',
      reason: transition.reason || 'agent-session-lost',
      previous: previousState,
      status: task.status,
    };
  }

  if (transition.action === 'release-terminal') {
    task.metadata = {
      ...clearAgentReservationFields(meta, {
        timestamp,
        reason: transition.reason,
        action: 'released-inactive',
        previousState,
        markSessionDead: true,
        markAutoCloseCompleted: true,
      }),
      // Preserve last known session identity under recovery snapshot only; reservation cleared.
      agentSession: null,
    };
    task.updatedAt = timestamp;
    return {
      taskId: task.id,
      projectId: legacyProjectIdForTask(task),
      project: hydrateTaskProjectFields(task).project || task.project,
      action: 'released-inactive',
      reason: transition.reason,
      previous: previousState,
      status: task.status,
    };
  }

  return null;
}

function applyClosedGithubSourceCancellation(task, {
  timestamp = nowIso(),
  reason = GITHUB_BACKLOG_CLEANUP_REASON,
  cleanupVersion = GITHUB_BACKLOG_CLEANUP_VERSION,
} = {}) {
  if (!task || isTerminalAgentTaskStatus(task.status)) return null;
  if (!isGithubBackedTask(task)) return null;
  if (task.metadata?.cleanupReason === reason && task.status === 'CANCELLED') return null;

  const previousState = snapshotAgentRecoveryPreviousState(task);
  const previousStatus = task.status;
  const meta = taskMetadata(task);

  task.status = 'CANCELLED';
  task.completedAt = timestamp;
  task.summary = task.summary || 'Cancelled: source GitHub issue is closed (stale backlog).';
  task.notes = Array.isArray(task.notes) ? task.notes : [];
  task.notes.push({
    at: timestamp,
    by: 'yz-dev-bridge',
    text: `${reason}: source GitHub issue closed; archival cancel; project reservation released.`,
  });
  task.metadata = {
    ...clearAgentReservationFields(meta, {
      timestamp,
      reason,
      action: 'cancelled-closed-source',
      previousState,
      markSessionDead: true,
      markAutoCloseCompleted: true,
    }),
    cleanupReason: reason,
    cleanupAt: timestamp,
    cleanupVersion,
    githubSourceIssueState: 'closed',
    agentBlockedReason: meta.agentBlockedReason || null,
  };
  task.updatedAt = timestamp;

  return {
    taskId: task.id,
    projectId: legacyProjectIdForTask(task),
    project: hydrateTaskProjectFields(task).project || task.project,
    previousStatus,
    reason,
    cleanupVersion,
    status: task.status,
  };
}

function reviveClosedSourceGithubTask(task, { timestamp = nowIso() } = {}) {
  if (!task || task.status !== 'CANCELLED') return false;
  if (task.metadata?.cleanupReason !== GITHUB_BACKLOG_CLEANUP_REASON) return false;
  task.status = 'READY';
  task.completedAt = null;
  task.summary = null;
  task.claimedBy = null;
  task.claimedAt = null;
  const meta = taskMetadata(task);
  task.metadata = {
    ...meta,
    cleanupReason: null,
    cleanupAt: meta.cleanupAt || null,
    cleanupVersion: meta.cleanupVersion || null,
    githubSourceIssueState: 'open',
    revivedFromClosedSourceAt: timestamp,
    agentLaunchStartedAt: null,
    agentLaunchedAt: null,
    agentPid: null,
    agentSession: null,
    agentLifecycleInactiveAt: null,
    agentBlockedReason: null,
  };
  task.notes = Array.isArray(task.notes) ? task.notes : [];
  task.notes.push({
    at: timestamp,
    by: 'yz-dev-bridge',
    text: 'Revived READY: source GitHub issue is open again after closed-source archival cancel.',
  });
  task.updatedAt = timestamp;
  return true;
}

export function isTaskEligibleForCompletedAgentAutoClose(task) {
  if (!task || task.status !== 'COMPLETED') return false;
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  if (!meta.githubIssueNumber) return false;
  if (!meta.githubResultPostedAt) return false;
  if (meta.agentAutoCloseStartedAt || meta.agentAutoCloseCompletedAt || meta.agentAutoCloseErrorAt) return false;
  const session = meta.agentSession && typeof meta.agentSession === 'object' ? meta.agentSession : null;
  if (!session?.pid || !session?.startedAt || !session?.nonce || !session?.file) return false;
  return true;
}
const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_FILE = resolve(BRIDGE_ROOT, 'data', 'bridge.json');
const DEFAULT_STATE = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  sequence: 0,
  tasks: [],
  contexts: {},
});

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeProjectToken(value) {
  const project = String(value ?? '').trim();
  if (!project) throw new Error('project is required');
  return project;
}

function resolveRegisteredProject(token) {
  return resolveProject(normalizeProjectToken(token), {
    registry: getProjectRegistry(),
    requireEnabled: true,
  });
}

function projectFilterMatches(task, filterToken) {
  if (!filterToken) return true;
  const needle = String(filterToken).trim().toLowerCase();
  if (!needle) return true;
  const hydrated = hydrateTaskProjectFields(task);
  return [
    hydrated.projectId,
    hydrated.project,
    hydrated.projectDisplayName,
  ].some((value) => String(value || '').trim().toLowerCase() === needle
    || String(value || '').trim().toLowerCase().replace(/_/g, '-') === needle.replace(/_/g, '-'));
}

function presentTask(task) {
  if (!task) return null;
  return hydrateTaskProjectFields(task);
}

function buildTaskProjectFields(projectInput) {
  const registered = resolveRegisteredProject(projectInput);
  return {
    projectId: registered.id,
    project: registered.displayName,
    projectDisplayName: registered.displayName,
  };
}

function normalizeActor(value, fallback = 'unknown') {
  const actor = String(value ?? '').trim();
  return actor || fallback;
}

function normalizeStatus(value) {
  const status = String(value ?? '').toUpperCase();
  const allowed = new Set(['READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED']);
  if (!allowed.has(status)) throw new Error(`Invalid task status: ${value}`);
  return status;
}

function normalizePriority(value) {
  const priority = String(value ?? 'normal').toLowerCase();
  const allowed = new Set(['low', 'normal', 'high', 'critical']);
  if (!allowed.has(priority)) throw new Error(`Invalid priority: ${value}`);
  return priority;
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function sanitizeAgentSession(value) {
  if (!value || typeof value !== 'object') return null;
  const pid = Number(value.pid);
  return {
    nonce: value.nonce ? String(value.nonce) : null,
    file: value.file ? String(value.file) : null,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: value.startedAt ? String(value.startedAt) : null,
    registeredAt: value.registeredAt ? String(value.registeredAt) : null,
    taskId: value.taskId ? String(value.taskId) : null,
    workspace: value.workspace ? String(value.workspace) : null,
  };
}

export class BridgeStore {
  constructor(filePath = process.env.BRIDGE_DATA_FILE || DEFAULT_DATA_FILE, options = {}) {
    this.filePath = isAbsolute(filePath) ? filePath : resolve(filePath);
    this._queue = Promise.resolve();
    this.lockPath = `${this.filePath}.lock`;
    this._renameImpl = typeof options.renameImpl === 'function' ? options.renameImpl : rename;
    this._sleepImpl = typeof options.sleepImpl === 'function'
      ? options.sleepImpl
      : (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
    this._pidAliveImpl = typeof options.pidAliveImpl === 'function'
      ? options.pidAliveImpl
      : isPidAlive;
    this._isSessionProcessLive = typeof options.isSessionProcessLive === 'function'
      ? options.isSessionProcessLive
      : null;
    this._lockWaitMs = Number.isFinite(options.lockWaitMs) ? options.lockWaitMs : STORE_LOCK_WAIT_MS;
    this._renameMaxAttempts = Number.isFinite(options.renameMaxAttempts)
      ? options.renameMaxAttempts
      : STORE_RENAME_MAX_ATTEMPTS;
    this._staleAfterMs = Number.isFinite(options.agentLaunchStaleAfterMs)
      ? options.agentLaunchStaleAfterMs
      : AGENT_LAUNCH_STALE_AFTER_MS;
    this.lastCommitMeta = null;
    this.lastAgentRecoveryMeta = null;
    this.lastGithubSourceCleanupMeta = null;
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      await writeFile(this.filePath, `${JSON.stringify(cloneDefaultState(), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }

  async _readState() {
    await this.init();
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = parseJsonBomSafe(raw, { source: this.filePath });
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported bridge schema version: ${parsed.schemaVersion}`);
    }
    return parsed;
  }

  async _writeState(state) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(tmp, 'w');
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
      if (typeof handle.sync === 'function') {
        await handle.sync().catch(() => undefined);
      }
    } finally {
      if (handle) await handle.close().catch(() => undefined);
    }

    try {
      const commit = await renameWithRetry(tmp, this.filePath, {
        renameImpl: this._renameImpl,
        sleepImpl: this._sleepImpl,
        maxAttempts: this._renameMaxAttempts,
      });
      this.lastCommitMeta = commit;
      return commit;
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }

  async _sleep(ms) {
    await this._sleepImpl(ms);
  }

  async _readLockOwner() {
    try {
      const raw = await readFile(this.lockPath, 'utf8');
      return parseStoreLockOwner(raw);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      return null;
    }
  }

  async _withFileLock(action) {
    const deadline = Date.now() + this._lockWaitMs;
    while (true) {
      let handle;
      try {
        handle = await open(this.lockPath, 'wx');
        const meta = JSON.stringify({
          pid: process.pid,
          at: nowIso(),
          file: basename(this.filePath),
        });
        await handle.writeFile(`${meta}\n`, 'utf8');
        try {
          return await action();
        } finally {
          await handle.close().catch(() => undefined);
          handle = undefined;
          await unlink(this.lockPath).catch(() => undefined);
        }
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        if (error?.code !== 'EEXIST') throw error;

        const owner = await this._readLockOwner();
        // Steal only when the owning PID is proven dead. Never steal a live lock.
        if (owner?.pid && !this._pidAliveImpl(owner.pid)) {
          await unlink(this.lockPath).catch(() => undefined);
          continue;
        }

        if (Date.now() >= deadline) {
          const ownerLabel = owner?.pid != null ? String(owner.pid) : 'unknown';
          throw new Error(`Timed out waiting for bridge lock (ownerPid=${ownerLabel})`);
        }
        await this._sleep(40 + Math.floor(Math.random() * 80));
      }
    }
  }

  async _mutate(mutator) {
    const run = () => this._withFileLock(async () => {
      // CRITICAL: always reload durable state AFTER acquiring the cross-process lock.
      const state = await this._readState();
      const result = await mutator(state);
      await this._writeState(state);
      return result;
    });
    const next = this._queue.then(run, run);
    this._queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async createTask({ project, projectId, title, instructions, priority = 'normal', createdBy = 'chatgpt', metadata = {} }) {
    return this._mutate((state) => {
      const projectFields = buildTaskProjectFields(projectId || project);
      const cleanTitle = String(title ?? '').trim();
      const cleanInstructions = String(instructions ?? '').trim();
      if (!cleanTitle) throw new Error('title is required');
      if (!cleanInstructions) throw new Error('instructions is required');

      state.sequence += 1;
      const timestamp = nowIso();
      const task = {
        id: `TASK-${String(state.sequence).padStart(5, '0')}`,
        ...projectFields,
        title: cleanTitle,
        instructions: cleanInstructions,
        priority: normalizePriority(priority),
        status: 'READY',
        createdBy: normalizeActor(createdBy, 'chatgpt'),
        createdAt: timestamp,
        updatedAt: timestamp,
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        summary: null,
        changedFiles: [],
        tests: [],
        notes: [],
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      };
      state.tasks.push(task);
      return presentTask(task);
    });
  }

  async importFirebaseTask({
    firebaseTaskId,
    project,
    projectId,
    title,
    instructions,
    priority = 'normal',
    createdBy = 'firebase-relay',
    requestId = null,
    source = 'firebase-relay',
  }) {
    return this._mutate((state) => {
      const existing = state.tasks.find((task) => task.metadata?.firebaseTaskId === firebaseTaskId);
      if (existing) return { task: presentTask(existing), created: false };

      const projectFields = buildTaskProjectFields(projectId || project);
      const cleanTitle = String(title ?? '').trim();
      const cleanInstructions = String(instructions ?? '').trim();
      if (!firebaseTaskId) throw new Error('firebaseTaskId is required');
      if (!cleanTitle) throw new Error('title is required');
      if (!cleanInstructions) throw new Error('instructions is required');

      state.sequence += 1;
      const timestamp = nowIso();
      const task = {
        id: `TASK-${String(state.sequence).padStart(5, '0')}`,
        ...projectFields,
        title: cleanTitle,
        instructions: cleanInstructions,
        priority: normalizePriority(priority),
        status: 'READY',
        createdBy: normalizeActor(createdBy, 'firebase-relay'),
        createdAt: timestamp,
        updatedAt: timestamp,
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        summary: null,
        changedFiles: [],
        tests: [],
        notes: [],
        metadata: {
          firebaseTaskId: String(firebaseTaskId),
          requestId: requestId || null,
          source: source || 'firebase-relay',
          relayPublishedAt: null,
        },
      };
      state.tasks.push(task);
      return { task: presentTask(task), created: true };
    });
  }

  async findByFirebaseTaskId(firebaseTaskId) {
    const state = await this._readState();
    return presentTask(state.tasks.find((task) => task.metadata?.firebaseTaskId === firebaseTaskId) ?? null);
  }

  async listFirebaseRelayTasks() {
    const state = await this._readState();
    return state.tasks.filter((task) => Boolean(task.metadata?.firebaseTaskId)).map((task) => presentTask(task));
  }

  async markRelayPublished({ id, firebaseStatus }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        relayPublishedAt: nowIso(),
        relayPublishedStatus: firebaseStatus || task.status,
      };
      task.updatedAt = nowIso();
      return presentTask(task);
    });
  }

  async importGithubTask({
    githubIssueNumber,
    githubIssueUrl,
    githubIssueTitle,
    githubRepo = null,
    project,
    projectId,
    title,
    instructions,
    priority = 'normal',
    createdBy = 'github-relay',
    source = 'github-inbox',
    projectRoutingError = null,
    projectResolutionSource = null,
  }) {
    return this._mutate((state) => {
      const issueNumber = String(githubIssueNumber || '').trim();
      if (!issueNumber) throw new Error('githubIssueNumber is required');
      const repoKey = normalizeGithubRepoKey(githubRepo);
      const resolvedProjectId = projectId || project || null;
      const existing = findExistingGithubTask(state.tasks, {
        githubIssueNumber: issueNumber,
        githubRepo: repoKey || null,
        projectId: resolvedProjectId,
      });
      if (existing) {
        const revived = reviveClosedSourceGithubTask(existing);
        if (repoKey && !normalizeGithubRepoKey(existing.metadata?.githubRepo)) {
          existing.metadata = {
            ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
            githubRepo: githubRepo || null,
          };
          existing.updatedAt = nowIso();
        }
        return { task: presentTask(existing), created: false, revived: Boolean(revived) };
      }

      let projectFields;
      if (projectRoutingError) {
        // Persist a non-launchable record for visibility; default identity for storage only.
        projectFields = buildTaskProjectFields(projectId || project || 'rent-a-car');
      } else {
        projectFields = buildTaskProjectFields(projectId || project);
      }
      const cleanTitle = String(title ?? '').trim();
      const cleanInstructions = String(instructions ?? '').trim();
      if (!cleanTitle) throw new Error('title is required');
      if (!cleanInstructions) throw new Error('instructions is required');

      state.sequence += 1;
      const timestamp = nowIso();
      const task = {
        id: `TASK-${String(state.sequence).padStart(5, '0')}`,
        ...projectFields,
        title: cleanTitle,
        instructions: cleanInstructions,
        priority: normalizePriority(priority),
        status: projectRoutingError ? 'FAILED' : 'READY',
        createdBy: normalizeActor(createdBy, 'github-relay'),
        createdAt: timestamp,
        updatedAt: timestamp,
        claimedBy: null,
        claimedAt: null,
        completedAt: projectRoutingError ? timestamp : null,
        summary: projectRoutingError ? String(projectRoutingError) : null,
        changedFiles: [],
        tests: [],
        notes: [],
        metadata: {
          source: source || 'github-inbox',
          githubIssueNumber: issueNumber,
          githubIssueUrl: githubIssueUrl || null,
          githubIssueTitle: githubIssueTitle || cleanTitle,
          githubRepo: githubRepo || null,
          githubSourceIssueState: projectRoutingError ? null : 'open',
          projectResolutionSource: projectResolutionSource || null,
          projectRoutingError: projectRoutingError || null,
          githubAckPostedAt: null,
          githubResultPostedAt: null,
          agentLaunchedAt: null,
          agentLaunchStartedAt: null,
          agentPid: null,
          agentSession: null,
          agentAutoCloseStartedAt: null,
          agentAutoCloseCompletedAt: null,
          agentAutoCloseError: null,
          agentAutoCloseErrorAt: null,
        },
      };
      state.tasks.push(task);
      return { task: presentTask(task), created: true, revived: false };
    });
  }

  /**
   * Cancel non-terminal GitHub-backed tasks whose source issue is not in the
   * current open-issue set for a trusted repository. Idempotent.
   */
  async cancelGithubTasksWithClosedSources({
    githubRepo,
    openIssueNumbers = [],
    projectId = null,
    ownsLegacyGithubTasks = false,
    reason = GITHUB_BACKLOG_CLEANUP_REASON,
    cleanupVersion = GITHUB_BACKLOG_CLEANUP_VERSION,
    now = Date.now(),
  } = {}) {
    const repoKey = normalizeGithubRepoKey(githubRepo);
    if (!repoKey) throw new Error('githubRepo is required for closed-source reconciliation');
    const open = new Set([...openIssueNumbers].map((value) => String(value)));
    const timestamp = new Date(now).toISOString();

    return this._mutate((state) => {
      const cancelled = [];
      for (const task of state.tasks) {
        if (!isGithubBackedTask(task)) continue;
        if (isTerminalAgentTaskStatus(task.status)) continue;

        const taskRepo = normalizeGithubRepoKey(task.metadata?.githubRepo);
        if (taskRepo) {
          if (taskRepo !== repoKey) continue;
        } else if (!ownsLegacyGithubTasks) {
          continue;
        } else if (projectId && legacyProjectIdForTask(task) !== String(projectId).trim().toLowerCase()) {
          continue;
        }

        const issueNumber = String(task.metadata.githubIssueNumber).trim();
        if (open.has(issueNumber)) {
          if (task.metadata?.githubSourceIssueState !== 'open') {
            task.metadata = {
              ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
              githubSourceIssueState: 'open',
            };
            task.updatedAt = timestamp;
          }
          continue;
        }

        const applied = applyClosedGithubSourceCancellation(task, {
          timestamp,
          reason,
          cleanupVersion,
        });
        if (applied) cancelled.push(applied);
      }
      this.lastGithubSourceCleanupMeta = {
        at: timestamp,
        githubRepo: repoKey,
        count: cancelled.length,
        cancelled,
      };
      return { cancelled, count: cancelled.length };
    });
  }

  async findByGithubIssueNumber(githubIssueNumber, githubRepo = null, projectId = null) {
    const state = await this._readState();
    const found = findExistingGithubTask(state.tasks, {
      githubIssueNumber,
      githubRepo,
      projectId,
    });
    return presentTask(found);
  }

  async listGithubRelayTasks() {
    const state = await this._readState();
    return state.tasks.filter((task) => Boolean(task.metadata?.githubIssueNumber)).map((task) => presentTask(task));
  }

  async markGithubAckPosted({ id }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (task.metadata?.githubAckPostedAt) return presentTask(task);
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        githubAckPostedAt: nowIso(),
      };
      task.updatedAt = nowIso();
      return presentTask(task);
    });
  }

  async markGithubResultPosted({ id }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (task.metadata?.githubResultPostedAt) return { task: presentTask(task), posted: false };
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        githubResultPostedAt: nowIso(),
      };
      task.updatedAt = nowIso();
      return { task: presentTask(task), posted: true };
    });
  }

  /**
   * Idempotent stale-Agent / stale-reservation recovery.
   * Prefer running before listTasksEligibleForAgentLaunch / beginAgentLaunch.
   */
  async reconcileAgentLifecycles({
    now = Date.now(),
    isSessionProcessLive = this._isSessionProcessLive,
    staleAfterMs = this._staleAfterMs,
  } = {}) {
    return this._mutate((state) => {
      const transitions = [];
      for (const task of state.tasks) {
        const decision = evaluateAgentLifecycleTransition(task, {
          now,
          staleAfterMs,
          isSessionProcessLive,
        });
        const applied = applyAgentLifecycleTransition(task, decision);
        if (applied) transitions.push(applied);
      }
      this.lastAgentRecoveryMeta = {
        at: new Date(now).toISOString(),
        count: transitions.length,
        transitions,
      };
      return {
        recovered: transitions,
        count: transitions.length,
      };
    });
  }

  async beginAgentLaunch({ id, now = Date.now() } = {}) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const activeOpts = { now, staleAfterMs: this._staleAfterMs };
      // Current reservation only — reconciled stale metadata must not permanently lock.
      if (isAgentActiveForProjectTask(task, activeOpts)
        && (task.metadata?.agentLaunchedAt || task.metadata?.agentLaunchStartedAt)) {
        return { task: presentTask(task), started: false, reason: 'already-reserved' };
      }
      if (task.metadata?.agentLaunchedAt || task.metadata?.agentLaunchStartedAt) {
        // Stale fields that somehow remain but are not current-active: treat as reserved
        // only when still within grace; otherwise refuse with already-reserved until
        // reconcile clears them (caller should reconcile first).
        return { task: presentTask(task), started: false, reason: 'already-reserved' };
      }
      if (task.metadata?.projectRoutingError) {
        return { task: presentTask(task), started: false, reason: 'project-routing-error' };
      }
      const errorAt = Date.parse(task.metadata?.agentLaunchErrorAt || '');
      if (Number.isFinite(errorAt) && now - errorAt < AGENT_LAUNCH_RETRY_AFTER_MS) {
        return { task: presentTask(task), started: false, reason: 'retry-backoff' };
      }
      const recoveryAt = Date.parse(task.metadata?.agentRecoveryAt || '');
      if (Number.isFinite(recoveryAt) && now - recoveryAt < AGENT_LAUNCH_RETRY_AFTER_MS) {
        return { task: presentTask(task), started: false, reason: 'retry-backoff' };
      }
      const projectId = legacyProjectIdForTask(task);
      const blocking = state.tasks.find((other) => (
        other.id !== id
        && legacyProjectIdForTask(other) === projectId
        && isAgentActiveForProjectTask(other, activeOpts)
      ));
      if (blocking) {
        return {
          task: presentTask(task),
          started: false,
          reason: 'project-busy',
          blockingTaskId: blocking.id,
        };
      }
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        agentLaunchStartedAt: new Date(now).toISOString(),
        // New reservation supersedes prior recovery markers for occupancy.
        agentLifecycleInactiveAt: null,
      };
      task.updatedAt = new Date(now).toISOString();
      return { task: presentTask(task), started: true };
    });
  }

  async markAgentLaunched({ id, pid = null, error = null, method = null, session = null }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        agentLaunchedAt: error ? null : nowIso(),
        agentLaunchStartedAt: error ? null : (task.metadata?.agentLaunchStartedAt || nowIso()),
        agentLaunchError: error || null,
        agentLaunchErrorAt: error ? nowIso() : null,
        agentPid: pid == null ? null : Number(pid),
        agentLaunchMethod: method || null,
        agentSession: error ? null : sanitizeAgentSession(session),
        agentAutoCloseStartedAt: error ? null : null,
        agentAutoCloseCompletedAt: error ? null : null,
        agentAutoCloseError: error ? null : null,
        agentAutoCloseErrorAt: error ? null : null,
      };
      task.updatedAt = nowIso();
      return presentTask(task);
    });
  }

  async markAgentSessionRegistered({ id, session }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const current = sanitizeAgentSession(task.metadata?.agentSession);
      const incoming = sanitizeAgentSession(session);
      if (!incoming?.nonce) throw new Error(`Task ${id} agent session nonce is required`);
      if (current?.nonce && current.nonce !== incoming.nonce) {
        return { task: presentTask(task), updated: false };
      }
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        agentSession: {
          ...(current || {}),
          ...incoming,
        },
      };
      task.updatedAt = nowIso();
      return { task: presentTask(task), updated: true };
    });
  }

  async listTasksEligibleForCompletedAgentAutoClose({ project, limit = 50 } = {}) {
    const cleanProject = project ? String(project).trim() : null;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    return (await this.listTasks({ project: cleanProject, status: 'COMPLETED', limit: 200 }))
      .filter((task) => isTaskEligibleForCompletedAgentAutoClose(task))
      .slice(0, safeLimit);
  }

  async beginCompletedAgentAutoClose({ id }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (!isTaskEligibleForCompletedAgentAutoClose(task)) return { task: presentTask(task), started: false };
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        agentAutoCloseStartedAt: nowIso(),
      };
      task.updatedAt = nowIso();
      return { task: presentTask(task), started: true };
    });
  }

  async markCompletedAgentAutoClose({ id, error = null, result = null }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const detail = result && typeof result === 'object' ? {
        agentAutoCloseProcessClosed: Boolean(result.processClosed),
        agentAutoCloseIntentional: Boolean(result.intentionalClose),
        agentAutoCloseExitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
        agentAutoCloseWindowClosed: result.windowClosed === true,
        agentAutoCloseTerminalVisibility: result.terminalCloseVisibility || 'unsupported',
        agentAutoCloseFullSuccess: Boolean(result.fullAutoCloseSuccess),
        agentAutoCloseMethod: result.method ? String(result.method) : null,
      } : {};
      task.metadata = {
        ...(task.metadata && typeof task.metadata === 'object' ? task.metadata : {}),
        agentAutoCloseCompletedAt: error ? null : nowIso(),
        agentAutoCloseError: error ? String(error) : null,
        agentAutoCloseErrorAt: error ? nowIso() : null,
        ...detail,
      };
      task.updatedAt = nowIso();
      return presentTask(task);
    });
  }

  /**
   * Consistent Store snapshot via the same parse path as getTask/listTasks.
   * Writers still use the exclusive lock + atomic rename; readers observe
   * complete JSON documents and must not parse bridge.json ad hoc.
   */
  async readSnapshot() {
    return this._readState();
  }

  async getTask(id) {
    const state = await this.readSnapshot();
    return presentTask(state.tasks.find((task) => task.id === id) ?? null);
  }

  async listTasks({ project, status, limit = 50 } = {}) {
    const state = await this.readSnapshot();
    const cleanStatus = status ? normalizeStatus(status) : null;
    const cleanProject = project ? String(project).trim() : null;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    return state.tasks
      .filter((task) => projectFilterMatches(task, cleanProject))
      .filter((task) => !cleanStatus || task.status === cleanStatus)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, safeLimit)
      .map((task) => presentTask(task));
  }

  async listTasksEligibleForAgentLaunch({ project, limit = 50 } = {}) {
    const cleanProject = project ? String(project).trim() : null;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    return (await this.listTasks({ project: cleanProject, status: 'READY', limit: 200 }))
      .filter((task) => isTaskEligibleForAgentLaunch(task))
      .slice(0, safeLimit);
  }

  async claimTask({ id, actor = 'cursor' }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      if (!['READY', 'BLOCKED', 'IN_PROGRESS'].includes(task.status)) {
        throw new Error(`Task ${id} cannot be claimed from status ${task.status}`);
      }
      const timestamp = nowIso();
      task.status = 'IN_PROGRESS';
      task.claimedBy = normalizeActor(actor, 'cursor');
      task.claimedAt ??= timestamp;
      task.updatedAt = timestamp;
      return presentTask(task);
    });
  }

  async claimNextTask({ project, actor = 'cursor' } = {}) {
    return this._mutate((state) => {
      const cleanProject = project ? String(project).trim() : null;
      const priorityRank = { critical: 4, high: 3, normal: 2, low: 1 };
      const candidates = state.tasks
        .filter((task) => task.status === 'READY')
        .filter((task) => projectFilterMatches(task, cleanProject))
        .slice()
        .sort((a, b) => {
          const priorityDelta = priorityRank[b.priority] - priorityRank[a.priority];
          if (priorityDelta !== 0) return priorityDelta;
          return a.createdAt.localeCompare(b.createdAt);
        });

      const task = candidates[0] ?? null;
      if (!task) return null;
      const timestamp = nowIso();
      task.status = 'IN_PROGRESS';
      task.claimedBy = normalizeActor(actor, 'cursor');
      task.claimedAt = timestamp;
      task.updatedAt = timestamp;
      return presentTask(task);
    });
  }

  async updateTask({ id, status, actor = 'cursor', summary, changedFiles, tests, note, metadata }) {
    return this._mutate((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error(`Task not found: ${id}`);
      const timestamp = nowIso();

      if (metadata && typeof metadata === 'object') {
        if (Object.prototype.hasOwnProperty.call(metadata, 'projectId')
          || Object.prototype.hasOwnProperty.call(metadata, 'project')
          || Object.prototype.hasOwnProperty.call(metadata, 'projectDisplayName')
          || Object.prototype.hasOwnProperty.call(metadata, 'workspaceRoot')
          || Object.prototype.hasOwnProperty.call(metadata, 'workspacePath')) {
          throw new Error('project identity and workspace fields are immutable after task creation');
        }
      }

      if (status) {
        task.status = normalizeStatus(status);
        if (task.status === 'COMPLETED' || task.status === 'FAILED') task.completedAt = timestamp;
      }
      if (summary !== undefined) task.summary = String(summary);
      if (changedFiles !== undefined) task.changedFiles = sanitizeArray(changedFiles);
      if (tests !== undefined) task.tests = sanitizeArray(tests);
      if (metadata && typeof metadata === 'object') task.metadata = { ...task.metadata, ...metadata };
      if (note) {
        task.notes.push({
          at: timestamp,
          by: normalizeActor(actor, 'cursor'),
          text: String(note),
        });
      }
      task.updatedAt = timestamp;
      return presentTask(task);
    });
  }

  async putContext({ project, key, value, actor = 'chatgpt' }) {
    return this._mutate((state) => {
      const registered = resolveRegisteredProject(project);
      const cleanKey = String(key ?? '').trim();
      if (!cleanKey) throw new Error('key is required');
      state.contexts[registered.id] ??= {};
      const record = {
        key: cleanKey,
        value,
        updatedBy: normalizeActor(actor, 'chatgpt'),
        updatedAt: nowIso(),
      };
      state.contexts[registered.id][cleanKey] = record;
      return { project: registered.id, projectId: registered.id, displayName: registered.displayName, ...record };
    });
  }

  async getContext({ project, key }) {
    const state = await this.readSnapshot();
    const registered = resolveRegisteredProject(project);
    const projectContext = state.contexts[registered.id] ?? state.contexts[registered.displayName] ?? {};
    if (key) return projectContext[String(key).trim()] ?? null;
    return Object.values(projectContext).sort((a, b) => a.key.localeCompare(b.key));
  }

  async listProjects() {
    const state = await this.readSnapshot();
    const registry = getProjectRegistry();
    const tasks = state.tasks.map((task) => hydrateTaskProjectFields(task));

    return registry.projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      const contextBag = state.contexts[project.id] ?? state.contexts[project.displayName] ?? {};
      const activeAgentTask = projectTasks.find((task) => isAgentActiveForProjectTask(task)) || null;
      return {
        ...publicProjectView(project, { includeWorkspace: false }),
        openTaskCount: projectTasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)).length,
        completedTaskCount: projectTasks.filter((task) => task.status === 'COMPLETED').length,
        pendingLaunchCount: projectTasks.filter((task) => isTaskEligibleForAgentLaunch(task)).length,
        activeAgentTaskId: activeAgentTask?.id || null,
        contextKeyCount: Object.keys(contextBag).length,
      };
    });
  }

  async status() {
    const state = await this.readSnapshot();
    const byStatus = Object.create(null);
    for (const task of state.tasks) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    const registry = getProjectRegistry();
    return {
      name: 'YZ Dev Bridge',
      version: '1.0.0',
      schemaVersion: state.schemaVersion,
      dataFile: this.filePath,
      taskCount: state.tasks.length,
      byStatus,
      projectCount: registry.projects.length,
      enabledProjectCount: registry.projects.filter((project) => project.enabled).length,
      projectsFile: registry.filePath,
    };
  }
}
