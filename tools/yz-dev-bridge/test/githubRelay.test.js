import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore, AGENT_LAUNCH_RETRY_AFTER_MS } from '../src/store.js';
import { GithubInboxWorker } from '../src/github/githubInboxWorker.js';
import { isEligibleGithubIssue, mapGithubIssueToLocalInput } from '../src/github/issueMapper.js';
import { CursorAgentUnavailableError, VisibleAgentLaunchError } from '../src/agent/cursorAgentLauncher.js';
import { formatGithubResultComment, isGithubTerminalTask, toStructuredResult } from '../src/result/structuredResult.js';

const CONFIG = {
  repo: 'yanivzohar1971-cmd/Rent-a-Car',
  project: 'Rent_a_Car',
  projectId: 'rent-a-car',
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
    this.labels = [];
    this.commentPosts = 0;
  }

  async listOpenIssues() {
    return this.issues.filter((issue) => issue.state === 'open');
  }

  async listComments(issueNumber) {
    return this.comments.get(String(issueNumber)) || [];
  }

  async addComment(issueNumber, body) {
    this.commentPosts += 1;
    const list = this.comments.get(String(issueNumber)) || [];
    list.push({ id: list.length + 1, body });
    this.comments.set(String(issueNumber), list);
    return { id: list.length, body };
  }

  async closeIssue(issueNumber) {
    this.closed.add(String(issueNumber));
    const issue = this.issues.find((item) => String(item.number) === String(issueNumber));
    if (issue) issue.state = 'closed';
    return { state: 'closed' };
  }

  async addLabel(issueNumber, label) {
    this.labels.push({ issueNumber, label });
  }
}

function eligibleIssue(overrides = {}) {
  return {
    number: 42,
    state: 'open',
    title: '[YZ-BRIDGE] Harmless connectivity',
    body: 'Do not modify Rent_a_Car source code.',
    html_url: 'https://github.com/yanivzohar1971-cmd/Rent-a-Car/issues/42',
    user: { login: 'yanivzohar1971-cmd' },
    ...overrides,
  };
}

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-github-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    await fn(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function mockLauncher(launches) {
  return {
    resolvePath() { return 'C:\\fake\\agent.exe'; },
    verify() { return { version: 'test', status: 'ok' }; },
    launch(input) {
      launches.push(input);
      return {
        pid: 4242,
        file: 'wt.exe',
        args: ['-d', input.workspacePath],
        session: {
          taskId: input.taskId,
          nonce: `nonce-${input.taskId}`,
          pid: 5252,
          startedAt: '2026-08-20T07:00:00.000Z',
          registeredAt: '2026-08-20T07:00:00.100Z',
          file: `C:\\temp\\${input.taskId}.json`,
          workspace: input.workspacePath,
        },
      };
    },
  };
}

test('eligible GitHub issue creates exactly one local task', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue()]);
    const launches = [];
    const worker = new GithubInboxWorker({
      client,
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    const listed = await store.listGithubRelayTasks();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].project, 'Rent_a_Car');
    assert.equal(listed[0].projectId, 'rent-a-car');
    assert.equal(listed[0].metadata.githubIssueNumber, '42');
    assert.equal(listed[0].metadata.githubRepo, CONFIG.repo);
    assert.match(client.comments.get('42')[0].body, /TASK-00001/);
    assert.equal(launches.length, 0);
  });
});

test('wrong author is ignored', async () => {
  await withStore(async (store) => {
    const issue = eligibleIssue({ user: { login: 'someone-else' } });
    assert.equal(isEligibleGithubIssue(issue, CONFIG), false);
    const worker = new GithubInboxWorker({
      client: new FakeGithub([issue]),
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher([]),
    });
    await worker.tick();
    assert.equal((await store.listGithubRelayTasks()).length, 0);
  });
});

test('missing [YZ-BRIDGE] prefix is ignored', async () => {
  await withStore(async (store) => {
    const issue = eligibleIssue({ title: 'Please do work' });
    assert.equal(isEligibleGithubIssue(issue, CONFIG), false);
    const worker = new GithubInboxWorker({
      client: new FakeGithub([issue]),
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher([]),
    });
    await worker.tick();
    assert.equal((await store.listGithubRelayTasks()).length, 0);
  });
});

