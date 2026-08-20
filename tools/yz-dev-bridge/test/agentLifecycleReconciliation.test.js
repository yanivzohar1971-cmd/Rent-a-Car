import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BridgeStore,
  AGENT_LAUNCH_RETRY_AFTER_MS,
  AGENT_LAUNCH_STALE_AFTER_MS,
  isAgentActiveForProjectTask,
  isTaskEligibleForAgentLaunch,
} from '../src/store.js';
import {
  isRegisteredAgentSessionLive,
  verifyRegisteredSessionProcessIdentity,
} from '../src/agent/agentSessionLiveness.js';
import { formatAgentRecoveryCard, stripAnsi } from '../src/github/relayCards.js';

async function withStore(fn, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-lifecycle-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'), options);
    await fn(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function session(overrides = {}) {
  return {
    taskId: 'TASK-00001',
    nonce: 'nonce-test',
    pid: 424242,
    startedAt: '2026-08-20T10:00:00.000Z',
    registeredAt: '2026-08-20T10:00:01.000Z',
    file: 'C:\\temp\\session.json',
    workspace: 'C:\\ws',
    ...overrides,
  };
}

test('A: stale pre-claim reservation recovers and becomes retryable after cooldown', async () => {
  const staleAt = Date.now() - AGENT_LAUNCH_STALE_AFTER_MS - 5_000;
  await withStore(async (store) => {
    const task = await store.createTask({
      project: 'rent-a-car',
      title: 'Stale reserve',
      instructions: 'recover me',
    });
    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchStartedAt: new Date(staleAt).toISOString(),
      },
    });
    assert.equal(isAgentActiveForProjectTask(await store.getTask(task.id), { now: Date.now() }), false);

    const first = await store.reconcileAgentLifecycles({
      now: Date.now(),
      isSessionProcessLive: () => false,
    });
    assert.equal(first.count, 1);
    assert.equal(first.recovered[0].action, 'released-for-retry');

    const after = await store.getTask(task.id);
    assert.equal(after.status, 'READY');
    assert.equal(after.metadata.agentLaunchStartedAt, null);
    assert.ok(after.metadata.agentRecoveryAt);
    assert.equal(after.metadata.agentRecoveryReason, 'stale-launch-reservation');
    assert.equal(isAgentActiveForProjectTask(after), false);
    assert.equal(isTaskEligibleForAgentLaunch(after), false); // cooldown

    const later = Date.parse(after.metadata.agentRecoveryAt) + AGENT_LAUNCH_RETRY_AFTER_MS + 1_000;
    assert.equal(isTaskEligibleForAgentLaunch(after, { now: later }), true);
    const launch = await store.beginAgentLaunch({ id: task.id, now: later });
    assert.equal(launch.started, true);
  }, { isSessionProcessLive: () => false });
});

test('B: fresh pre-claim reservation stays protected during grace', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const first = await store.createTask({ project: 'rent-a-car', title: 'Fresh', instructions: 'a' });
    const second = await store.createTask({ project: 'rent-a-car', title: 'Waiting', instructions: 'b' });
    const reserved = await store.beginAgentLaunch({ id: first.id, now });
    assert.equal(reserved.started, true);

    const reconcile = await store.reconcileAgentLifecycles({
      now: now + 1_000,
      isSessionProcessLive: () => false,
    });
    assert.equal(reconcile.count, 0);
    assert.equal(isAgentActiveForProjectTask(await store.getTask(first.id), { now: now + 1_000 }), true);

    const blocked = await store.beginAgentLaunch({ id: second.id, now: now + 1_000 });
    assert.equal(blocked.started, false);
    assert.equal(blocked.reason, 'project-busy');
  }, { isSessionProcessLive: () => false });
});

test('C: live registered session remains active and blocks same-project launch', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const live = await store.createTask({ project: 'rent-a-car', title: 'Live', instructions: 'a' });
    const waiting = await store.createTask({ project: 'rent-a-car', title: 'Wait', instructions: 'b' });
    await store.beginAgentLaunch({ id: live.id, now: now - 10_000 });
    await store.markAgentLaunched({
      id: live.id,
      pid: 111,
      method: 'wt',
      session: session({ taskId: live.id, pid: 999 }),
    });

    const reconcile = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => true,
    });
    assert.equal(reconcile.count, 0);
    assert.equal(isAgentActiveForProjectTask(await store.getTask(live.id), { now }), true);

    const blocked = await store.beginAgentLaunch({ id: waiting.id, now });
    assert.equal(blocked.started, false);
    assert.equal(blocked.reason, 'project-busy');
    assert.equal(blocked.blockingTaskId, live.id);
  }, { isSessionProcessLive: () => true });
});

