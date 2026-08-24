import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../src/store.js';
import { resolveDashboardIssueState } from '../src/dashboard/issueState.js';
import { presentTaskDetail, summarizeTask } from '../src/dashboard/snapshot.js';
import { sanitizeObject } from '../src/dashboard/sanitize.js';
import { resolveDashboardBind } from '../src/dashboard/server.js';
import { agentSessionFixture, getJson, withDashboard } from './dashboardHarness.js';

test('STATUS API reports relay OFFLINE and ONLINE from owned child', async () => {
  await withDashboard(async ({ app, base }) => {
    const offline = await getJson(base, '/api/status');
    assert.equal(offline.status, 200);
    assert.equal(offline.body.relay.state, 'OFFLINE');
    assert.equal(offline.body.relay.pid, null);
    assert.equal(offline.body.name, 'YZ DEV BRIDGE');

    const started = app.supervisor.startRelay();
    assert.equal(started.state, 'ONLINE');
    const online = await getJson(base, '/api/status');
    assert.equal(online.body.relay.state, 'ONLINE');
    assert.equal(online.body.relay.pid, started.pid);
    assert.equal(online.body.relay.owned, true);
  });
});

test('characterization: health/github/firebase/events JSON routes exist', async () => {
  await withDashboard(async ({ base }) => {
    for (const path of ['/api/health', '/health', '/api/github', '/api/firebase', '/api/events']) {
      const res = await getJson(base, path);
      assert.equal(res.status, 200, path);
      assert.equal(typeof res.body, 'object');
    }
  });
});

test('STATUS API uses UNKNOWN when issue truth cannot be established', async () => {
  const task = {
    metadata: {
      githubIssueNumber: '99',
      githubSourceIssueState: 'open',
    },
  };
  assert.equal(resolveDashboardIssueState(task), 'UNKNOWN');
  assert.equal(resolveDashboardIssueState(task, { openIssuesKnown: false }), 'UNKNOWN');
});

test('TASK API counts, bounded recent list, structured result, cancelled rendering', async () => {
  await withDashboard(async ({ store, base }) => {
    const first = await store.createTask({ project: 'rent-a-car', title: 'One', instructions: 'Do one' });
    const second = await store.createTask({ project: 'glasses', title: 'Two', instructions: 'Do two' });
    await store.updateTask({
      id: first.id,
      status: 'COMPLETED',
      summary: 'Done',
      changedFiles: ['a.js'],
      tests: ['ok'],
      metadata: {
        structuredResult: {
          resultSummary: 'Structured summary',
          rootCause: 'None',
          nextRecommendedStep: 'Ship',
        },
      },
    });
    await store.updateTask({ id: second.id, status: 'CANCELLED', summary: 'Cancelled by test' });

    const stats = await getJson(base, '/api/stats');
    assert.equal(stats.body.totalTasks, 2);
    assert.equal(stats.body.COMPLETED, 1);
    assert.equal(stats.body.CANCELLED, 1);

    const list = await getJson(base, '/api/tasks?limit=1');
    assert.equal(list.body.bounded, true);
    assert.equal(list.body.tasks.length, 1);
    assert.ok(list.body.total >= 2);

    const cancelled = await getJson(base, '/api/tasks?status=CANCELLED');
    assert.equal(cancelled.body.tasks[0].status, 'CANCELLED');
    assert.equal(cancelled.body.tasks[0].taskId, second.id);

    const detail = await getJson(base, `/api/tasks/${first.id}`);
    assert.equal(detail.body.task.resultSummary, 'Structured summary');
    assert.equal(detail.body.task.rootCause, 'None');
    assert.equal(detail.body.task.nextRecommendedStep, 'Ship');
    assert.deepEqual(detail.body.task.changedFiles, ['a.js']);
  });
});

test('PROJECTS API is dynamic and maps active agents per project', async () => {
  await withDashboard(async ({ store, base }) => {
    const rac = await store.createTask({ project: 'rent-a-car', title: 'RAC', instructions: 'Work RAC' });
    const glasses = await store.createTask({ project: 'glasses', title: 'GL', instructions: 'Work Glasses' });
    await store.beginAgentLaunch({ id: rac.id });
    await store.markAgentLaunched({
      id: rac.id,
      pid: 1001,
      method: 'wt',
      session: agentSessionFixture({ taskId: rac.id, pid: 1001 }),
    });
    await store.beginAgentLaunch({ id: glasses.id });
    await store.markAgentLaunched({
      id: glasses.id,
      pid: 1002,
      method: 'wt',
      session: agentSessionFixture({ taskId: glasses.id, pid: 1002 }),
    });

    const projects = await getJson(base, '/api/projects');
    const ids = projects.body.projects.map((item) => item.projectId);
    assert.ok(ids.includes('rent-a-car'));
    assert.ok(ids.includes('glasses'));
    const racCard = projects.body.projects.find((item) => item.projectId === 'rent-a-car');
    const glassesCard = projects.body.projects.find((item) => item.projectId === 'glasses');
    assert.equal(racCard.activeAgent.taskId, rac.id);
    assert.equal(glassesCard.activeAgent.taskId, glasses.id);

    const agents = await getJson(base, '/api/agents');
    assert.equal(agents.body.agents.length, 2);
  });
});

