import { isEligibleGithubIssue, mapGithubIssueToLocalInput } from './issueMapper.js';
import {
  ackMarker,
  commentHasMarker,
  formatGithubAckComment,
  formatGithubResultComment,
  isGithubTerminalTask,
  resultMarker,
} from '../result/structuredResult.js';
import { CursorAgentUnavailableError, VisibleAgentLaunchError } from '../agent/cursorAgentLauncher.js';
import {
  closeAgentSessionGracefully,
  normalizeExactAgentSession,
} from '../agent/agentSessionCloser.js';
import { launchVisibleCursorAgent, resolveLaunchAgentPath, verifyCursorAgent } from '../agent/launchVisibleAgent.js';
import { buildGithubResultPreview, E2eDebugStore, summarizeE2eDebug } from '../e2eDebug.js';
import {
  isRelayRawLogsEnabled,
  printAgentAutoClosedCard,
  printAgentRecoveryCard,
  printCancelledResultCard,
  printCompletedTaskCard,
  printFailedTaskCard,
  printIncomingTaskCard,
  printLifecycleCard,
  printRelayErrorCard,
  printRelayRecoveredCard,
  printTaskStatusCard,
  resolveGithubIssueCardState,
  formatGithubIssueStateLabel,
} from './relayCards.js';
import { classifyStoreError } from '../store.js';
import { resolveTaskWorkspace } from '../projects/resolveTaskWorkspace.js';
import { ProjectRegistryError } from '../projects/projectRegistry.js';
import {
  buildRelayRuntimeStatus,
  publishRelayRuntimeStatus,
  relayRuntimePathForStore,
} from './relayRuntimeStatus.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRepo(value) {
  return String(value || '').trim().toLowerCase();
}

export function taskBelongsToGithubRepo(task, repo, { defaultRepoOwner = false } = {}) {
  const taskRepo = normalizeRepo(task?.metadata?.githubRepo);
  const target = normalizeRepo(repo);
  if (taskRepo) return taskRepo === target;
  return Boolean(defaultRepoOwner);
}

export class GithubInboxWorker {
  constructor({
    client,
    store,
    config,
    logger = console,
    launcher = {
      resolvePath: resolveLaunchAgentPath,
      verify: verifyCursorAgent,
      launch: launchVisibleCursorAgent,
    },
      closer = {
        delay: sleep,
        closeTaskSession: closeAgentSessionGracefully,
      },
    presentCards = true,
  }) {
    this.client = client;
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.launcher = launcher;
    this.closer = closer;
    this.presentCards = presentCards !== false;
    this.debug = new E2eDebugStore({ dataFile: this.store.filePath });
    this.timer = null;
    this.running = false;
    this.tickInFlight = false;
    this.openIssueNumbers = new Set();
    this.openIssuesKnown = false;
    this.ownsLegacyGithubTasks = this.config.ownsLegacyGithubTasks !== false
      && (
        !this.config.projectId
        || this.config.projectId === 'rent-a-car'
        || normalizeRepo(this.config.repo) === 'yanivzohar1971-cmd/rent-a-car'
      );
    this.runtimeFile = this.config.runtimeStatusFile
      || process.env.YZ_BRIDGE_RELAY_RUNTIME_FILE
      || relayRuntimePathForStore(this.store.filePath);
    this.runtime = {
      lastPollAt: null,
      nextPollAt: null,
      eligibleIssueCount: null,
      errorCount: 0,
      lastError: null,
    };
  }

  belongs(task) {
    return taskBelongsToGithubRepo(task, this.config.repo, {
      defaultRepoOwner: this.ownsLegacyGithubTasks,
    });
  }

  log(message, extra) {
    if (extra) this.logger.error(`${message} ${JSON.stringify(extra)}`);
    else this.logger.error(message);
  }

  rawLogsEnabled() {
    return isRelayRawLogsEnabled(this.config?.env || process.env);
  }