test('D: dead registered session before claim recovers for safe retry', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const task = await store.createTask({ project: 'rent-a-car', title: 'Dead pre', instructions: 'a' });
    await store.beginAgentLaunch({ id: task.id, now: now - AGENT_LAUNCH_STALE_AFTER_MS - 5_000 });
    await store.markAgentLaunched({
      id: task.id,
      pid: 111,
      method: 'wt',
      session: session({ taskId: task.id }),
    });
    // Force launchedAt into the past beyond grace.
    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchedAt: new Date(now - AGENT_LAUNCH_STALE_AFTER_MS - 5_000).toISOString(),
        agentLaunchStartedAt: new Date(now - AGENT_LAUNCH_STALE_AFTER_MS - 6_000).toISOString(),
      },
    });

    const result = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => false,
    });
    assert.equal(result.count, 1);
    assert.equal(result.recovered[0].action, 'released-for-retry');
    const after = await store.getTask(task.id);
    assert.equal(after.status, 'READY');
    assert.equal(after.metadata.agentSession, null);
    assert.equal(isAgentActiveForProjectTask(after, { now }), false);
  }, { isSessionProcessLive: () => false });
});

test('E: dead registered session after claim becomes BLOCKED and is not auto-rerun', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const task = await store.createTask({ project: 'rent-a-car', title: 'Claimed dead', instructions: 'a' });
    await store.beginAgentLaunch({ id: task.id, now: now - 120_000 });
    await store.markAgentLaunched({
      id: task.id,
      pid: 111,
      method: 'wt',
      session: session({ taskId: task.id }),
    });
    await store.claimTask({ id: task.id, actor: 'cursor' });
    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchedAt: new Date(now - 120_000).toISOString(),
        agentLaunchStartedAt: new Date(now - 121_000).toISOString(),
      },
    });

    const result = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => false,
    });
    assert.equal(result.count, 1);
    assert.equal(result.recovered[0].action, 'blocked-manual-review');
    const after = await store.getTask(task.id);
    assert.equal(after.status, 'BLOCKED');
    assert.equal(after.metadata.agentBlockedReason, 'agent-session-lost');
    assert.equal(after.claimedBy, 'cursor');
    assert.equal(isTaskEligibleForAgentLaunch(after, { now }), false);
    assert.equal(isAgentActiveForProjectTask(after, { now }), false);

    const other = await store.createTask({ project: 'rent-a-car', title: 'Next', instructions: 'next' });
    const launch = await store.beginAgentLaunch({ id: other.id, now });
    assert.equal(launch.started, true);
  }, { isSessionProcessLive: () => false });
});

test('F: terminal dead session does not block project forever', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const done = await store.createTask({ project: 'rent-a-car', title: 'Done', instructions: 'a' });
    await store.beginAgentLaunch({ id: done.id, now: now - 120_000 });
    await store.markAgentLaunched({
      id: done.id,
      pid: 111,
      method: 'wt',
      session: session({ taskId: done.id }),
    });
    await store.claimTask({ id: done.id, actor: 'cursor' });
    await store.updateTask({
      id: done.id,
      status: 'COMPLETED',
      summary: 'done',
      metadata: {
        agentLaunchedAt: new Date(now - 120_000).toISOString(),
      },
    });

    assert.equal(isAgentActiveForProjectTask(await store.getTask(done.id), { now }), true);

    const result = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => false,
    });
    assert.equal(result.count, 1);
    assert.equal(result.recovered[0].action, 'released-inactive');
    const after = await store.getTask(done.id);
    assert.equal(after.status, 'COMPLETED');
    assert.ok(after.metadata.agentAutoCloseCompletedAt);
    assert.equal(isAgentActiveForProjectTask(after, { now }), false);

    const next = await store.createTask({ project: 'rent-a-car', title: 'Next', instructions: 'b' });
    assert.equal((await store.beginAgentLaunch({ id: next.id, now })).started, true);
  }, { isSessionProcessLive: () => false });
});

test('G: PID reuse / StartTime mismatch is not treated as the Agent', () => {
  const result = verifyRegisteredSessionProcessIdentity(session(), {
    aliveImpl: () => true,
    spawnSyncImpl: () => ({
      status: 0,
      stdout: '{"live":false,"reason":"start-time-mismatch"}\n',
      stderr: '',
    }),
  });
  assert.equal(result.live, false);
  assert.equal(result.reason, 'start-time-mismatch');
  assert.equal(isRegisteredAgentSessionLive(session(), {
    isSessionProcessLive: () => false,
  }), false);
});

test('H: Windows Terminal handoff — shim PID gone, registered session live', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const task = await store.createTask({ project: 'rent-a-car', title: 'Handoff', instructions: 'a' });
    await store.beginAgentLaunch({ id: task.id, now: now - 120_000 });
    await store.markAgentLaunched({
      id: task.id,
      pid: 1, // wt shim — may be dead; must not decide liveness
      method: 'windows-terminal',
      session: session({ taskId: task.id, pid: 777 }),
    });
    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchedAt: new Date(now - 120_000).toISOString(),
        agentLaunchStartedAt: new Date(now - 121_000).toISOString(),
      },
    });

    const result = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: (safe) => safe.pid === 777,
    });
    assert.equal(result.count, 0);
    assert.equal(isAgentActiveForProjectTask(await store.getTask(task.id), { now }), true);
  });
});