test('authoritative CLOSED overrides stale OPEN metadata', () => {
  const task = {
    metadata: {
      githubIssueNumber: '7',
      githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
      githubSourceIssueState: 'open',
    },
  };
  const closed = resolveDashboardIssueState(task, {
    openIssueNumbersByRepo: { 'yanivzohar1971-cmd/Rent-a-Car': [] },
    openIssuesKnown: true,
  });
  assert.equal(closed, 'CLOSED');

  const stillOpen = resolveDashboardIssueState(task, {
    openIssueNumbersByRepo: { 'yanivzohar1971-cmd/Rent-a-Car': ['7'] },
    openIssuesKnown: true,
  });
  assert.equal(stillOpen, 'OPEN');
});

test('secret fields and nonce are not serialized to browser payloads', async () => {
  await withDashboard(async ({ store, base }) => {
    const created = await store.createTask({
      project: 'rent-a-car',
      title: 'Secret',
      instructions: 'token=super-secret-token',
      metadata: { token: 'abc', nonce: 'hidden-nonce' },
    });
    await store.markAgentLaunched({
      id: created.id,
      pid: 9,
      session: agentSessionFixture({ taskId: created.id }),
    });
    const detail = await getJson(base, `/api/tasks/${created.id}?debug=1`);
    const text = JSON.stringify(detail.body);
    assert.equal(detail.body.task.agent?.nonce, undefined);
    assert.doesNotMatch(text, /hidden-nonce|test-nonce-should-never-leak|super-secret-token|abc/);
    assert.doesNotMatch(text, /agent-secret\.json/);
  });
});

test('dashboard bind defaults to loopback and refuses 0.0.0.0', () => {
  assert.equal(resolveDashboardBind({ host: '127.0.0.1' }), '127.0.0.1');
  assert.throws(() => resolveDashboardBind({ host: '0.0.0.0', allowRemote: 'false' }));
});

test('sanitizeObject strips credentials even in debug mode', () => {
  const cleaned = sanitizeObject({
    token: 'nope',
    nonce: 'nope',
    githubToken: 'nope',
    status: 'READY',
  }, { debug: true });
  assert.equal(cleaned.token, undefined);
  assert.equal(cleaned.nonce, undefined);
  assert.equal(cleaned.status, 'READY');
});

test('live snapshot tracks READY to IN_PROGRESS to COMPLETED from Store', async () => {
  await withDashboard(async ({ store, base, app }) => {
    const created = await store.createTask({
      project: 'rent-a-car',
      title: 'Live cycle',
      instructions: 'Advance statuses',
    });
    await app.poll();
    let tasks = await getJson(base, `/api/tasks/${created.id}`);
    assert.equal(tasks.body.task.status, 'READY');

    await store.claimTask({ id: created.id, actor: 'cursor' });
    await app.poll();
    tasks = await getJson(base, `/api/tasks/${created.id}`);
    assert.equal(tasks.body.task.status, 'IN_PROGRESS');

    const projects = await getJson(base, '/api/projects');
    const rac = projects.body.projects.find((item) => item.projectId === 'rent-a-car');
    assert.equal(rac.counts.IN_PROGRESS, 1);

    await store.updateTask({ id: created.id, status: 'COMPLETED', summary: 'Finished' });
    await app.poll();
    tasks = await getJson(base, `/api/tasks/${created.id}`);
    assert.equal(tasks.body.task.status, 'COMPLETED');
    const stats = await getJson(base, '/api/stats');
    assert.equal(stats.body.COMPLETED, 1);
  });
});

test('presentTaskDetail uses structured result and cancelled status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dash-present-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    const task = await store.createTask({ project: 'rent-a-car', title: 'X', instructions: 'Y' });
    const cancelled = await store.updateTask({ id: task.id, status: 'CANCELLED', summary: 'stop' });
    const view = presentTaskDetail(cancelled);
    assert.equal(view.status, 'CANCELLED');
    assert.equal(view.lifecycle.phases.find((phase) => phase.id === 'COMPLETED').label, 'CANCELLED');
    const summary = summarizeTask(cancelled);
    assert.equal(summary.status, 'CANCELLED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