  /** Cosmetic BBS card/status — never changes relay behavior. */
  present(kind, payload = {}) {
    if (!this.presentCards) return;

    const liveConsole = this.logger === console;
    const chunks = [];
    const stream = liveConsole
      ? process.stderr
      : {
        write(chunk) {
          chunks.push(String(chunk));
          return true;
        },
      };
    const printOpts = liveConsole
      ? { stream }
      : { stream, useColor: false };

    switch (kind) {
      case 'incoming':
        printIncomingTaskCard(payload, printOpts);
        break;
      case 'completed':
        printCompletedTaskCard(payload, printOpts);
        break;
      case 'failed':
        printFailedTaskCard(payload, printOpts);
        break;
      case 'cancelled-result':
        printCancelledResultCard(payload, printOpts);
        break;
      case 'lifecycle':
        printLifecycleCard(payload, printOpts);
        break;
      case 'status':
        printTaskStatusCard({
          taskId: payload.taskId || payload.label || payload.id,
          event: payload.status || payload.event,
          rows: payload.rows,
          title: payload.title,
          accent: payload.accent,
          emphasis: payload.emphasis,
        }, printOpts);
        break;
      case 'auto-closed':
        printAgentAutoClosedCard(payload, printOpts);
        break;
      case 'error':
        printRelayErrorCard(payload, printOpts);
        break;
      case 'recovered':
        printRelayRecoveredCard(payload, printOpts);
        break;
      case 'agent-recovery':
        printAgentRecoveryCard(payload, printOpts);
        break;
      default:
        return;
    }

    if (!liveConsole) {
      const text = chunks.join('').replace(/\n$/, '');
      if (text && typeof this.logger?.error === 'function') {
        this.logger.error(text);
      }
    }
  }

  reportTickError(error) {
    const classified = classifyStoreError(error);
    const safeCard = {
      component: classified.component,
      operation: classified.operation,
      code: classified.code,
      status: classified.status,
      safeReason: classified.safeReason,
    };
    this.present('error', safeCard);
    this.runtime.errorCount = (this.runtime.errorCount || 0) + 1;
    this.runtime.lastError = classified.safeReason;
    void this.publishRuntimeStatus({ online: true });
    if (this.rawLogsEnabled()) {
      this.log(`YZ GitHub relay tick failed: ${classified.message}`);
    }
  }

  maybeReportStoreRecovery() {
    const meta = this.store?.lastCommitMeta;
    if (!meta?.recovered) return;
    this.present('recovered', {
      component: 'Bridge Store',
      operation: 'STORE COMMIT',
      attempts: meta.attempts,
    });
    // Consume so the same recovery is not reprinted every tick.
    this.store.lastCommitMeta = { ...meta, recovered: false, reported: true };
  }

  presentAgentRecoveries(recovered = []) {
    for (const item of recovered) {
      const previous = item.reason === 'stale-launch-reservation'
        ? 'STALE RESERVATION'
        : (item.reason === 'terminal-dead-session' ? 'TERMINAL DEAD SESSION' : 'STALE SESSION');
      const statusLabel = item.action === 'blocked-manual-review'
        ? 'BLOCKED'
        : 'RELEASED';
      this.present('agent-recovery', {
        taskId: item.taskId,
        project: item.project || item.projectId,
        projectId: item.projectId,
        previousLabel: previous,
        statusLabel,
        unlockLabel: 'PROJECT UNLOCKED',
      });
      if (this.rawLogsEnabled()) {
        this.log(`YZ GitHub relay agent recovery for ${item.taskId}`, {
          action: item.action,
          reason: item.reason,
          projectId: item.projectId,
          status: item.status,
        });
      }
    }
  }

  async reconcileAgentLifecycles() {
    const result = await this.store.reconcileAgentLifecycles();
    const recovered = Array.isArray(result?.recovered) ? result.recovered : [];
    if (recovered.length) {
      this.presentAgentRecoveries(recovered);
    }
    return result;
  }

