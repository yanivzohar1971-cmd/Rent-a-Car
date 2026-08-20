import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../src/store.js';
import { buildGithubResultPreview, E2eDebugStore, E2E_DEBUG_SCHEMA, summarizeE2eDebug } from '../src/e2eDebug.js';
import { GithubInboxWorker } from '../src/github/githubInboxWorker.js';
import { formatGithubResultComment } from '../src/result/structuredResult.js';
import { VisibleAgentLaunchError } from '../src/agent/cursorAgentLauncher.js';

const CONFIG = {
  repo: 'yanivzohar1971-cmd/Rent-a-Car',
  project: 'Rent_a_Car',
  allowedAuthor: 'yanivzohar1971-cmd',
  titlePrefix: '[YZ-BRIDGE]',
  intervalMs: 15_000,
  autoLaunch: true,
  autoCloseCompleted: true,
  keepWindowOpen: true,
  workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
  cursorAgentPath: 'agent',
  taskLabel: 'yz-bridge-task',
  applyLabel: true,
};

function silentLogger() {
  return { error() {}, info() {} };
}

class FakeGithub {
  constructor(issues = []) {
    this.issues = issues;
    this.comments = new Map();
    this.closed = new Set();
  }

  async listOpenIssues() {
    return this.issues.filter((issue) => issue.state === 'open');
  }

  async listComments(issueNumber) {
    return this.comments.get(String(issueNumber)) || [];
  }

  async addComment(issueNumber, body) {
    const key = String(issueNumber);
    const list = this.comments.get(key) || [];
    list.push({ id: list.length + 1, body });
    this.comments.set(key, list);
    return { id: list.length, body };
  }

  async closeIssue(issueNumber) {
    this.closed.add(String(issueNumber));
    return { state: 'closed' };
  }

  async addLabel() {}
}

function eligibleIssue(overrides = {}) {
  return {
    number: 14,
    state: 'open',
    title: '[YZ-BRIDGE] E2E verification',
    body: 'Verify the relay path safely.',
    html_url: 'https://github.com/yanivzohar1971-cmd/Rent-a-Car/issues/14',
    user: { login: 'yanivzohar1971-cmd' },
    ...overrides,
  };
}

function launcherSuccess() {
  return {
    resolvePath() { return 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd'; },
    verify() { return { version: 'test', status: 'ok' }; },
    async launch() {
      return {
        pid: 9804,
        file: 'C:\\Users\\Yaniv\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
        method: 'wt',
        windowsAppsShim: true,
        handoff: 'windows-apps-wt-shim',
        keepWindowOpen: true,
        session: {
          taskId: 'TASK-00001',
          nonce: 'nonce-debug',
          pid: 7777,
          startedAt: '2026-08-20T07:00:00.000Z',
          registeredAt: '2026-08-20T07:00:00.100Z',
          file: 'C:\\temp\\TASK-00001.json',
          workspace: CONFIG.workspacePath,
        },
      };
    },
  };
}

async function withStores(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-debug-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    const debug = new E2eDebugStore({ dataFile: store.filePath });
    await fn({ dir, store, debug });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('per-task debug JSON is created on GitHub ingestion and latest file is updated', async () => {
  await withStores(async ({ store, debug }) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: launcherSuccess(),
    });
    await worker.tick();
    const task = await store.findByGithubIssueNumber('14');
    const journal = await debug.read(task.id);
    assert.equal(journal.debugSchema, E2E_DEBUG_SCHEMA);
    assert.equal(journal.github.issueNumber, 14);
    assert.equal(journal.task.project, 'Rent_a_Car');
    assert.equal(journal.events.some((event) => event.type === 'github_issue_ingested'), true);
    const latest = JSON.parse(await readFile(debug.latestFile, 'utf8'));
    assert.equal(latest.taskId, task.id);
  });
});

test('launch reservation and successful launcher handoff are journaled once', async () => {
  await withStores(async ({ store, debug }) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: launcherSuccess(),
    });
    await worker.tick();
    await worker.tick();
    const task = await store.findByGithubIssueNumber('14');
    const journal = await debug.read(task.id);
    assert.equal(journal.launch.reservation, 'acquired');
    assert.equal(journal.launch.method, 'wt');
    assert.equal(journal.launch.windowsAppsShim, true);
    assert.equal(journal.launch.handoff, 'windows-apps-wt-shim');
    assert.equal(journal.events.filter((event) => event.type === 'agent_launch_reserved').length, 1);
    assert.equal(journal.events.filter((event) => event.type === 'agent_launcher_handoff').length, 1);
  });
});

