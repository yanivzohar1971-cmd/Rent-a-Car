import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { isPidAlive } from '../src/store.js';
import { DUMMY_RELAY, postJson, withDashboard } from './dashboardHarness.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('supervisor starts owned relay, refuses duplicate start, and stops only the owned child', async () => {
  await withDashboard(async ({ app, base }) => {
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 200)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    try {
      const started = app.supervisor.startRelay();
      assert.ok(started.pid);
      assert.equal(app.supervisor.isOwnedRelayLive(), true);
      assert.throws(() => app.supervisor.startRelay(), /already running/i);

      const dup = await postJson(base, '/api/relay/start');
      assert.equal(dup.status, 409);

      const stopped = await app.supervisor.stopRelay();
      assert.equal(stopped.state, 'OFFLINE');
      assert.equal(app.supervisor.isOwnedRelayLive(), false);
      assert.equal(isPidAlive(unrelated.pid), true);
    } finally {
      unrelated.kill();
    }
  });
});

test('restart works when idle', async () => {
  await withDashboard(async ({ app }) => {
    const first = app.supervisor.startRelay();
    const restarted = await app.supervisor.restartRelay();
    assert.equal(restarted.scheduled, false);
    assert.equal(restarted.state, 'ONLINE');
    assert.ok(restarted.pid);
    assert.notEqual(restarted.pid, first.pid);
  });
});

test('restart-after-current-task waits while a task is active then proceeds', async () => {
  await withDashboard(async ({ app, store, base }) => {
    const task = await store.createTask({
      project: 'rent-a-car',
      title: 'Active',
      instructions: 'Stay in progress',
    });
    await store.claimTask({ id: task.id, actor: 'cursor' });
    app.supervisor.startRelay();
    const pidBefore = app.supervisor.relayPid;

    const scheduled = await postJson(base, '/api/relay/restart-after-current-task');
    assert.equal(scheduled.status, 200);
    assert.equal(scheduled.body.scheduled, true);
    assert.equal(app.supervisor.relayPid, pidBefore);

    const blocked = await postJson(base, '/api/relay/restart');
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'TASK_ACTIVE');

    await store.updateTask({ id: task.id, status: 'COMPLETED', summary: 'done' });
    const ran = await app.supervisor.maybeRunPendingRestart();
    assert.equal(ran.scheduled, false);
    assert.equal(ran.state, 'ONLINE');
    assert.notEqual(app.supervisor.relayPid, pidBefore);
  });
});

test('supervisor never kills an unrelated process on stop', async () => {
  await withDashboard(async ({ app }) => {
    const unrelated = spawn(process.execPath, [DUMMY_RELAY], { stdio: 'ignore', windowsHide: true });
    await wait(80);
    app.supervisor.startRelay();
    await app.supervisor.stopRelay();
    assert.equal(isPidAlive(unrelated.pid), true);
    unrelated.kill();
  });
});