  presentClosedSourceCancellations(cancelled = []) {
    for (const item of cancelled) {
      this.present('lifecycle', {
        state: 'CANCELLED',
        taskId: item.taskId,
        rows: [
          ['Project', item.project || item.projectId || ''],
          ['Previous', String(item.previousStatus || ''), 'warn'],
          ['Reason', 'SOURCE ISSUE CLOSED', 'warn'],
          ['Action', 'BACKLOG ARCHIVED', 'success'],
        ],
      });
      if (this.rawLogsEnabled()) {
        this.log(`YZ GitHub relay cancelled closed-source backlog task ${item.taskId}`, {
          previousStatus: item.previousStatus,
          reason: item.reason,
          projectId: item.projectId,
        });
      }
    }
  }

  async reconcileClosedGithubSources(openIssues = []) {
    const list = Array.isArray(openIssues) ? openIssues : [];
    const openIssueNumbers = list.map((issue) => String(issue.number));
    this.openIssueNumbers = new Set(openIssueNumbers);
    this.openIssuesKnown = true;
    if (!this.config.repo) return { cancelled: [], count: 0 };
    const result = await this.store.cancelGithubTasksWithClosedSources({
      githubRepo: this.config.repo,
      openIssueNumbers,
      projectId: this.config.projectId || null,
      ownsLegacyGithubTasks: this.ownsLegacyGithubTasks,
    });
    const cancelled = Array.isArray(result?.cancelled) ? result.cancelled : [];
    if (cancelled.length) this.presentClosedSourceCancellations(cancelled);
    return result;
  }

  isLaunchAllowedForTask(task) {
    if (!task?.metadata?.githubIssueNumber) return true;
    if (!this.belongs(task)) return false;
    return this.openIssueNumbers.has(String(task.metadata.githubIssueNumber).trim());
  }

