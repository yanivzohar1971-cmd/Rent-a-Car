import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BridgeStore,
  AGENT_LAUNCH_RETRY_AFTER_MS,
  isTaskEligibleForAgentLaunch,
  isTaskEligibleForCompletedAgentAutoClose,
} from '../src/store.js';

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dev-bridge-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    await fn(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('creates, claims and completes a task', async () => {
  await withStore(async (store) => {
    const created = await store.createTask({
      project: 'rent-a-car',
      title: 'Investigate matching',
      instructions: 'Find why candidateCount is zero.',
      priority: 'high',
    });
    assert.equal(created.id, 'TASK-00001');
    assert.equal(created.status, 'READY');
    assert.equal(created.projectId, 'rent-a-car');
    assert.equal(created.project, 'Rent_a_Car');

    const claimed = await store.claimTask({ id: created.id, actor: 'cursor' });
    assert.equal(claimed.status, 'IN_PROGRESS');
    assert.equal(claimed.claimedBy, 'cursor');

    const completed = await store.updateTask({
      id: created.id,
      status: 'COMPLETED',
      summary: 'Root cause identified.',
      changedFiles: ['A.kt'],
      tests: ['unit tests passed'],
      note: 'Published result to ChatGPT.',
    });
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.summary, 'Root cause identified.');
    assert.deepEqual(completed.changedFiles, ['A.kt']);
    assert.equal(completed.notes.length, 1);
  });
});

test('stores project context and reports project statistics', async () => {
  await withStore(async (store) => {
    await store.putContext({ project: 'rent-a-car', key: 'commission-rules', value: { cutoff: '2026-07-01' } });
    await store.createTask({ project: 'rent-a-car', title: 'T1', instructions: 'I1' });
    await store.createTask({ project: 'glasses', title: 'T2', instructions: 'I2' });

    const context = await store.getContext({ project: 'Rent_a_Car', key: 'commission-rules' });
    assert.deepEqual(context.value, { cutoff: '2026-07-01' });

    const projects = await store.listProjects();
    assert.equal(projects.length, 2);
    assert.equal(projects.find((p) => p.id === 'rent-a-car').contextKeyCount, 1);
    assert.equal(projects.find((p) => p.id === 'glasses').openTaskCount, 1);
  });
});

test('serializes concurrent writes without losing tasks', async () => {
  await withStore(async (store) => {
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.createTask({
      project: 'rent-a-car',
      title: `Task ${index}`,
      instructions: 'Test concurrent creation',
    })));
    const tasks = await store.listTasks({ project: 'rent-a-car', limit: 100 });
    assert.equal(tasks.length, 20);
    assert.equal(new Set(tasks.map((t) => t.id)).size, 20);
  });
});

