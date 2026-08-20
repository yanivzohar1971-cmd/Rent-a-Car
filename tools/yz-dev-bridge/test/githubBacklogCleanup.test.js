import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BridgeStore,
  GITHUB_BACKLOG_CLEANUP_REASON,
  GITHUB_BACKLOG_CLEANUP_VERSION,
  isAgentActiveForProjectTask,
  isTaskEligibleForAgentLaunch,
} from '../src/store.js';
import { GithubInboxWorker } from '../src/github/githubInboxWorker.js';

async function withStore(fn, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-backlog-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'), options);
    await fn(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function silentLogger() {
  return { error() {}, log() {} };
}

async function seedGithubTask(store, {
  issue,
  repo = 'yanivzohar1971-cmd/Rent-a-Car',
  projectId = 'rent-a-car',
  status = null,
  title = `Issue ${issue}`,
} = {}) {
  const imported = await store.importGithubTask({
    githubIssueNumber: String(issue),
    githubRepo: repo,
    githubIssueTitle: title,
    projectId,
    title,
    instructions: `do ${issue}`,
  });
  if (status && status !== 'READY') {
    await store.updateTask({
      id: imported.task.id,
      status,
      summary: status === 'COMPLETED' ? 'done' : `state ${status}`,
    });
  }
  return store.getTask(imported.task.id);
}

test('A: duplicate ingestion is blocked for every terminal/non-terminal status', async () => {
  await withStore(async (store) => {
    for (const status of ['COMPLETED', 'CANCELLED', 'FAILED', 'BLOCKED', 'READY']) {
      const first = await seedGithubTask(store, { issue: `100${status.length}`, status: status === 'READY' ? null : status });
      const again = await store.importGithubTask({
        githubIssueNumber: first.metadata.githubIssueNumber,
        githubRepo: first.metadata.githubRepo,
        githubIssueTitle: first.title,
        projectId: 'rent-a-car',
        title: first.title,
        instructions: first.instructions,
      });
      assert.equal(again.created, false, status);
      assert.equal(again.task.id, first.id, status);
    }

    const rent = await store.importGithubTask({
      githubIssueNumber: '55',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      projectId: 'rent-a-car',
      title: 'Rent 55',
      instructions: 'rent',
    });
    const glasses = await store.importGithubTask({
      githubIssueNumber: '55',
      githubRepo: 'yanivzohar1971-cmd/Glasses',
      projectId: 'glasses',
      title: 'Glasses 55',
      instructions: 'glasses',
    });
    assert.equal(rent.created, true);
    assert.equal(glasses.created, true);
    assert.notEqual(rent.task.id, glasses.task.id);
  });
});

test('A2: legacy task without githubRepo still dedupes same project issue', async () => {
  await withStore(async (store) => {
    const legacy = await store.importGithubTask({
      githubIssueNumber: '5',
      githubRepo: null,
      projectId: 'rent-a-car',
      title: 'Legacy 5',
      instructions: 'legacy',
    });
    assert.equal(legacy.created, true);
    await store.updateTask({ id: legacy.task.id, status: 'COMPLETED', summary: 'old' });

    const again = await store.importGithubTask({
      githubIssueNumber: '5',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      projectId: 'rent-a-car',
      title: 'Rent 5 again',
      instructions: 'should reuse',
    });
    assert.equal(again.created, false);
    assert.equal(again.task.id, legacy.task.id);
  });
});

test('B: closed source backlog cancels and is not launch eligible', async () => {
  await withStore(async (store) => {
    const ready = await seedGithubTask(store, { issue: '201' });
    const blocked = await seedGithubTask(store, { issue: '202', status: 'BLOCKED' });
    await store.updateTask({
      id: ready.id,
      metadata: {
        agentLaunchStartedAt: new Date(Date.now() - 120_000).toISOString(),
        agentLaunchedAt: new Date(Date.now() - 119_000).toISOString(),
      },
    });

    const first = await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: [],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal(first.count, 2);

    const readyAfter = await store.getTask(ready.id);
    const blockedAfter = await store.getTask(blocked.id);
    assert.equal(readyAfter.status, 'CANCELLED');
    assert.equal(blockedAfter.status, 'CANCELLED');
    assert.equal(readyAfter.metadata.cleanupReason, GITHUB_BACKLOG_CLEANUP_REASON);
    assert.equal(readyAfter.metadata.cleanupVersion, GITHUB_BACKLOG_CLEANUP_VERSION);
    assert.equal(readyAfter.metadata.agentLaunchStartedAt, null);
    assert.equal(isTaskEligibleForAgentLaunch(readyAfter), false);
    assert.equal(isAgentActiveForProjectTask(readyAfter), false);

    const second = await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: [],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal(second.count, 0);
    assert.ok(readyAfter.instructions);
    assert.equal(readyAfter.metadata.githubIssueNumber, '201');
  });
});

test('B2: open source issue is not cancelled; closed one is', async () => {
  await withStore(async (store) => {
    const openTask = await seedGithubTask(store, { issue: '301' });
    const closedTask = await seedGithubTask(store, { issue: '302' });
    const result = await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: ['301'],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal(result.count, 1);
    assert.equal(result.cancelled[0].taskId, closedTask.id);
    assert.equal((await store.getTask(openTask.id)).status, 'READY');
    assert.equal((await store.getTask(closedTask.id)).status, 'CANCELLED');
  });
});

test('C: open issue still launches; active valid session not cancelled', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const task = await seedGithubTask(store, { issue: '401' });
    await store.beginAgentLaunch({ id: task.id, now });
    await store.markAgentLaunched({
      id: task.id,
      pid: 9,
      session: {
        taskId: task.id,
        nonce: 'n',
        pid: 99,
        startedAt: new Date(now).toISOString(),
        registeredAt: new Date(now).toISOString(),
        file: 'C:\\temp\\s.json',
        workspace: 'C:\\ws',
      },
    });

    const result = await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: ['401', '402'],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal(result.count, 0);
    const after = await store.getTask(task.id);
    assert.equal(after.status, 'READY');
    assert.ok(after.metadata.agentSession?.pid);
    assert.equal(isAgentActiveForProjectTask(after, { now }), true);

    const client = {
      async listOpenIssues() {
        return [{
          number: 402,
          state: 'open',
          title: '[YZ-BRIDGE] Open',
          body: 'go',
          user: { login: 'yanivzohar1971-cmd' },
        }];
      },
      async listComments() { return []; },
      async addComment() {},
      async closeIssue() {},
      async addLabel() {},
    };
    const launches = [];
    const worker = new GithubInboxWorker({
      client,
      store,
      config: {
        repo: 'yanivzohar1971-cmd/Rent-a-Car',
        project: 'Rent_a_Car',
        projectId: 'rent-a-car',
        allowedAuthor: 'yanivzohar1971-cmd',
        titlePrefix: '[YZ-BRIDGE]',
        intervalMs: 15_000,
        autoLaunch: true,
        autoCloseCompleted: false,
        keepWindowOpen: false,
        workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
        ownsLegacyGithubTasks: true,
      },
      logger: silentLogger(),
      presentCards: false,
      launcher: {
        resolvePath() { return 'C:\\fake\\agent.exe'; },
        verify() { return { ok: true }; },
        launch(input) {
          launches.push(input);
          return { pid: 1, method: 'test', session: null };
        },
      },
    });
    await worker.tick();
    // Issue 401 is not in this poll's open set → cancelled; 402 is ingested+launched.
    assert.equal((await store.getTask(task.id)).status, 'CANCELLED');
    assert.ok(launches.some((item) => item.taskId));
    const launchedTask = await store.getTask(launches[0].taskId);
    assert.equal(launchedTask.metadata.githubIssueNumber, '402');
  }, { isSessionProcessLive: () => true });
});

