import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isPidAlive, parseStoreLockOwner, renameWithRetry } from './store.js';
import { isJsonBomParseError, parseJsonBomSafe } from './jsonBom.js';

export const E2E_DEBUG_SCHEMA = 'yz-bridge-e2e-debug-v1';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_DIR = resolve(BRIDGE_ROOT, 'data');
const DEFAULT_DEBUG_DIR = resolve(DEFAULT_DATA_DIR, 'debug');
const DEFAULT_LATEST_FILE = resolve(DEFAULT_DATA_DIR, 'e2e-debug-latest.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTaskId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error('taskId is required');
  return id;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function redactText(value) {
  let text = String(value ?? '');
  if (!text) return text;
  text = text.replace(/(ghp_[A-Za-z0-9]+)/g, '[redacted-token]');
  text = text.replace(/(github_pat_[A-Za-z0-9_]+)/g, '[redacted-token]');
  text = text.replace(/(AIza[0-9A-Za-z\-_]+)/g, '[redacted-token]');
  text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [redacted]');
  text = text.replace(/([A-Z0-9_]*(TOKEN|PASSWORD|SECRET|KEY)[A-Z0-9_]*=)([^,\s]+)/gi, '$1[redacted]');
  return text;
}

function safeErrorMessage(error) {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return redactText(raw).slice(0, 500) || 'unknown error';
}

function safeToolInput(input) {
  const data = asObject(input);
  const taskId = data.id ?? data.taskId ?? null;
  const actor = data.actor ?? null;
  const status = data.status ?? null;
  const project = data.project ?? null;
  return {
    taskId: taskId ? String(taskId) : null,
    actor: actor ? String(actor) : null,
    status: status ? String(status) : null,
    project: project ? String(project) : null,
  };
}

function toolSequenceNext(toolName) {
  if (toolName === 'bridge_claim_task' || toolName === 'bridge_claim_next_task') return 'bridge_get_task';
  if (toolName === 'bridge_get_task') return 'bridge_update_task';
  return null;
}

function inferFailureStage(debug) {
  const tools = Array.isArray(debug?.mcp?.toolCalls) ? debug.mcp.toolCalls : [];
  const observed = new Set(tools.filter((item) => item.success).map((item) => item.tool));
  if (debug?.launch?.launchError) {
    if (isJsonBomParseError(debug.launch.launchError) || /AGENT_SESSION_JSON_BOM|UTF-8 BOM/i.test(debug.launch.launchError)) {
      return 'AGENT_LAUNCH_JSON_BOM';
    }
    return 'BEFORE_MCP_ATTACH';
  }
  if (debug?.launch?.agentLaunchedAt && !observed.has('bridge_claim_task') && !observed.has('bridge_claim_next_task')) {
    return 'BEFORE_CLAIM';
  }
  if ((observed.has('bridge_claim_task') || observed.has('bridge_claim_next_task')) && !observed.has('bridge_get_task')) {
    return 'AFTER_CLAIM_BEFORE_GET';
  }
  if (observed.has('bridge_get_task') && !observed.has('bridge_update_task')) {
    return 'AFTER_GET_BEFORE_UPDATE';
  }
  if (observed.has('bridge_update_task') && !debug?.github?.resultPublishedAt) {
    return 'AFTER_UPDATE_BEFORE_GITHUB_RESULT';
  }
  return null;
}

function createEmptyDebug(taskId) {
  return {
    debugSchema: E2E_DEBUG_SCHEMA,
    taskId,
    github: {
      repo: null,
      issueNumber: null,
      issueTitle: null,
      ingestedAt: null,
      ackPublishedAt: null,
      resultPublishedAt: null,
      issueClosedAt: null,
    },
    task: {
      project: null,
      projectId: null,
      status: null,
      claimedBy: null,
      createdAt: null,
      updatedAt: null,
    },
    launch: {
      autoLaunchEnabled: null,
      reservation: null,
      reservedAt: null,
      method: null,
      launcherFile: null,
      windowsAppsShim: null,
      launcherPid: null,
      handoff: null,
      workspace: null,
      projectId: null,
      keepWindowOpen: null,
      hostNoExit: null,
      hostLaunchMode: null,
      agentLaunchedAt: null,
      launchError: null,
      agentSession: null,
      autoCloseStartedAt: null,
      autoCloseCompletedAt: null,
      autoCloseError: null,
      autoCloseProcessClosed: null,
      autoCloseIntentional: null,
      autoCloseExitCode: null,
      autoCloseWindowClosed: null,
      autoCloseTerminalVisibility: null,
      autoCloseFullSuccess: null,
      autoCloseMethod: null,
    },
    mcp: {
      server: 'yz-dev-bridge',
      configured: true,
      serverStartedAt: null,
      serverReadyObserved: false,
      toolCalls: [],
    },
    interaction: {
      approvalVisibility: 'unsupported',
      manualApprovalObserved: false,
      manualApprovalCount: 0,
      suspectedApprovalBlock: false,
      lastObservedTool: null,
      expectedNextTool: null,
      unattendedPass: null,
    },
    events: [],
    final: {
      status: null,
      failureStage: null,
      resultSummary: null,
    },
  };
}

function syncTaskSnapshot(debug, task) {
  if (!task) return;
  debug.task.project = task.project || debug.task.project;
  debug.task.projectId = task.projectId || debug.task.projectId || null;
  debug.task.status = task.status || debug.task.status;
  debug.task.claimedBy = task.claimedBy || null;
  debug.task.createdAt = task.createdAt || debug.task.createdAt;
  debug.task.updatedAt = task.updatedAt || debug.task.updatedAt;
  debug.final.status = task.status || debug.final.status;
  if (task.summary) debug.final.resultSummary = redactText(task.summary);
}

function addEvent(debug, event) {
  debug.events.push({
    at: event.at || nowIso(),
    ...event,
  });
}

function updateInteractionFromTool(debug, toolName, success) {
  if (!success) return;
  debug.interaction.lastObservedTool = toolName;
  debug.interaction.expectedNextTool = toolSequenceNext(toolName);
  if (!debug.mcp.serverStartedAt) debug.mcp.serverStartedAt = nowIso();
  debug.mcp.serverReadyObserved = true;
}

function finalizeDebugState(debug) {
  const failureStage = inferFailureStage(debug);
  debug.final.failureStage = failureStage;
  const terminal = debug.final.status === 'COMPLETED'
    || debug.final.status === 'FAILED'
    || debug.final.status === 'BLOCKED'
    || debug.final.status === 'CANCELLED';
  // Approval prompts are not observable via MCP in the current CLI, so never claim an
  // unattended pass solely from missing MCP-side evidence.
  if (debug.interaction.approvalVisibility === 'unsupported') {
    debug.interaction.unattendedPass = false;
    return;
  }
  if (terminal && !failureStage) {
    debug.interaction.unattendedPass = true;
  } else if (failureStage && debug.launch.agentLaunchedAt) {
    debug.interaction.suspectedApprovalBlock = failureStage === 'AFTER_CLAIM_BEFORE_GET';
    debug.interaction.unattendedPass = false;
  }
}

export function buildGithubResultPreview(debug, task, { issueClosed = false } = {}) {
  const preview = JSON.parse(JSON.stringify(debug || createEmptyDebug(task?.id || 'TASK-UNKNOWN')));
  syncTaskSnapshot(preview, task);
  preview.github.resultPublishedAt ||= nowIso();
  if (issueClosed) preview.github.issueClosedAt ||= nowIso();
  finalizeDebugState(preview);
  if (preview.interaction.approvalVisibility === 'unsupported') {
    preview.interaction.unattendedPass = false;
  } else if ((task?.status === 'COMPLETED' || task?.status === 'FAILED' || task?.status === 'BLOCKED' || task?.status === 'CANCELLED') && !preview.final.failureStage) {
    preview.interaction.unattendedPass = true;
  }
  if (preview.github.resultPublishedAt && preview.final.failureStage === 'AFTER_UPDATE_BEFORE_GITHUB_RESULT') {
    preview.final.failureStage = null;
  }
  return preview;
}

export function summarizeE2eDebug(debug) {
  const tools = Array.isArray(debug?.mcp?.toolCalls) ? debug.mcp.toolCalls : [];
  const observedTools = [...new Set(tools.filter((item) => item.success).map((item) => item.tool))];
  return {
    taskId: debug?.taskId || null,
    issueNumber: debug?.github?.issueNumber ?? null,
    agentLaunch: debug?.launch?.launchError ? 'failed' : (debug?.launch?.agentLaunchedAt ? 'success' : 'pending'),
    mcpServer: debug?.mcp?.server || 'yz-dev-bridge',
    mcpToolsObserved: observedTools,
    approvalVisibility: debug?.interaction?.approvalVisibility || 'unsupported',
    suspectedApprovalBlock: Boolean(debug?.interaction?.suspectedApprovalBlock),
    lastObservedTool: debug?.interaction?.lastObservedTool || null,
    failureStage: debug?.final?.failureStage || null,
    unattendedPass: debug?.interaction?.unattendedPass ?? null,
  };
}

export class E2eDebugStore {
  constructor({ dataFile } = {}) {
    const rootDataFile = dataFile ? resolve(dataFile) : resolve(DEFAULT_DATA_DIR, 'bridge.json');
    const dataDir = dirname(rootDataFile);
    this.debugDir = resolve(dataDir, 'debug');
    this.latestFile = resolve(dataDir, 'e2e-debug-latest.json');
  }

  taskFile(taskId) {
    return join(this.debugDir, `${normalizeTaskId(taskId)}.json`);
  }

  async init() {
    await mkdir(this.debugDir, { recursive: true });
  }

  async _writeJsonAtomic(filePath, value) {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(tmp, 'w');
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      if (typeof handle.sync === 'function') {
        await handle.sync().catch(() => undefined);
      }
    } finally {
      if (handle) await handle.close().catch(() => undefined);
    }
    try {
      await renameWithRetry(tmp, filePath);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  }

  async _sleep(ms) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
  }

  async _withFileLock(lockPath, action) {
    const deadline = Date.now() + 30_000;
    while (true) {
      let handle;
      try {
        handle = await open(lockPath, 'wx');
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: nowIso() })}\n`, 'utf8');
        try {
          return await action();
        } finally {
          await handle.close().catch(() => undefined);
          handle = undefined;
          await unlink(lockPath).catch(() => undefined);
        }
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        if (error?.code !== 'EEXIST') throw error;
        let owner = null;
        try {
          owner = parseStoreLockOwner(await readFile(lockPath, 'utf8'));
        } catch {
          owner = null;
        }
        if (owner?.pid && !isPidAlive(owner.pid)) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for debug lock (ownerPid=${owner?.pid ?? 'unknown'})`);
        }
        await this._sleep(40 + Math.floor(Math.random() * 80));
      }
    }
  }

  async read(taskId) {
    const filePath = this.taskFile(taskId);
    try {
      return parseJsonBomSafe(await readFile(filePath, 'utf8'), { source: filePath });
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async update(taskId, mutator) {
    const id = normalizeTaskId(taskId);
    const filePath = this.taskFile(id);
    const lockPath = `${filePath}.lock`;
    await this.init();
    return this._withFileLock(lockPath, async () => {
      let debug = await this.read(id);
      if (!debug) debug = createEmptyDebug(id);
      await mutator(debug);
      finalizeDebugState(debug);
      await this._writeJsonAtomic(filePath, debug);
      await this._writeJsonAtomic(this.latestFile, debug);
      return debug;
    });
  }

  async noteGithubIssueIngested({ task, repo, issue }) {
    return this.update(task.id, async (debug) => {
      const issueNumber = Number(issue?.number ?? task?.metadata?.githubIssueNumber ?? 0) || null;
      debug.github.repo = repo || debug.github.repo;
      debug.github.issueNumber = issueNumber;
      debug.github.issueTitle = redactText(issue?.title || task?.metadata?.githubIssueTitle || task?.title || '');
      debug.github.ingestedAt ||= nowIso();
      syncTaskSnapshot(debug, task);
      addEvent(debug, { type: 'github_issue_ingested', issueNumber, issueTitle: debug.github.issueTitle });
      addEvent(debug, { type: 'bridge_task_created', project: task.project });
      debug.interaction.expectedNextTool = 'bridge_claim_task';
    });
  }

  async noteGithubAckPublished(task) {
    return this.update(task.id, async (debug) => {
      debug.github.ackPublishedAt ||= task?.metadata?.githubAckPostedAt || nowIso();
      syncTaskSnapshot(debug, task);
      addEvent(debug, { type: 'github_ack_published' });
    });
  }

  async noteLaunchReserved(task, launch) {
    return this.update(task.id, async (debug) => {
      debug.launch.autoLaunchEnabled = Boolean(launch?.autoLaunchEnabled);
      debug.launch.reservation = launch?.reservation || 'acquired';
      debug.launch.reservedAt = task?.metadata?.agentLaunchStartedAt || nowIso();
      debug.launch.workspace = launch?.workspace || debug.launch.workspace;
      debug.launch.projectId = launch?.projectId || debug.launch.projectId || null;
      debug.launch.keepWindowOpen = launch?.keepWindowOpen ?? debug.launch.keepWindowOpen;
      debug.launch.hostNoExit = launch?.hostNoExit ?? debug.launch.hostNoExit;
      debug.launch.hostLaunchMode = launch?.hostLaunchMode ?? debug.launch.hostLaunchMode;
      syncTaskSnapshot(debug, task);
      addEvent(debug, { type: 'agent_launch_reserved', reservation: debug.launch.reservation });
    });
  }

  async noteLaunchSelected(taskId, details) {
    return this.update(taskId, async (debug) => {
      debug.launch.method = details?.method || debug.launch.method;
      debug.launch.launcherFile = details?.launcherFile || debug.launch.launcherFile;
      debug.launch.windowsAppsShim = details?.windowsAppsShim ?? debug.launch.windowsAppsShim;
      debug.launch.workspace = details?.workspace || debug.launch.workspace;
      debug.launch.projectId = details?.projectId || debug.launch.projectId || null;
      debug.launch.keepWindowOpen = details?.keepWindowOpen ?? debug.launch.keepWindowOpen;
      debug.launch.hostNoExit = details?.hostNoExit ?? debug.launch.hostNoExit;
      debug.launch.hostLaunchMode = details?.hostLaunchMode ?? debug.launch.hostLaunchMode;
      addEvent(debug, {
        type: 'agent_launcher_selected',
        method: details?.method || null,
        launcherFile: details?.launcherFile || null,
        windowsAppsShim: details?.windowsAppsShim ?? null,
      });
    });
  }

  async noteLaunchOutcome(taskId, details) {
    return this.update(taskId, async (debug) => {
      debug.launch.method = details?.method || debug.launch.method;
      debug.launch.launcherFile = details?.launcherFile || debug.launch.launcherFile;
      debug.launch.windowsAppsShim = details?.windowsAppsShim ?? debug.launch.windowsAppsShim;
      debug.launch.launcherPid = details?.pid ?? debug.launch.launcherPid;
      debug.launch.handoff = details?.handoff || debug.launch.handoff;
      debug.launch.workspace = details?.workspace || debug.launch.workspace;
      debug.launch.projectId = details?.projectId || debug.launch.projectId || null;
      debug.launch.keepWindowOpen = details?.keepWindowOpen ?? debug.launch.keepWindowOpen;
      debug.launch.hostNoExit = details?.hostNoExit ?? debug.launch.hostNoExit;
      debug.launch.hostLaunchMode = details?.hostLaunchMode ?? debug.launch.hostLaunchMode;
      if (details?.session) debug.launch.agentSession = { ...details.session };
      if (details?.error) {
        debug.launch.launchError = safeErrorMessage(details.error);
        addEvent(debug, {
          type: 'agent_launch_failed',
          method: debug.launch.method,
          launcherFile: debug.launch.launcherFile,
          error: debug.launch.launchError,
        });
      } else {
        debug.launch.agentLaunchedAt ||= nowIso();
        debug.launch.launchError = null;
        addEvent(debug, {
          type: 'agent_launcher_handoff',
          method: debug.launch.method,
          launcherFile: debug.launch.launcherFile,
          launcherPid: debug.launch.launcherPid,
          handoff: debug.launch.handoff,
          windowsAppsShim: debug.launch.windowsAppsShim,
        });
      }
    });
  }

  async noteTaskSnapshot(task) {
    if (!task?.id || !task?.metadata?.githubIssueNumber) return null;
    return this.update(task.id, async (debug) => {
      const previousStatus = debug.task.status;
      syncTaskSnapshot(debug, task);
      if (previousStatus && previousStatus !== task.status) {
        addEvent(debug, {
          type: 'task_status_changed',
          from: previousStatus,
          to: task.status,
        });
      }
      if (previousStatus !== 'IN_PROGRESS' && task.status === 'IN_PROGRESS' && task.claimedBy) {
        addEvent(debug, { type: 'task_claimed', actor: task.claimedBy });
      }
    });
  }

  async noteGithubResultPublished(task, { issueClosed = false } = {}) {
    return this.update(task.id, async (debug) => {
      syncTaskSnapshot(debug, task);
      debug.github.resultPublishedAt ||= task?.metadata?.githubResultPostedAt || nowIso();
      addEvent(debug, { type: 'github_result_published', status: task.status });
      if (issueClosed) {
        debug.github.issueClosedAt ||= nowIso();
        addEvent(debug, { type: 'github_issue_closed' });
      }
      if (task.status === 'COMPLETED' && !debug.final.failureStage) {
        if (debug.interaction.approvalVisibility === 'unsupported') {
          debug.interaction.unattendedPass = false;
          addEvent(debug, {
            type: 'unattended_flow_unproven',
            reason: 'approval-visibility-unsupported',
          });
        } else {
          debug.interaction.unattendedPass = true;
          addEvent(debug, { type: 'unattended_flow_completed' });
        }
      } else if (debug.final.failureStage) {
        debug.interaction.unattendedPass = false;
        addEvent(debug, { type: 'unattended_flow_stalled', failureStage: debug.final.failureStage });
      }
    });
  }

  async noteAgentSessionRegistered(taskId, session) {
    return this.update(taskId, async (debug) => {
      debug.launch.agentSession = session ? { ...session } : debug.launch.agentSession;
      addEvent(debug, {
        type: 'agent_session_registered',
        pid: session?.pid ?? null,
        startedAt: session?.startedAt || null,
        nonce: session?.nonce || null,
      });
    });
  }

  async noteAgentAutoCloseScheduled(taskId, session) {
    return this.update(taskId, async (debug) => {
      addEvent(debug, {
        type: 'agent_auto_close_scheduled',
        pid: session?.pid ?? null,
        startedAt: session?.startedAt || null,
        nonce: session?.nonce || null,
      });
    });
  }

  async noteAgentAutoCloseStarted(taskId, session) {
    return this.update(taskId, async (debug) => {
      debug.launch.autoCloseStartedAt ||= nowIso();
      addEvent(debug, {
        type: 'agent_auto_close_started',
        pid: session?.pid ?? null,
        startedAt: session?.startedAt || null,
        nonce: session?.nonce || null,
      });
    });
  }

  async noteAgentAutoCloseCompleted(taskId, session, result = null) {
    return this.update(taskId, async (debug) => {
      const processClosed = Boolean(result?.processClosed ?? result?.processCloseVerified);
      const intentionalClose = Boolean(result?.intentionalClose);
      const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : null;
      const windowClosed = result?.windowClosed === true;
      const terminalCloseVisibility = result?.terminalCloseVisibility || 'unsupported';
      const fullAutoCloseSuccess = Boolean(result?.fullAutoCloseSuccess);
      debug.launch.autoCloseProcessClosed = processClosed;
      debug.launch.autoCloseIntentional = intentionalClose;
      debug.launch.autoCloseExitCode = exitCode;
      debug.launch.autoCloseWindowClosed = windowClosed;
      debug.launch.autoCloseTerminalVisibility = terminalCloseVisibility;
      debug.launch.autoCloseFullSuccess = fullAutoCloseSuccess;
      debug.launch.autoCloseMethod = result?.method || debug.launch.autoCloseMethod;
      // Only mark completed when the verifiable process-close condition is satisfied.
      // Never claim windowClosed unless it was directly observed.
      if (processClosed && (result?.ok !== false)) {
        debug.launch.autoCloseCompletedAt ||= nowIso();
        debug.launch.autoCloseError = null;
        addEvent(debug, {
          type: 'agent_auto_close_completed',
          pid: session?.pid ?? null,
          startedAt: session?.startedAt || null,
          nonce: session?.nonce || null,
          processClosed: true,
          intentionalClose,
          exitCode,
          windowClosed,
          terminalCloseVisibility,
          fullAutoCloseSuccess,
          method: result?.method || null,
        });
      } else {
        debug.launch.autoCloseError = 'process close not verified';
        addEvent(debug, {
          type: 'agent_auto_close_failed',
          pid: session?.pid ?? null,
          startedAt: session?.startedAt || null,
          nonce: session?.nonce || null,
          error: 'process close not verified',
          processClosed: false,
          windowClosed: false,
          terminalCloseVisibility,
        });
      }
    });
  }

  async noteAgentAutoCloseFailed(taskId, session, error, result = null) {
    return this.update(taskId, async (debug) => {
      debug.launch.autoCloseError = safeErrorMessage(error);
      debug.launch.autoCloseProcessClosed = result ? Boolean(result.processClosed) : debug.launch.autoCloseProcessClosed;
      debug.launch.autoCloseIntentional = result ? Boolean(result.intentionalClose) : debug.launch.autoCloseIntentional;
      debug.launch.autoCloseExitCode = Number.isInteger(result?.exitCode) ? result.exitCode : debug.launch.autoCloseExitCode;
      debug.launch.autoCloseWindowClosed = result ? result.windowClosed === true : debug.launch.autoCloseWindowClosed;
      debug.launch.autoCloseTerminalVisibility = result?.terminalCloseVisibility || debug.launch.autoCloseTerminalVisibility || 'unsupported';
      debug.launch.autoCloseFullSuccess = false;
      debug.launch.autoCloseMethod = result?.method || debug.launch.autoCloseMethod;
      addEvent(debug, {
        type: 'agent_auto_close_failed',
        pid: session?.pid ?? null,
        startedAt: session?.startedAt || null,
        nonce: session?.nonce || null,
        error: safeErrorMessage(error),
        processClosed: result ? Boolean(result.processClosed) : null,
        intentionalClose: result ? Boolean(result.intentionalClose) : null,
        exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
        windowClosed: result ? result.windowClosed === true : null,
        terminalCloseVisibility: result?.terminalCloseVisibility || 'unsupported',
        forced: result ? Boolean(result.forced) : null,
        method: result?.method || null,
      });
    });
  }

  async noteMcpToolStarted({ toolName, input }) {
    const safe = safeToolInput(input);
    if (!safe.taskId) return null;
    return this.update(safe.taskId, async (debug) => {
      if (!debug.mcp.serverStartedAt) {
        debug.mcp.serverStartedAt = nowIso();
        addEvent(debug, { type: 'mcp_server_started', server: debug.mcp.server });
      }
      addEvent(debug, {
        type: 'mcp_tool_started',
        tool: toolName,
        taskId: safe.taskId,
        actor: safe.actor,
      });
    });
  }

  async noteMcpToolCompleted({ toolName, input, startedAt, success, error }) {
    const safe = safeToolInput(input);
    if (!safe.taskId) return null;
    return this.update(safe.taskId, async (debug) => {
      const completedAt = nowIso();
      const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt || completedAt));
      debug.mcp.toolCalls.push({
        tool: toolName,
        taskId: safe.taskId,
        actor: safe.actor,
        startedAt: startedAt || completedAt,
        completedAt,
        durationMs,
        success: Boolean(success),
        error: success ? null : safeErrorMessage(error),
      });
      updateInteractionFromTool(debug, toolName, Boolean(success));
      addEvent(debug, {
        type: 'mcp_tool_completed',
        tool: toolName,
        taskId: safe.taskId,
        actor: safe.actor,
        success: Boolean(success),
        durationMs,
        error: success ? null : safeErrorMessage(error),
      });
    });
  }
}

export function formatDebugSummaryText(debug) {
  const summary = summarizeE2eDebug(debug);
  return [
    `- taskId: ${summary.taskId || 'n/a'}`,
    `- issueNumber: ${summary.issueNumber ?? 'n/a'}`,
    `- agentLaunch: ${summary.agentLaunch}`,
    `- mcpServer: ${summary.mcpServer}`,
    `- mcpToolsObserved: ${summary.mcpToolsObserved.length ? summary.mcpToolsObserved.join(' -> ') : 'none'}`,
    `- lastObservedTool: ${summary.lastObservedTool || 'n/a'}`,
    `- approvalVisibility: ${summary.approvalVisibility}`,
    `- suspectedApprovalBlock: ${summary.suspectedApprovalBlock}`,
    `- unattendedPass: ${summary.unattendedPass == null ? 'n/a' : String(summary.unattendedPass)}`,
    `- failureStage: ${summary.failureStage || 'n/a'}`,
  ].join('\n');
}