test('two store instances coordinate writes through the file lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dev-bridge-two-process-model-'));
  try {
    const file = join(dir, 'bridge.json');
    const first = new BridgeStore(file);
    const second = new BridgeStore(file);
    await Promise.all(Array.from({ length: 30 }, (_, index) => {
      const store = index % 2 === 0 ? first : second;
      return store.createTask({ project: 'rent-a-car', title: `Task ${index}`, instructions: 'Cross-instance write' });
    }));
    const tasks = await first.listTasks({ project: 'rent-a-car', limit: 100 });
    assert.equal(tasks.length, 30);
    assert.equal(new Set(tasks.map((task) => task.id)).size, 30);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('separate Node processes do not lose concurrent writes', async () => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = await mkdtemp(join(tmpdir(), 'yz-dev-bridge-real-process-'));
  try {
    const file = join(dir, 'bridge.json');
    const worker = fileURLToPath(new URL('../scripts/worker-create.mjs', import.meta.url));
    const runWorker = (prefix) => new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(process.execPath, [worker, file, prefix, '15'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', rejectPromise);
      child.on('exit', (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(stderr || `worker exited ${code}`)));
    });

    await Promise.all([runWorker('A'), runWorker('B')]);
    const store = new BridgeStore(file);
    const tasks = await store.listTasks({ project: 'rent-a-car', limit: 100 });
    assert.equal(tasks.length, 30);
    assert.equal(new Set(tasks.map((task) => task.id)).size, 30);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('claimNextTask prefers priority and claims atomically', async () => {
  await withStore(async (store) => {
    await store.createTask({ project: 'rent-a-car', title: 'Normal', instructions: 'N', priority: 'normal' });
    const high = await store.createTask({ project: 'rent-a-car', title: 'High', instructions: 'H', priority: 'high' });
    const claimed = await store.claimNextTask({ project: 'rent-a-car', actor: 'cursor' });
    assert.equal(claimed.id, high.id);
    assert.equal(claimed.status, 'IN_PROGRESS');
  });
});

test('isTaskEligibleForAgentLaunch excludes already-launched and completed tasks', async () => {
  await withStore(async (store) => {
    const fresh = await store.createTask({ project: 'rent-a-car', title: 'Fresh', instructions: 'Go' });
    assert.equal(isTaskEligibleForAgentLaunch(fresh), true);

    await store.markAgentLaunched({ id: fresh.id, pid: 1234 });
    const launched = await store.getTask(fresh.id);
    assert.equal(isTaskEligibleForAgentLaunch(launched), false);

    const completed = await store.createTask({ project: 'rent-a-car', title: 'Done', instructions: 'Done' });
    await store.updateTask({ id: completed.id, status: 'COMPLETED', summary: 'ok' });
    assert.equal(isTaskEligibleForAgentLaunch(await store.getTask(completed.id)), false);
  });
});

test('isTaskEligibleForAgentLaunch allows retry after launch-failure cooldown', async () => {
  await withStore(async (store) => {
    const task = await store.createTask({ project: 'rent-a-car', title: 'Retry', instructions: 'Retry' });
    await store.markAgentLaunched({
      id: task.id,
      pid: null,
      error: 'starterExit=1',
    });
    const cooling = await store.getTask(task.id);
    assert.equal(isTaskEligibleForAgentLaunch(cooling), false);

    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchErrorAt: new Date(Date.now() - AGENT_LAUNCH_RETRY_AFTER_MS - 1_000).toISOString(),
      },
    });
    assert.equal(isTaskEligibleForAgentLaunch(await store.getTask(task.id)), true);
  });
});

test('listTasksEligibleForAgentLaunch filters stale reservations before polling', async () => {
  await withStore(async (store) => {
    const stale = await store.createTask({ project: 'rent-a-car', title: 'Stale', instructions: 'Stale' });
    await store.markAgentLaunched({ id: stale.id, pid: 999 });
    await store.createTask({ project: 'rent-a-car', title: 'Fresh', instructions: 'Fresh' });
    await store.createTask({ project: 'glasses', title: 'Other', instructions: 'Other' });

    const eligible = await store.listTasksEligibleForAgentLaunch({ project: 'rent-a-car' });
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].title, 'Fresh');
  });
});

test('completed GitHub task becomes auto-close eligible only after result publication with exact session identity', async () => {
  await withStore(async (store) => {
    const imported = await store.importGithubTask({
      githubIssueNumber: '55',
      githubIssueUrl: 'https://example.invalid/issues/55',
      githubIssueTitle: '[YZ-BRIDGE] Auto close',
      project: 'Rent_a_Car',
      title: 'Auto close',
      instructions: 'Close safely.',
    });
    await store.claimTask({ id: imported.task.id, actor: 'cursor' });
    await store.markAgentLaunched({
      id: imported.task.id,
      pid: 1234,
      method: 'wt',
      session: {
        taskId: imported.task.id,
        nonce: 'nonce-55',
        pid: 4321,
        startedAt: '2026-08-20T07:00:00.000Z',
        registeredAt: '2026-08-20T07:00:00.100Z',
        file: 'C:\\temp\\TASK-00001.json',
      },
    });
    await store.updateTask({ id: imported.task.id, status: 'COMPLETED', summary: 'done' });
    const beforePublish = await store.getTask(imported.task.id);
    assert.equal(isTaskEligibleForCompletedAgentAutoClose(beforePublish), false);

    await store.markGithubResultPosted({ id: imported.task.id });
    const afterPublish = await store.getTask(imported.task.id);
    assert.equal(isTaskEligibleForCompletedAgentAutoClose(afterPublish), true);
    assert.equal((await store.listTasksEligibleForCompletedAgentAutoClose({ project: 'Rent_a_Car' })).length, 1);

    const reservation = await store.beginCompletedAgentAutoClose({ id: imported.task.id });
    assert.equal(reservation.started, true);
    assert.equal((await store.beginCompletedAgentAutoClose({ id: imported.task.id })).started, false);
  });
});