test('C2: cancelled closed-source task revives when issue reopens', async () => {
  await withStore(async (store) => {
    const task = await seedGithubTask(store, { issue: '501' });
    await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: [],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal((await store.getTask(task.id)).status, 'CANCELLED');

    const revived = await store.importGithubTask({
      githubIssueNumber: '501',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      projectId: 'rent-a-car',
      title: 'Back',
      instructions: 'again',
    });
    assert.equal(revived.created, false);
    assert.equal(revived.revived, true);
    assert.equal(revived.task.status, 'READY');
    assert.equal(revived.task.metadata.cleanupReason, null);
    assert.equal(revived.task.metadata.githubSourceIssueState, 'open');
  });
});

test('D: startup reconciliation prevents surprise launch of closed backlog', async () => {
  await withStore(async (store) => {
    const stale = await seedGithubTask(store, { issue: '601' });
    const client = {
      async listOpenIssues() { return []; },
      async listComments() { return []; },
      async addComment() {},
      async closeIssue() {},
      async addLabel() {},
    };
    const launches = [];
    const worker = new GithubInboxWorker({
      client,
      store,
      config: {
        repo: 'yanivzohar1971-cmd/Rent-a-Car',
        project: 'Rent_a_Car',
        projectId: 'rent-a-car',
        allowedAuthor: 'yanivzohar1971-cmd',
        titlePrefix: '[YZ-BRIDGE]',
        intervalMs: 15_000,
        autoLaunch: true,
        autoCloseCompleted: false,
        keepWindowOpen: false,
        workspacePath: 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car',
        ownsLegacyGithubTasks: true,
      },
      logger: silentLogger(),
      presentCards: false,
      launcher: {
        resolvePath() { return 'C:\\fake\\agent.exe'; },
        verify() { return { ok: true }; },
        launch(input) { launches.push(input); return { pid: 1 }; },
      },
    });
    await worker.tick();
    assert.equal(launches.length, 0);
    const after = await store.getTask(stale.id);
    assert.equal(after.status, 'CANCELLED');
    assert.equal(after.metadata.cleanupReason, GITHUB_BACKLOG_CLEANUP_REASON);
    assert.ok(after.instructions);
    assert.equal(after.metadata.githubIssueNumber, '601');
  });
});