test('restart does not duplicate ingestion or ack comments', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue()]);
    const config = { ...CONFIG, autoLaunch: false };
    const first = new GithubInboxWorker({
      client, store, config, logger: silentLogger(), launcher: mockLauncher([]),
    });
    await first.tick();
    const second = new GithubInboxWorker({
      client, store, config, logger: silentLogger(), launcher: mockLauncher([]),
    });
    await second.tick();
    await second.tick();
    const listed = await store.listGithubRelayTasks();
    assert.equal(listed.length, 1);
    assert.equal(client.commentPosts, 1);
  });
});

test('completion result is posted once and issue is closed', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue()]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher([]),
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('42');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.updateTask({
      id: local.id,
      status: 'COMPLETED',
      summary: 'Connectivity confirmed',
      changedFiles: [],
      tests: ['harmless verification'],
      metadata: {
        structuredResult: {
          behaviorChanged: [],
          behaviorPreserved: ['GitHub inbox transport'],
          nextRecommendedStep: 'None',
        },
      },
    });
    await worker.tick();
    await worker.tick();
    const comments = client.comments.get('42');
    assert.equal(comments.filter((item) => item.body.includes('yz-bridge-result')).length, 1);
    assert.equal(client.closed.has('42'), true);
    assert.match(await formatGithubResultComment(await store.getTask(local.id)), /Connectivity confirmed/);
  });
});

test('failure result is posted once and issue stays open', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue({ number: 7 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher([]),
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('7');
    await store.updateTask({
      id: local.id,
      status: 'BLOCKED',
      summary: 'Agent unavailable',
      metadata: { failed: true, structuredResult: { rootCause: 'missing CLI' } },
    });
    await worker.tick();
    await worker.tick();
    assert.equal(client.comments.get('7').filter((item) => item.body.includes('yz-bridge-result')).length, 1);
    assert.equal(client.closed.has('7'), false);
    assert.equal(toStructuredResult(await store.getTask(local.id)).rootCause, 'missing CLI');
  });
});

test('automatic Agent launch occurs exactly once when enabled', async () => {
  await withStore(async (store) => {
    const launches = [];
    const client = new FakeGithub([eligibleIssue()]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    await worker.tick();
    await worker.tick();
    assert.equal(launches.length, 1);
    assert.equal(launches[0].taskId, 'TASK-00001');
    assert.equal(launches[0].workspacePath, CONFIG.workspacePath);
    const task = await store.getTask('TASK-00001');
    assert.equal(task.metadata.agentPid, 4242);
    assert.ok(task.metadata.agentLaunchedAt);
    assert.ok(task.metadata.agentLaunchStartedAt);
  });
});

test('automatic Agent launch does not occur when disabled', async () => {
  await withStore(async (store) => {
    const launches = [];
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: { ...CONFIG, autoLaunch: false },
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    assert.equal(launches.length, 0);
    const task = (await store.listGithubRelayTasks())[0];
    assert.equal(task.status, 'READY');
    assert.equal(task.metadata.agentLaunchedAt, null);
  });
});

test('missing cursor-agent is handled clearly without throwing the tick', async () => {
  await withStore(async (store) => {
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: {
        resolvePath() { return null; },
        verify() {
          throw new CursorAgentUnavailableError('cursor-agent/agent CLI was not found.');
        },
        launch() { throw new Error('should not spawn'); },
      },
    });
    await worker.tick();
    const task = (await store.listGithubRelayTasks())[0];
    assert.match(task.metadata.agentLaunchError, /not found/);
    assert.equal(task.metadata.agentLaunchedAt, null);
  });
});

test('immediate child exit is recorded as a launch diagnostic rather than success', async () => {
  await withStore(async (store) => {
    const logs = [];
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue()]),
      store,
      config: CONFIG,
      logger: { error(message) { logs.push(String(message)); }, info() {} },
      launcher: {
        resolvePath() { return 'C:\\fake\\agent.exe'; },
        verify() { return { version: 'test', status: 'ok' }; },
        async launch() {
          throw new VisibleAgentLaunchError(
            'Visible Agent window for TASK-00001 exited immediately (pid=16560, method=powershell-fallback)',
            { pid: 16560, method: 'powershell-fallback', starterExitCode: 0 },
          );
        },
      },
    });
    await worker.tick();
    const task = (await store.listGithubRelayTasks())[0];
    assert.equal(task.metadata.agentLaunchedAt, null);
    assert.equal(task.metadata.agentPid, 16560);
    assert.match(task.metadata.agentLaunchError, /exited immediately/);
    assert.equal(task.metadata.agentLaunchMethod, 'powershell-fallback');
    assert.equal(task.status, 'READY');
    assert.match(logs.join('\n'), /did not launch Agent/);
  });
});