test('I: same project unlocks after genuine Agent becomes stale', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const active = await store.createTask({ project: 'rent-a-car', title: 'A', instructions: 'a' });
    const waiting = await store.createTask({ project: 'rent-a-car', title: 'B', instructions: 'b' });
    await store.beginAgentLaunch({ id: active.id, now: now - 10_000 });
    await store.markAgentLaunched({
      id: active.id,
      pid: 9,
      session: session({ taskId: active.id }),
    });
    // Keep within grace so same-project launch stays blocked.
    assert.equal((await store.beginAgentLaunch({ id: waiting.id, now })).started, false);

    await store.updateTask({
      id: active.id,
      metadata: {
        agentLaunchedAt: new Date(now - AGENT_LAUNCH_STALE_AFTER_MS - 5_000).toISOString(),
        agentLaunchStartedAt: new Date(now - AGENT_LAUNCH_STALE_AFTER_MS - 6_000).toISOString(),
      },
    });

    const released = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => false,
    });
    assert.equal(released.count, 1);
    assert.equal((await store.beginAgentLaunch({ id: waiting.id, now })).started, true);
  });
});

test('J: different projects may run concurrently', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const rent = await store.createTask({ project: 'rent-a-car', title: 'R', instructions: 'r' });
    const glasses = await store.createTask({ project: 'glasses', title: 'G', instructions: 'g' });
    await store.beginAgentLaunch({ id: rent.id, now });
    await store.markAgentLaunched({
      id: rent.id,
      pid: 1,
      session: session({ taskId: rent.id, pid: 101 }),
    });
    await store.beginAgentLaunch({ id: glasses.id, now });
    await store.markAgentLaunched({
      id: glasses.id,
      pid: 2,
      session: session({ taskId: glasses.id, pid: 202 }),
    });

    const result = await store.reconcileAgentLifecycles({
      now,
      isSessionProcessLive: () => true,
    });
    assert.equal(result.count, 0);
    assert.equal(isAgentActiveForProjectTask(await store.getTask(rent.id), { now }), true);
    assert.equal(isAgentActiveForProjectTask(await store.getTask(glasses.id), { now }), true);
  }, { isSessionProcessLive: () => true });
});

test('K: restart with persisted stale reservation recovers without manual edit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-bridge-restart-'));
  try {
    const file = join(dir, 'bridge.json');
    const staleAt = new Date(Date.now() - AGENT_LAUNCH_STALE_AFTER_MS - 10_000).toISOString();
    await writeFile(file, `${JSON.stringify({
      schemaVersion: 1,
      sequence: 1,
      tasks: [{
        id: 'TASK-00001',
        projectId: 'rent-a-car',
        project: 'Rent_a_Car',
        projectDisplayName: 'Rent_a_Car',
        title: 'Persisted stale',
        instructions: 'recover on restart',
        priority: 'normal',
        status: 'READY',
        createdBy: 'github-relay',
        createdAt: staleAt,
        updatedAt: staleAt,
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        summary: null,
        changedFiles: [],
        tests: [],
        notes: [],
        metadata: {
          agentLaunchStartedAt: staleAt,
          agentLaunchedAt: null,
          agentSession: null,
        },
      }],
      contexts: {},
    }, null, 2)}\n`, 'utf8');

    const store = new BridgeStore(file, { isSessionProcessLive: () => false });
    const result = await store.reconcileAgentLifecycles({ now: Date.now() });
    assert.equal(result.count, 1);
    const task = await store.getTask('TASK-00001');
    assert.equal(task.metadata.agentLaunchStartedAt, null);
    assert.ok(task.metadata.agentRecoveryAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('L: reconciliation is idempotent — second pass does not duplicate recovery', async () => {
  const now = Date.now();
  await withStore(async (store) => {
    const task = await store.createTask({ project: 'rent-a-car', title: 'Once', instructions: 'a' });
    await store.updateTask({
      id: task.id,
      metadata: {
        agentLaunchStartedAt: new Date(now - AGENT_LAUNCH_STALE_AFTER_MS - 1_000).toISOString(),
      },
    });
    const first = await store.reconcileAgentLifecycles({ now, isSessionProcessLive: () => false });
    assert.equal(first.count, 1);
    const recoveryAt = (await store.getTask(task.id)).metadata.agentRecoveryAt;
    const second = await store.reconcileAgentLifecycles({ now: now + 5_000, isSessionProcessLive: () => false });
    assert.equal(second.count, 0);
    assert.equal((await store.getTask(task.id)).metadata.agentRecoveryAt, recoveryAt);
  }, { isSessionProcessLive: () => false });
});

test('AGENT RECOVERY card stays compact and omits nonce/path/pid noise', () => {
  const text = stripAnsi(formatAgentRecoveryCard({
    taskId: 'TASK-00043',
    project: 'Rent_a_Car',
    previousLabel: 'STALE SESSION',
    statusLabel: 'RELEASED',
    unlockLabel: 'PROJECT UNLOCKED',
  }, { useColor: false }));
  assert.match(text, /AGENT RECOVERY/);
  assert.match(text, /TASK-00043/);
  assert.match(text, /PROJECT UNLOCKED/);
  assert.doesNotMatch(text, /nonce/i);
  assert.doesNotMatch(text, /session\.json/i);
  assert.doesNotMatch(text, /\bPID\b/);
});