test('E: multi-project closed cleanup does not cross repos', async () => {
  await withStore(async (store) => {
    const rent = await seedGithubTask(store, {
      issue: '701',
      repo: 'yanivzohar1971-cmd/Rent-a-Car',
      projectId: 'rent-a-car',
    });
    const glasses = await seedGithubTask(store, {
      issue: '701',
      repo: 'yanivzohar1971-cmd/Glasses',
      projectId: 'glasses',
    });
    await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: [],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal((await store.getTask(rent.id)).status, 'CANCELLED');
    assert.equal((await store.getTask(glasses.id)).status, 'READY');

    const rentB = await seedGithubTask(store, { issue: '702', projectId: 'rent-a-car' });
    await store.beginAgentLaunch({ id: rentB.id });
    const glassesB = await seedGithubTask(store, {
      issue: '703',
      repo: 'yanivzohar1971-cmd/Glasses',
      projectId: 'glasses',
    });
    assert.equal((await store.beginAgentLaunch({ id: glassesB.id })).started, true);
  });
});

test('F: cleanup uses locked Store mutation and preserves history/IDs', async () => {
  await withStore(async (store, dir) => {
    const task = await seedGithubTask(store, { issue: '801' });
    const beforeRaw = await readFile(join(dir, 'bridge.json'), 'utf8');
    assert.match(beforeRaw, /TASK-00001/);
    const result = await store.cancelGithubTasksWithClosedSources({
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      openIssueNumbers: [],
      ownsLegacyGithubTasks: true,
      projectId: 'rent-a-car',
    });
    assert.equal(result.count, 1);
    const after = await store.getTask(task.id);
    assert.equal(after.id, 'TASK-00001');
    assert.equal(after.status, 'CANCELLED');
    assert.ok(after.createdAt);
    assert.ok(after.instructions);
    const afterRaw = await readFile(join(dir, 'bridge.json'), 'utf8');
    assert.match(afterRaw, /TASK-00001/);
    assert.match(afterRaw, /source-github-issue-closed/);
    assert.ok(JSON.parse(afterRaw).tasks.length >= 1);
  });
});