test('launch failure is journaled safely', async () => {
  await withStores(async ({ store, debug }) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: {
        resolvePath() { return 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd'; },
        verify() { return { version: 'test', status: 'ok' }; },
        async launch() {
          throw new VisibleAgentLaunchError('Failed to open a visible Agent window for TASK-00001 (method=wt, starterExit=1)', {
            method: 'wt',
            file: 'wt.exe',
            starterExitCode: 1,
          });
        },
      },
    });
    await worker.tick();
    const task = await store.findByGithubIssueNumber('14');
    const journal = await debug.read(task.id);
    assert.match(journal.launch.launchError, /starterExit=1/);
    assert.equal(journal.final.failureStage, 'BEFORE_MCP_ATTACH');
    assert.equal(journal.events.some((event) => event.type === 'agent_launch_failed'), true);
  });
});

test('BOM JSON parse launch failure is a distinct debug stage', async () => {
  await withStores(async ({ store, debug }) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue({ number: 23 })]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: {
        resolvePath() { return 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd'; },
        verify() { return { version: 'test', status: 'ok' }; },
        async launch() {
          throw new VisibleAgentLaunchError(
            'Visible Agent session JSON could not be parsed (UTF-8 BOM or invalid session JSON): Invalid JSON in session.json: Unexpected token',
            { method: 'registration', file: 'C:\\temp\\session.json', pid: null, stage: 'AGENT_SESSION_JSON_BOM' },
          );
        },
      },
    });
    await worker.tick();
    const task = await store.findByGithubIssueNumber('23');
    const journal = await debug.read(task.id);
    assert.match(journal.launch.launchError, /UTF-8 BOM/);
    assert.equal(journal.final.failureStage, 'AGENT_LAUNCH_JSON_BOM');
    assert.equal(journal.events.some((event) => event.type === 'agent_launch_failed'), true);
    assert.equal(journal.events.some((event) => event.type === 'agent_session_registered'), false);
  });
});

test('MCP tool sequence and failures are captured centrally', async () => {
  await withStores(async ({ store, debug }) => {
    const task = await store.importGithubTask({
      githubIssueNumber: '18',
      githubIssueTitle: '[YZ-BRIDGE] TASK-00018',
      githubIssueUrl: 'https://example.invalid/issues/18',
      project: 'Rent_a_Car',
      title: 'TASK-00018',
      instructions: 'Observe MCP calls.',
    });
    await debug.noteGithubIssueIngested({
      task: task.task,
      repo: CONFIG.repo,
      issue: eligibleIssue({ number: 18 }),
    });
    await debug.noteMcpToolStarted({ toolName: 'bridge_claim_task', input: { id: task.task.id, actor: 'cursor' } });
    await debug.noteMcpToolCompleted({
      toolName: 'bridge_claim_task',
      input: { id: task.task.id, actor: 'cursor' },
      startedAt: '2026-08-20T05:55:28.123Z',
      success: true,
    });
    await debug.noteMcpToolStarted({ toolName: 'bridge_get_task', input: { id: task.task.id } });
    await debug.noteMcpToolCompleted({
      toolName: 'bridge_get_task',
      input: { id: task.task.id },
      startedAt: '2026-08-20T05:55:29.123Z',
      success: false,
      error: new Error('Bearer secret-token should be redacted'),
    });
    const journal = await debug.read(task.task.id);
    assert.equal(journal.mcp.serverReadyObserved, true);
    assert.deepEqual(journal.mcp.toolCalls.map((item) => item.tool), ['bridge_claim_task', 'bridge_get_task']);
    assert.equal(journal.interaction.lastObservedTool, 'bridge_claim_task');
    assert.equal(journal.interaction.expectedNextTool, 'bridge_get_task');
    assert.match(journal.mcp.toolCalls[1].error, /\[redacted\]/);
  });
});