  async start() {
    this.running = true;
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.reportTickError(error);
      });
    }, this.config.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.publishRuntimeStatus({ online: false });
  }

  async publishRuntimeStatus({ online = this.running } = {}) {
    const intervalMs = Number(this.config.intervalMs) || 15_000;
    const status = buildRelayRuntimeStatus({
      pid: process.pid,
      repo: this.config.repo,
      lastPollAt: this.runtime.lastPollAt,
      nextPollAt: this.runtime.nextPollAt,
      intervalMs,
      eligibleIssueCount: this.runtime.eligibleIssueCount,
      openIssueNumbersByRepo: {
        [this.config.repo]: [...this.openIssueNumbers],
      },
      lastError: this.runtime.lastError,
      errorCount: this.runtime.errorCount,
      online,
    });
    await publishRelayRuntimeStatus(this.runtimeFile, status);
  }

  async tick() {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      const openIssues = await this.client.listOpenIssues();
      const list = Array.isArray(openIssues) ? openIssues : [];
      this.runtime.lastPollAt = new Date().toISOString();
      this.runtime.nextPollAt = new Date(Date.now() + (Number(this.config.intervalMs) || 15_000)).toISOString();
      this.runtime.eligibleIssueCount = list.filter((issue) => isEligibleGithubIssue(issue, this.config)).length;
      await this.reconcileClosedGithubSources(list);
      await this.ingestIssues(list);
      await this.publishResults();
      await this.autoCloseCompletedAgents();
      await this.reconcileAgentLifecycles();
      await this.launchReadyAgents();
      this.maybeReportStoreRecovery();
      await this.publishRuntimeStatus({ online: true });
    } finally {
      this.tickInFlight = false;
    }
  }

  async ingestIssues(prefetchedOpenIssues = null) {
    const issues = prefetchedOpenIssues == null
      ? await this.client.listOpenIssues()
      : prefetchedOpenIssues;
    const list = Array.isArray(issues) ? issues : [];
    for (const issue of list) {
      if (!isEligibleGithubIssue(issue, this.config)) continue;
      const imported = await this.store.importGithubTask(mapGithubIssueToLocalInput(issue, this.config));
      if (imported.created) {
        await this.debug.noteGithubIssueIngested({
          task: imported.task,
          repo: this.config.repo,
          issue,
        });
      }
      await this.acknowledgeIfNeeded(imported.task, issue);
      if (imported.created || imported.revived) {
        this.present('incoming', {
          taskId: imported.task.id,
          issueNumber: issue.number,
          project: imported.task.project || this.config.project,
          projectId: imported.task.projectId || this.config.projectId,
          title: issue.title || imported.task.title,
          autoLaunch: this.config.autoLaunch && !imported.task.metadata?.projectRoutingError,
          agentStatus: imported.task.metadata?.projectRoutingError
            ? 'ROUTING FAILED'
            : (this.config.autoLaunch ? 'LAUNCHING...' : 'MANUAL'),
        });
        this.present('status', {
          label: imported.task.id,
          status: imported.revived ? 'REVIVED' : 'INGESTED',
        });
        if (this.rawLogsEnabled()) {
          this.log(`YZ GitHub relay ${imported.revived ? 'revived' : 'ingested'} issue #${issue.number} as ${imported.task.id}`);
        }
        if (imported.created && this.config.applyLabel) {
          try {
            await this.client.addLabel(issue.number, this.config.taskLabel);
          } catch (error) {
            this.log(`YZ GitHub relay could not apply label on #${issue.number}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }

  async acknowledgeIfNeeded(task, issue) {
    if (task.metadata?.githubAckPostedAt) return;
    const comments = await this.client.listComments(issue.number);
    const already = (Array.isArray(comments) ? comments : []).some((comment) => (
      commentHasMarker(comment.body, ackMarker(task.id))
    ));
    if (!already) {
      await this.client.addComment(issue.number, formatGithubAckComment(task));
    }
    const updated = await this.store.markGithubAckPosted({ id: task.id });
    await this.debug.noteGithubAckPublished(updated);
    this.present('status', { label: task.id, status: 'ACK POSTED' });
  }

  resolveIssueCardState(task, { closedByRelay = false } = {}) {
    return resolveGithubIssueCardState(task, {
      openIssueNumbers: this.openIssueNumbers,
      openIssuesKnown: this.openIssuesKnown,
      closedByRelay,
    });
  }

  async publishResults() {
    const tasks = await this.store.listGithubRelayTasks();
    for (const task of tasks) {
      if (!this.belongs(task)) continue;
      if (!isGithubTerminalTask(task)) continue;
      if (task.metadata?.githubResultPostedAt) continue;
      const issueNumber = task.metadata.githubIssueNumber;
      const comments = await this.client.listComments(issueNumber);
      const already = (Array.isArray(comments) ? comments : []).some((comment) => (
        commentHasMarker(comment.body, resultMarker(task.id))
      ));
      const currentDebug = await this.debug.read(task.id);
      const closedByRelay = task.status === 'COMPLETED';
      const issueState = this.resolveIssueCardState(task, { closedByRelay });
      const previewDebug = buildGithubResultPreview(currentDebug, task, {
        issueClosed: issueState === 'closed',
        issueState,
      });
      if (!already) {
        await this.client.addComment(issueNumber, await formatGithubResultComment(task, {
          debug: previewDebug,
          debugSummary: summarizeE2eDebug(previewDebug),
          debugStore: this.debug,
        }));
      }
      if (task.status === 'COMPLETED') {
        await this.client.closeIssue(issueNumber);
      }
      const marked = await this.store.markGithubResultPosted({ id: task.id });
      await this.debug.noteGithubResultPublished(marked.task, {
        issueClosed: issueState === 'closed',
        issueState,
      });
      if (task.status === 'COMPLETED') {
        this.present('completed', {
          taskId: task.id,
          issueState,
          issueClosed: issueState === 'closed',
        });
      } else if (task.status === 'FAILED') {
        const reason = task.summary
          || task.metadata?.structuredResult?.rootCause
          || task.metadata?.structuredResult?.resultSummary
          || 'task reported FAILED';
        this.present('failed', {
          taskId: task.id,
          reason: String(reason).slice(0, 180),
          resultPosted: true,
          issueState,
          issueClosed: issueState === 'closed',
        });
      } else if (task.status === 'CANCELLED') {
        this.present('cancelled-result', {
          taskId: task.id,
          resultPosted: true,
          issueState,
          issueClosed: issueState === 'closed',
        });
      } else {
        const issueRow = formatGithubIssueStateLabel(issueState);
        this.present('lifecycle', {
          state: String(task.status || 'RESULT'),
          taskId: task.id,
          rows: [
            ['GitHub', 'RESULT POSTED', 'success'],
            ['Issue', issueRow.label, issueRow.emphasis],
          ],
        });
      }
      if (this.rawLogsEnabled()) {
        this.log(`YZ GitHub relay published ${task.status} result for ${task.id} on issue #${issueNumber}`);
      }
    }
  }

  async launchReadyAgents() {
    if (!this.config.autoLaunch) return;
    const ready = await this.store.listTasksEligibleForAgentLaunch({
      limit: 50,
    });
    for (const task of ready) {
      if (!this.belongs(task)) continue;
      if (!this.isLaunchAllowedForTask(task)) continue;
      let workspaceInfo;
      try {
        workspaceInfo = resolveTaskWorkspace(task);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.store.markAgentLaunched({
          id: task.id,
          error: message,
        });
        await this.debug.noteLaunchOutcome(task.id, {
          workspace: null,
          error: message,
        });
        this.present('failed', {
          taskId: task.id,
          reason: message,
          resultPosted: false,
          issueClosed: false,
        });
        this.log(`YZ GitHub relay did not launch Agent for ${task.id}: ${message}`);
        continue;
      }
      const reservation = await this.store.beginAgentLaunch({ id: task.id });
      if (!reservation.started) continue;
      await this.debug.noteLaunchReserved(reservation.task, {
        autoLaunchEnabled: this.config.autoLaunch,
        reservation: 'acquired',
        workspace: workspaceInfo.workspaceRoot,
        projectId: workspaceInfo.projectId,
        keepWindowOpen: this.config.keepWindowOpen,
        hostNoExit: this.config.keepWindowOpen,
        hostLaunchMode: this.config.keepWindowOpen ? 'persistent' : 'non-persistent',
      });
      this.present('status', {
        label: task.id,
        status: 'LAUNCH RESERVED',
        rows: [
          ['Project', `${workspaceInfo.displayName} (${workspaceInfo.projectId})`],
        ],
      });
      // AGENT LAUNCHER card (from launchVisibleAgent) covers Launching/Handoff; avoid duplicate AGENT LAUNCHING card.
      if (this.rawLogsEnabled()) {
        this.log(`YZ GitHub relay reserved Agent launch for ${task.id}`, {
          reservation: 'acquired',
          workspace: workspaceInfo.workspaceRoot,
          projectId: workspaceInfo.projectId,
          keepWindowOpen: this.config.keepWindowOpen,
          hostLaunchMode: this.config.keepWindowOpen ? 'persistent' : 'non-persistent',
        });
      }
      try {
        const agentPath = this.launcher.resolvePath({
          configuredPath: this.config.cursorAgentPath,
        });
        try {
          this.launcher.verify({ agentPath });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!agentPath || !/not authenticated|not logged/i.test(message)) throw error;
          this.log(`YZ GitHub relay: ${message} Opening a visible Agent window so login can complete locally.`);
        }
        const launched = await this.launcher.launch({
          taskId: task.id,
          workspacePath: workspaceInfo.workspaceRoot,
          agentPath,
          keepWindowOpen: this.config.keepWindowOpen,
        });
        await this.debug.noteLaunchSelected(task.id, {
          method: launched.method || null,
          launcherFile: launched.file || null,
          windowsAppsShim: Boolean(launched.windowsAppsShim),
          workspace: workspaceInfo.workspaceRoot,
          projectId: workspaceInfo.projectId,
          keepWindowOpen: launched.keepWindowOpen ?? this.config.keepWindowOpen,
          hostNoExit: launched.hostNoExit ?? this.config.keepWindowOpen,
          hostLaunchMode: launched.hostLaunchMode
            ?? (this.config.keepWindowOpen ? 'persistent' : 'non-persistent'),
        });
        await this.store.markAgentLaunched({
          id: task.id,
          pid: launched.pid,
          method: launched.method || null,
          session: launched.session || null,
        });
        if (launched.session) {
          await this.debug.noteAgentSessionRegistered(task.id, launched.session);
        }
        await this.debug.noteLaunchOutcome(task.id, {
          pid: launched.pid || null,
          method: launched.method || null,
          launcherFile: launched.file || null,
          windowsAppsShim: Boolean(launched.windowsAppsShim),
          handoff: launched.handoff || null,
          workspace: workspaceInfo.workspaceRoot,
          projectId: workspaceInfo.projectId,
          keepWindowOpen: launched.keepWindowOpen ?? this.config.keepWindowOpen,
          hostNoExit: launched.hostNoExit ?? this.config.keepWindowOpen,
          hostLaunchMode: launched.hostLaunchMode
            ?? (this.config.keepWindowOpen ? 'persistent' : 'non-persistent'),
          session: launched.session || null,
        });
        this.present('status', {
          label: task.id,
          status: launched.session ? 'SESSION REGISTERED' : 'AGENT RUNNING',
          rows: [
            ...(launched.pid != null ? [['PID', String(launched.pid)]] : []),
            ['Project', `${workspaceInfo.displayName} (${workspaceInfo.projectId})`],
          ],
        });
        if (this.rawLogsEnabled()) {
          this.log(`YZ GitHub relay launched visible Cursor Agent for ${task.id}`, {
            pid: launched.pid || null,
            file: launched.file,
            method: launched.method || null,
            windowsAppsShim: Boolean(launched.windowsAppsShim),
            handoff: launched.handoff || null,
            projectId: workspaceInfo.projectId,
            workspace: workspaceInfo.workspaceRoot,
            keepWindowOpen: launched.keepWindowOpen ?? this.config.keepWindowOpen,
            hostNoExit: launched.hostNoExit ?? this.config.keepWindowOpen,
            hostLaunchMode: launched.hostLaunchMode
              ?? (this.config.keepWindowOpen ? 'persistent' : 'non-persistent'),
          });
        }
      } catch (error) {
        const diagnostic = error instanceof VisibleAgentLaunchError ? (error.diagnostic || {}) : {};
        const message = error instanceof CursorAgentUnavailableError
          || error instanceof VisibleAgentLaunchError
          || error instanceof ProjectRegistryError
          ? error.message
          : (error instanceof Error ? error.message : String(error));
        await this.debug.noteLaunchSelected(task.id, {
          method: diagnostic.method || null,
          launcherFile: diagnostic.file || null,
          windowsAppsShim: Boolean(diagnostic.windowsAppsShim),
          workspace: workspaceInfo.workspaceRoot,
          projectId: workspaceInfo.projectId,
          keepWindowOpen: this.config.keepWindowOpen,
          hostNoExit: this.config.keepWindowOpen,
          hostLaunchMode: this.config.keepWindowOpen ? 'persistent' : 'non-persistent',
        });
        await this.store.markAgentLaunched({
          id: task.id,
          pid: diagnostic.pid || null,
          error: message,
          method: diagnostic.method || null,
        });
        await this.debug.noteLaunchOutcome(task.id, {
          pid: diagnostic.pid || null,
          method: diagnostic.method || null,
          launcherFile: diagnostic.file || null,
          windowsAppsShim: Boolean(diagnostic.windowsAppsShim),
          workspace: workspaceInfo.workspaceRoot,
          projectId: workspaceInfo.projectId,
          keepWindowOpen: this.config.keepWindowOpen,
          hostNoExit: this.config.keepWindowOpen,
          hostLaunchMode: this.config.keepWindowOpen ? 'persistent' : 'non-persistent',
          error: message,
        });
        this.present('failed', {
          taskId: task.id,
          reason: message,
          resultPosted: false,
          issueClosed: false,
        });
        // Always keep launch failures visible (not only raw/debug mode).
        this.log(`YZ GitHub relay did not launch Agent for ${task.id}: ${message}`, {
          pid: diagnostic.pid || null,
          method: diagnostic.method || null,
          file: diagnostic.file || null,
          windowsAppsShim: Boolean(diagnostic.windowsAppsShim),
          starterExitCode: diagnostic.starterExitCode ?? null,
          projectId: workspaceInfo.projectId,
        });
      }
    }
  }

  async autoCloseCompletedAgents() {
    if (!this.config.autoCloseCompleted) return;
    const tasks = await this.store.listTasksEligibleForCompletedAgentAutoClose({
      limit: 50,
    });
    for (const task of tasks) {
      if (!this.belongs(task)) continue;
      const session = normalizeExactAgentSession(task.metadata?.agentSession);
      const reservation = await this.store.beginCompletedAgentAutoClose({ id: task.id });
      if (!reservation.started) continue;
      await this.debug.noteAgentAutoCloseScheduled(task.id, session);
      this.present('status', {
        label: task.id,
        status: 'AUTO-CLOSE SCHEDULED',
        rows: task.projectId ? [['Project', String(task.projectId)]] : undefined,
      });
      try {
        await this.closer.delay(1500);
        await this.debug.noteAgentAutoCloseStarted(task.id, session);
        const result = await this.closer.closeTaskSession({ taskId: task.id, session });
        if (!result?.ok || !result?.processCloseVerified) {
          const message = result?.reason
            || 'auto-close did not verify graceful process close (refusing false-positive window close)';
          await this.store.markCompletedAgentAutoClose({ id: task.id, error: message, result });
          await this.debug.noteAgentAutoCloseFailed(task.id, session, message, result);
          this.present('lifecycle', {
            state: 'FAILED',
            taskId: task.id,
            reason: message,
            rows: [['Agent', 'AUTO-CLOSE FAILED', 'danger']],
          });
          this.log(`YZ GitHub relay could not auto-close Agent for ${task.id}: ${message}`, {
            pid: session?.pid ?? null,
            processClosed: Boolean(result?.processClosed),
            exitCode: result?.exitCode ?? null,
            windowClosed: Boolean(result?.windowClosed),
            terminalCloseVisibility: result?.terminalCloseVisibility || null,
          });
          continue;
        }
        await this.store.markCompletedAgentAutoClose({ id: task.id, result });
        await this.debug.noteAgentAutoCloseCompleted(task.id, session, result);
        this.present('auto-closed', { taskId: task.id });
        if (this.rawLogsEnabled()) {
          this.log(`YZ GitHub relay auto-closed Agent session for ${task.id}`, {
            pid: session?.pid ?? null,
            alreadyExited: Boolean(result?.alreadyExited),
            processClosed: Boolean(result?.processClosed),
            intentionalClose: Boolean(result?.intentionalClose),
            exitCode: result?.exitCode ?? null,
            windowClosed: Boolean(result?.windowClosed),
            terminalCloseVisibility: result?.terminalCloseVisibility || null,
            fullAutoCloseSuccess: Boolean(result?.fullAutoCloseSuccess),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.store.markCompletedAgentAutoClose({ id: task.id, error: message });
        await this.debug.noteAgentAutoCloseFailed(task.id, session, error);
        this.present('lifecycle', {
          state: 'FAILED',
          taskId: task.id,
          reason: message,
          rows: [['Agent', 'AUTO-CLOSE FAILED', 'danger']],
        });
        this.log(`YZ GitHub relay could not auto-close Agent for ${task.id}: ${message}`, {
          pid: session?.pid ?? null,
        });
      }
    }
  }
}