test('FAILED is a first-class terminal status and is never auto-close eligible', async () => {
  await withStore(async (store) => {
    const created = await store.createTask({ project: 'rent-a-car', title: 'Verify', instructions: 'Fail honestly' });
    await store.claimTask({ id: created.id, actor: 'cursor' });
    const failed = await store.updateTask({
      id: created.id,
      status: 'FAILED',
      summary: 'Verification failed',
      metadata: { verificationFailed: true },
    });
    assert.equal(failed.status, 'FAILED');
    assert.ok(failed.completedAt);
    assert.equal(isTaskEligibleForCompletedAgentAutoClose(failed), false);
  });
});

test('store reads BOM-prefixed bridge.json', async () => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const { UTF8_BOM } = await import('../src/jsonBom.js');
  const dir = await mkdtemp(join(tmpdir(), 'yz-dev-bridge-bom-'));
  try {
    const file = join(dir, 'bridge.json');
    const store = new BridgeStore(file);
    await store.createTask({ project: 'rent-a-car', title: 'BOM', instructions: 'Read me' });
    const raw = await readFile(file, 'utf8');
    await writeFile(file, `${UTF8_BOM}${raw}`, 'utf8');
    const second = new BridgeStore(file);
    const tasks = await second.listTasks({ project: 'rent-a-car' });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, 'BOM');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('new tasks store immutable projectId and reject identity mutation', async () => {
  await withStore(async (store) => {
    const created = await store.createTask({
      projectId: 'glasses',
      project: 'ignored-when-projectId-present',
      title: 'Glasses task',
      instructions: 'Stay on glasses',
    });
    assert.equal(created.projectId, 'glasses');
    assert.equal(created.project, 'Glasses');
    await assert.rejects(
      () => store.updateTask({ id: created.id, metadata: { projectId: 'rent-a-car' } }),
      /immutable/,
    );
    const again = await store.getTask(created.id);
    assert.equal(again.projectId, 'glasses');
  });
});

test('legacy tasks without projectId hydrate to rent-a-car', async () => {
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'yz-dev-bridge-legacy-'));
  try {
    const file = join(dir, 'bridge.json');
    await writeFile(file, `${JSON.stringify({
      schemaVersion: 1,
      sequence: 1,
      tasks: [{
        id: 'TASK-00001',
        project: 'Rent_a_Car',
        title: 'Legacy',
        instructions: 'Old task',
        priority: 'normal',
        status: 'READY',
        createdBy: 'chatgpt',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        summary: null,
        changedFiles: [],
        tests: [],
        notes: [],
        metadata: {},
      }],
      contexts: {},
    }, null, 2)}\n`, 'utf8');
    const store = new BridgeStore(file);
    const task = await store.getTask('TASK-00001');
    assert.equal(task.projectId, 'rent-a-car');
    assert.equal(task.project, 'Rent_a_Car');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('same-project agent launch is serialized; different projects can reserve independently', async () => {
  await withStore(async (store) => {
    const first = await store.createTask({ project: 'rent-a-car', title: 'A1', instructions: 'one' });
    const second = await store.createTask({ project: 'rent-a-car', title: 'A2', instructions: 'two' });
    const other = await store.createTask({ project: 'glasses', title: 'B1', instructions: 'other' });

    const r1 = await store.beginAgentLaunch({ id: first.id });
    assert.equal(r1.started, true);
    const r2 = await store.beginAgentLaunch({ id: second.id });
    assert.equal(r2.started, false);
    assert.equal(r2.reason, 'project-busy');
    const r3 = await store.beginAgentLaunch({ id: other.id });
    assert.equal(r3.started, true);
  });
});