test('GitHub result publication includes a compact debug summary and close event', async () => {
  await withStores(async ({ store, debug }) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: launcherSuccess(),
    });
    await worker.tick();
    const task = await store.findByGithubIssueNumber('14');
    await debug.noteMcpToolStarted({ toolName: 'bridge_claim_task', input: { id: task.id, actor: 'cursor' } });
    await debug.noteMcpToolCompleted({ toolName: 'bridge_claim_task', input: { id: task.id, actor: 'cursor' }, startedAt: '2026-08-20T05:55:28.123Z', success: true });
    await debug.noteMcpToolStarted({ toolName: 'bridge_get_task', input: { id: task.id } });
    await debug.noteMcpToolCompleted({ toolName: 'bridge_get_task', input: { id: task.id }, startedAt: '2026-08-20T05:55:29.123Z', success: true });
    await debug.noteMcpToolStarted({ toolName: 'bridge_update_task', input: { id: task.id, actor: 'cursor', status: 'COMPLETED' } });
    await debug.noteMcpToolCompleted({ toolName: 'bridge_update_task', input: { id: task.id, actor: 'cursor', status: 'COMPLETED' }, startedAt: '2026-08-20T05:55:30.123Z', success: true });
    await store.claimTask({ id: task.id, actor: 'cursor' });
    await store.updateTask({ id: task.id, status: 'COMPLETED', summary: 'E2E pass confirmed' });
    const updatedTask = await store.getTask(task.id);
    await debug.noteTaskSnapshot(updatedTask);
    const preview = buildGithubResultPreview(await debug.read(task.id), updatedTask, { issueClosed: true });
    const comment = await formatGithubResultComment(updatedTask, {
      debug: preview,
      debugStore: debug,
      debugSummary: summarizeE2eDebug(preview),
    });
    assert.match(comment, /"mcpToolsObserved"/);
    assert.match(comment, /"bridge_update_task"/);
    assert.match(comment, /"approvalVisibility": "unsupported"/);
    assert.match(comment, /"unattendedPass": false/);
  });
});