test('WindowsApps wt shim PID exit does not clear a successful launch reservation', async () => {
  await withStore(async (store) => {
    const launches = [];
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue({ number: 9 })]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: {
        resolvePath() { return 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd'; },
        verify() { return { version: 'test', status: 'ok' }; },
        async launch(input) {
          launches.push(input);
          return {
            pid: 9804,
            file: 'C:\\Users\\Yaniv\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe',
            method: 'wt',
            windowsAppsShim: true,
            handoff: 'windows-apps-wt-shim',
            keepWindowOpen: true,
          };
        },
      },
    });
    await worker.tick();
    await worker.tick();
    await worker.tick();
    assert.equal(launches.length, 1);
    const task = (await store.listGithubRelayTasks())[0];
    assert.equal(task.id, 'TASK-00001');
    assert.ok(task.metadata.agentLaunchedAt);
    assert.ok(task.metadata.agentLaunchStartedAt);
    assert.equal(task.metadata.agentPid, 9804);
    assert.equal(task.metadata.agentLaunchError, null);
    assert.equal(task.metadata.agentLaunchMethod, 'wt');
  });
});

test('two same-project GitHub tasks serialize Agent launch; only one active at a time', async () => {
  await withStore(async (store) => {
    const launches = [];
    const worker = new GithubInboxWorker({
      client: new FakeGithub([
        eligibleIssue({ number: 9, title: '[YZ-BRIDGE] Task A' }),
        eligibleIssue({ number: 10, title: '[YZ-BRIDGE] Task B' }),
      ]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    await worker.tick();
    await worker.tick();
    assert.equal(launches.length, 1);
    const tasks = await store.listGithubRelayTasks();
    assert.equal(tasks.length, 2);
    const launched = tasks.filter((task) => task.metadata?.agentLaunchedAt);
    const waiting = tasks.filter((task) => !task.metadata?.agentLaunchedAt && !task.metadata?.agentLaunchStartedAt);
    assert.equal(launched.length, 1);
    assert.equal(waiting.length, 1);
  });
});

test('different-project GitHub tasks may launch concurrently', async () => {
  await withStore(async (store) => {
    const launches = [];
    const rentWorker = new GithubInboxWorker({
      client: new FakeGithub([
        eligibleIssue({ number: 9, title: '[YZ-BRIDGE] Rent task' }),
      ]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    const glassesWorker = new GithubInboxWorker({
      client: new FakeGithub([
        eligibleIssue({
          number: 9,
          title: '[YZ-BRIDGE] Glasses task',
          html_url: 'https://github.com/yanivzohar1971-cmd/Glasses/issues/9',
        }),
      ]),
      store,
      config: {
        ...CONFIG,
        repo: 'yanivzohar1971-cmd/Glasses',
        project: 'Glasses',
        projectId: 'glasses',
        workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Glasses',
        ownsLegacyGithubTasks: false,
      },
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await rentWorker.tick();
    await glassesWorker.tick();
    assert.equal(launches.length, 2);
    const workspaces = launches.map((item) => item.workspacePath).sort();
    assert.match(workspaces[0], /Glasses$/i);
    assert.match(workspaces[1], /Rent_a_Car$/i);
  });
});

test('restarting the relay does not relaunch an already reserved Agent', async () => {
  await withStore(async (store) => {
    const launches = [];
    const client = new FakeGithub([eligibleIssue({ number: 9 })]);
    const first = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await first.tick();
    const second = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await second.tick();
    await second.tick();
    assert.equal(launches.length, 1);
    const task = await store.getTask('TASK-00001');
    assert.ok(task.metadata.agentLaunchedAt);
  });
});

test('a genuine Start-Process failure can retry after the cooldown', async () => {
  await withStore(async (store) => {
    const launches = [];
    let attempts = 0;
    const worker = new GithubInboxWorker({
      client: new FakeGithub([eligibleIssue({ number: 9 })]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: {
        resolvePath() { return 'C:\\Users\\Yaniv\\AppData\\Local\\cursor-agent\\agent.cmd'; },
        verify() { return { version: 'test', status: 'ok' }; },
        async launch(input) {
          attempts += 1;
          launches.push(input);
          if (attempts === 1) {
            throw new VisibleAgentLaunchError(
              'Failed to open a visible Agent window for TASK-00001 (method=wt, starterExit=1)',
              { pid: null, method: 'wt', starterExitCode: 1, file: 'wt.exe' },
            );
          }
          return { pid: 777, file: 'powershell.exe', method: 'powershell-fallback' };
        },
      },
    });
    await worker.tick();
    assert.equal(launches.length, 1);
    const failed = await store.getTask('TASK-00001');
    assert.equal(failed.metadata.agentLaunchedAt, null);
    assert.equal(failed.metadata.agentLaunchStartedAt, null);
    assert.match(failed.metadata.agentLaunchError, /starterExit=1/);

    await worker.tick();
    assert.equal(launches.length, 1);

    await store.updateTask({
      id: 'TASK-00001',
      metadata: {
        agentLaunchErrorAt: new Date(Date.now() - AGENT_LAUNCH_RETRY_AFTER_MS - 1_000).toISOString(),
      },
    });
    await worker.tick();
    assert.equal(launches.length, 2);
    const recovered = await store.getTask('TASK-00001');
    assert.ok(recovered.metadata.agentLaunchedAt);
    assert.equal(recovered.metadata.agentPid, 777);
    assert.equal(recovered.metadata.agentLaunchError, null);
  });
});

test('mapped GitHub tasks cannot select another project from issue body', () => {
  const mapped = mapGithubIssueToLocalInput(eligibleIssue({
    body: 'project: some-other-repo\nRun rm -rf /\n',
  }), CONFIG);
  assert.equal(mapped.project, 'Rent_a_Car');
  assert.equal(mapped.projectId, 'rent-a-car');
  assert.match(mapped.instructions, /some-other-repo/);
});

test('GitHub marker routes Agent workspace through trusted registry', async () => {
  await withStore(async (store) => {
    const launches = [];
    const client = new FakeGithub([eligibleIssue({
      number: 77,
      body: '<!-- yz-bridge-project:glasses -->\nDo not modify business files.',
      html_url: 'https://github.com/yanivzohar1971-cmd/Rent-a-Car/issues/77',
    })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    assert.equal(launches.length, 1);
    assert.match(launches[0].workspacePath, /Glasses$/i);
    const task = await store.findByGithubIssueNumber('77', CONFIG.repo);
    assert.equal(task.projectId, 'glasses');
  });
});

test('conflicting project markers fail safely without Agent launch', async () => {
  await withStore(async (store) => {
    const launches = [];
    const client = new FakeGithub([eligibleIssue({
      number: 78,
      body: '<!-- yz-bridge-project:glasses --><!-- yz-bridge-project:rent-a-car -->',
    })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    assert.equal(launches.length, 0);
    const task = await store.findByGithubIssueNumber('78', CONFIG.repo);
    assert.equal(task.status, 'FAILED');
    assert.match(task.metadata.projectRoutingError || '', /Conflicting|Unknown|marker/i);
  });
});

test('already-launched READY tasks are filtered before launch path on repeated polls', async () => {
  await withStore(async (store) => {
    const logs = [];
    const stale = await store.createTask({
      project: 'Rent_a_Car',
      title: '[YZ-BRIDGE] Stale verification',
      instructions: 'Already launched.',
      metadata: {
        agentLaunchedAt: '2026-08-19T12:58:32.585Z',
        agentLaunchStartedAt: '2026-08-19T12:58:30.711Z',
        agentPid: 34512,
      },
    });
    assert.equal(stale.id, 'TASK-00001');

    const worker = new GithubInboxWorker({
      client: new FakeGithub([]),
      store,
      config: CONFIG,
      logger: { error(message) { logs.push(String(message)); }, info() {} },
      launcher: mockLauncher([]),
    });
    await worker.tick();
    await worker.tick();
    await worker.tick();
    assert.equal(logs.filter((line) => line.includes('skipped Agent launch')).length, 0);
    assert.equal(logs.filter((line) => line.includes('already-launched')).length, 0);
  });
});

test('completed tasks are ignored by agent launch polling', async () => {
  await withStore(async (store) => {
    const launches = [];
    const task = await store.createTask({
      project: 'Rent_a_Car',
      title: '[YZ-BRIDGE] Completed',
      instructions: 'Done.',
    });
    await store.updateTask({ id: task.id, status: 'COMPLETED', summary: 'done' });
    const worker = new GithubInboxWorker({
      client: new FakeGithub([]),
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher(launches),
    });
    await worker.tick();
    await worker.tick();
    assert.equal(launches.length, 0);
  });
});

test('completed task auto-closes only after GitHub result publication and issue close', async () => {
  await withStore(async (store) => {
    const calls = [];
    const client = new FakeGithub([eligibleIssue({ number: 88 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher([]),
      closer: {
        async delay(ms) { calls.push(`delay:${ms}`); },
        async closeTaskSession({ taskId, session }) {
          calls.push(`close:${taskId}:${session.pid}`);
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
    const local = await store.findByGithubIssueNumber('88');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 1111,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-88',
        pid: 2222,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00001.json',
      },
    });
    await store.updateTask({ id: local.id, status: 'COMPLETED', summary: 'done' });
    await worker.autoCloseCompletedAgents();
    assert.deepEqual(calls, []);
    await worker.tick();
    assert.deepEqual(calls, ['delay:1500', `close:${local.id}:2222`]);
    const task = await store.getTask(local.id);
    assert.ok(task.metadata.githubResultPostedAt);
    assert.ok(task.metadata.agentAutoCloseCompletedAt);
    assert.equal(client.closed.has('88'), true);
  });
});

test('FAILED verification status is posted once, issue stays open, and is not auto-closed', async () => {
  await withStore(async (store) => {
    const calls = [];
    const client = new FakeGithub([eligibleIssue({ number: 24 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher([]),
      closer: {
        async delay() { calls.push('delay'); },
        async closeTaskSession() { calls.push('close'); return { ok: true, processClosed: true, processCloseVerified: true, exitCode: 0, intentionalClose: true }; },
      },
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('24');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 1111,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-24',
        pid: 5555,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00024.json',
      },
    });
    await store.updateTask({
      id: local.id,
      status: 'FAILED',
      summary: 'Verification failed',
      metadata: { verificationFailed: true, structuredResult: { rootCause: 'auto-launch BOM' } },
    });
    const task = await store.getTask(local.id);
    assert.equal(isGithubTerminalTask(task), true);
    assert.equal(toStructuredResult(task).status, 'FAILED');
    await worker.tick();
    await worker.tick();
    assert.equal(client.comments.get('24').filter((item) => item.body.includes('yz-bridge-result')).length, 1);
    assert.equal(client.closed.has('24'), false);
    assert.deepEqual(calls, []);
  });
});

test('verification failure must not be encoded as COMPLETED with failure metadata', () => {
  const completedFailed = toStructuredResult({
    status: 'COMPLETED',
    summary: 'verification failed',
    metadata: { failed: true, verificationFailed: true },
  });
  assert.equal(completedFailed.status, 'FAILED');
  const honestFailed = toStructuredResult({
    status: 'FAILED',
    summary: 'verification failed',
    metadata: { verificationFailed: true },
  });
  assert.equal(honestFailed.status, 'FAILED');
});

test('failed task remains open and is never auto-closed', async () => {
  await withStore(async (store) => {
    const calls = [];
    const client = new FakeGithub([eligibleIssue({ number: 89 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher([]),
      closer: {
        async delay() { calls.push('delay'); },
        async closeTaskSession() { calls.push('close'); return { ok: true, processClosed: true, processCloseVerified: true, exitCode: 0, intentionalClose: true }; },
      },
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('89');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 1111,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-89',
        pid: 3333,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00001.json',
      },
    });
    await store.updateTask({ id: local.id, status: 'BLOCKED', summary: 'failed', metadata: { failed: true } });
    await worker.tick();
    assert.deepEqual(calls, []);
    assert.equal(client.closed.has('89'), false);
  });
});

test('duplicate relay polls do not repeat completed task auto-close attempts', async () => {
  await withStore(async (store) => {
    let closeCount = 0;
    const client = new FakeGithub([eligibleIssue({ number: 90 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher([]),
      closer: {
        async delay() {},
        async closeTaskSession() {
          closeCount += 1;
          return {
            ok: true,
            processClosed: true,
            processCloseVerified: true,
            intentionalClose: true,
            exitCode: 0,
            windowClosed: false,
            terminalCloseVisibility: 'unsupported',
            fullAutoCloseSuccess: false,
          };
        },
      },
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('90');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 1111,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-90',
        pid: 4444,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00001.json',
      },
    });
    await store.updateTask({ id: local.id, status: 'COMPLETED', summary: 'done' });
    await worker.tick();
    await worker.tick();
    await worker.tick();
    assert.equal(closeCount, 1);
  });
});

test('auto-close failure is logged once and does not invalidate COMPLETED', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue({ number: 91 })]);
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger: silentLogger(),
      launcher: mockLauncher([]),
      closer: {
        async delay() {},
        async closeTaskSession() {
          throw new Error('start time mismatch');
        },
      },
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('91');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 1111,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-91',
        pid: 5555,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00001.json',
      },
    });
    await store.updateTask({ id: local.id, status: 'COMPLETED', summary: 'done' });
    await worker.tick();
    const task = await store.getTask(local.id);
    assert.equal(task.status, 'COMPLETED');
    assert.ok(task.metadata.githubResultPostedAt);
    assert.match(task.metadata.agentAutoCloseError, /mismatch/);
    assert.equal(client.closed.has('91'), true);
  });
});

function capturingLogger() {
  const logs = [];
  return {
    logs,
    error(message) { logs.push(String(message)); },
    info() {},
  };
}

test('normal-mode ingest/ack/launch presentation uses cards, not loose status lines', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue({ number: 36, title: '[YZ-BRIDGE] Dashboard cleanup' })]);
    const logger = capturingLogger();
    const worker = new GithubInboxWorker({
      client,
      store,
      config: { ...CONFIG, autoLaunch: true, autoCloseCompleted: false },
      logger,
      launcher: mockLauncher([]),
    });
    await worker.tick();
    const text = logger.logs.join('\n');
    assert.match(text, /INCOMING TASK/);
    assert.match(text, /TASK STATUS/);
    assert.match(text, /ACK POSTED/);
    assert.match(text, /INGESTED/);
    assert.match(text, /LAUNCH RESERVED/);
    assert.match(text, /SESSION REGISTERED|AGENT RUNNING/);
    assert.doesNotMatch(text, /AGENT LAUNCHING/);
    assert.doesNotMatch(text, /^TASK-\d+:\s*ACK POSTED$/m);
    assert.doesNotMatch(text, /^TASK-\d+:\s*INGESTED$/m);
    assert.doesNotMatch(text, /^TASK-\d+:\s*LAUNCH RESERVED$/m);
    assert.doesNotMatch(text, /^TASK-\d+:\s*AUTO-CLOSE SCHEDULED$/m);
    assert.doesNotMatch(text, /GitHub Relay:\s*ONLINE/);
    assert.doesNotMatch(text, /^Polling:/m);
  });
});

test('auto-close success presents AGENT AUTO-CLOSED card without loose schedule line', async () => {
  await withStore(async (store) => {
    const client = new FakeGithub([eligibleIssue({ number: 37 })]);
    const logger = capturingLogger();
    const worker = new GithubInboxWorker({
      client,
      store,
      config: CONFIG,
      logger,
      launcher: mockLauncher([]),
      closer: {
        async delay() {},
        async closeTaskSession() {
          return {
            ok: true,
            processCloseVerified: true,
            processClosed: true,
            windowClosed: true,
            intentionalClose: true,
            fullAutoCloseSuccess: true,
            exitCode: 0,
            terminalCloseVisibility: 'hidden',
          };
        },
      },
    });
    await worker.tick();
    const local = await store.findByGithubIssueNumber('37');
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: local.id,
      pid: 2222,
      method: 'wt',
      session: {
        taskId: local.id,
        nonce: 'nonce-37',
        pid: 2222,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-close.json',
        workspace: CONFIG.workspacePath,
      },
    });
    await store.updateTask({ id: local.id, status: 'COMPLETED', summary: 'done' });
    logger.logs.length = 0;
    await worker.tick();
    const text = logger.logs.join('\n');
    assert.match(text, /COMPLETED/);
    assert.match(text, /AUTO-CLOSE SCHEDULED/);
    assert.match(text, /AGENT AUTO-CLOSED/);
    assert.doesNotMatch(text, /^TASK-\d+:\s*AUTO-CLOSE SCHEDULED$/m);
    assert.equal((text.match(/AGENT AUTO-CLOSED/g) || []).length >= 1, true);
  });
});

test('githubRelay entry uses RELAY STATUS card instead of orphan ONLINE/Polling lines', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const src = await readFile(join(here, '../src/githubRelay.js'), 'utf8');
  assert.match(src, /printRelayStatusCard/);
  assert.doesNotMatch(src, /printStatusTransition/);
  assert.doesNotMatch(src, /printLifecycleStatusLine/);
  assert.doesNotMatch(src, /GitHub Relay',\s*'ONLINE'/);
  assert.doesNotMatch(src, /printLifecycleStatusLine\(\s*'Polling'/);
});