test('already-launched tasks do not accumulate repeated debug spam across polls', async () => {
  await withStores(async ({ store, debug }) => {
    const task = await store.importGithubTask({
      githubIssueNumber: '22',
      githubIssueTitle: '[YZ-BRIDGE] Already launched',
      githubIssueUrl: 'https://example.invalid/issues/22',
      project: 'Rent_a_Car',
      title: 'Already launched',
      instructions: 'No relaunch.',
    });
    await debug.noteGithubIssueIngested({
      task: task.task,
      repo: CONFIG.repo,
      issue: eligibleIssue({ number: 22 }),
    });
    await store.markAgentLaunched({ id: task.task.id, pid: 2222, method: 'wt' });
    const launchedTask = await store.getTask(task.task.id);
    await debug.noteLaunchReserved(launchedTask, {
      autoLaunchEnabled: true,
      reservation: 'acquired',
      workspace: CONFIG.workspacePath,
      keepWindowOpen: true,
    });
    await debug.noteLaunchOutcome(task.task.id, {
      pid: 2222,
      method: 'wt',
      launcherFile: 'wt.exe',
      windowsAppsShim: true,
      handoff: 'windows-apps-wt-shim',
    });
    const worker = new GithubInboxWorker({
      client: new FakeGithub([]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: launcherSuccess(),
    });
    await worker.tick();
    await worker.tick();
    const journal = await debug.read(task.task.id);
    assert.equal(journal.events.filter((event) => event.type === 'agent_launch_reserved').length, 1);
    assert.equal(journal.events.filter((event) => event.type === 'agent_launcher_handoff').length, 1);
  });
});

test('multiple tasks keep separate journals and safe summaries', async () => {
  await withStores(async ({ store, debug }) => {
    const first = await store.importGithubTask({
      githubIssueNumber: '31',
      githubIssueTitle: '[YZ-BRIDGE] First',
      githubIssueUrl: 'https://example.invalid/issues/31',
      project: 'Rent_a_Car',
      title: 'First',
      instructions: 'First flow',
    });
    const second = await store.importGithubTask({
      githubIssueNumber: '32',
      githubIssueTitle: '[YZ-BRIDGE] Second',
      githubIssueUrl: 'https://example.invalid/issues/32',
      project: 'Rent_a_Car',
      title: 'Second',
      instructions: 'Second flow',
    });
    await debug.noteGithubIssueIngested({ task: first.task, repo: CONFIG.repo, issue: eligibleIssue({ number: 31, title: '[YZ-BRIDGE] First' }) });
    await debug.noteGithubIssueIngested({ task: second.task, repo: CONFIG.repo, issue: eligibleIssue({ number: 32, title: '[YZ-BRIDGE] Second' }) });
    const firstDebug = await debug.read(first.task.id);
    const secondDebug = await debug.read(second.task.id);
    assert.equal(firstDebug.github.issueNumber, 31);
    assert.equal(secondDebug.github.issueNumber, 32);
    assert.notEqual(firstDebug.taskId, secondDebug.taskId);
    assert.deepEqual(summarizeE2eDebug(firstDebug).mcpToolsObserved, []);
  });
});

test('auto-close lifecycle events are journaled once the completed session is closed', async () => {
  await withStores(async ({ store, debug }) => {
    const client = new FakeGithub([eligibleIssue({ number: 41 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: launcherSuccess(),
      closer: {
        async delay() {},
        async closeTaskSession() {
          return {
            ok: true,
            alreadyExited: false,
            processClosed: true,
            processCloseVerified: true,
            intentionalClose: true,
            exitCode: 0,
            windowClosed: false,
            terminalCloseVisibility: 'unsupported',
            fullAutoCloseSuccess: false,
            method: 'close-request',
          };
        },
      },
    });
    await worker.tick();
    await worker.tick();
    const task = await store.findByGithubIssueNumber('41');
    await store.claimTask({ id: task.id, actor: 'cursor' });
    await store.updateTask({ id: task.id, status: 'COMPLETED', summary: 'done' });
    await worker.tick();
    const journal = await debug.read(task.id);
    assert.equal(journal.events.some((event) => event.type === 'agent_session_registered'), true);
    assert.equal(journal.events.some((event) => event.type === 'agent_auto_close_scheduled'), true);
    assert.equal(journal.events.some((event) => event.type === 'agent_auto_close_started'), true);
    assert.equal(journal.events.some((event) => event.type === 'agent_auto_close_completed'), true);
    const completed = journal.events.find((event) => event.type === 'agent_auto_close_completed');
    assert.equal(completed.processClosed, true);
    assert.equal(completed.exitCode, 0);
    assert.equal(completed.windowClosed, false);
    assert.equal(completed.terminalCloseVisibility, 'unsupported');
    assert.equal(journal.launch.autoCloseFullSuccess, false);
  });
});

test('debug does not mark auto-close complete when process close is unverified', async () => {
  await withStores(async ({ store, debug }) => {
    const client = new FakeGithub([eligibleIssue({ number: 42 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: launcherSuccess(),
      closer: {
        async delay() {},
        async closeTaskSession() {
          return {
            ok: false,
            processClosed: false,
            processCloseVerified: false,
            intentionalClose: true,
            exitCode: null,
            windowClosed: false,
            terminalCloseVisibility: 'unsupported',
            fullAutoCloseSuccess: false,
            reason: 'wrapper-did-not-exit-after-close-request',
            method: 'close-request-timeout',
          };
        },
      },
    });
    await worker.tick();
    await worker.tick();
    const task = await store.findByGithubIssueNumber('42');
    await store.claimTask({ id: task.id, actor: 'cursor' });
    await store.updateTask({ id: task.id, status: 'COMPLETED', summary: 'done' });
    await worker.tick();
    const journal = await debug.read(task.id);
    const updated = await store.getTask(task.id);
    assert.equal(journal.events.some((event) => event.type === 'agent_auto_close_completed'), false);
    assert.equal(journal.events.some((event) => event.type === 'agent_auto_close_failed'), true);
    assert.equal(updated.metadata.agentAutoCloseCompletedAt, null);
    assert.match(updated.metadata.agentAutoCloseError, /false-positive|verify|wrapper-did-not-exit/i);
  });
});

test('unattendedPass stays false when approval visibility is unsupported', async () => {
  await withStores(async ({ store, debug }) => {
    const task = await store.importGithubTask({
      githubIssueNumber: '43',
      githubIssueTitle: '[YZ-BRIDGE] Unattended honesty',
      githubIssueUrl: 'https://example.invalid/issues/43',
      project: 'Rent_a_Car',
      title: 'Unattended honesty',
      instructions: 'Check unattendedPass',
    });
    await debug.noteGithubIssueIngested({
      task: task.task,
      repo: CONFIG.repo,
      issue: eligibleIssue({ number: 43, title: '[YZ-BRIDGE] Unattended honesty' }),
    });
    await store.claimTask({ id: task.task.id, actor: 'cursor' });
    await store.updateTask({ id: task.task.id, status: 'COMPLETED', summary: 'done' });
    const updated = await store.getTask(task.task.id);
    await debug.noteTaskSnapshot(updated);
    await debug.noteGithubResultPublished(updated, { issueClosed: true });
    const journal = await debug.read(task.task.id);
    assert.equal(journal.interaction.approvalVisibility, 'unsupported');
    assert.equal(journal.interaction.unattendedPass, false);
    const preview = buildGithubResultPreview(journal, updated, { issueClosed: true });
    assert.equal(preview.interaction.unattendedPass, false);
  });
});
