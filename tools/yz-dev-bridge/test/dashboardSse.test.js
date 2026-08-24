import test from 'node:test';
import assert from 'node:assert/strict';
import { EventHub, parseSseBuffer } from '../src/dashboard/events.js';
import { withDashboard } from './dashboardHarness.js';

test('SSE hub emits snapshot, heartbeat, and cleans up disconnected clients', async () => {
  const hub = new EventHub({ limit: 5, heartbeatMs: 30 });
  hub.start();
  const writes = [];
  const res = {
    headersSent: false,
    writeHead() { this.headersSent = true; },
    write(chunk) { writes.push(String(chunk)); return true; },
    end() { this.ended = true; },
    on() {},
  };
  const client = hub.subscribe(res, { snapshot: { systemState: 'ONLINE' } });
  assert.equal(hub.clientCount, 1);
  assert.match(writes.join(''), /event: snapshot/);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.ok(parseSseBuffer(writes.join('')).some((item) => item.type === 'heartbeat'));
  hub.emit('task', { taskId: 'TASK-00001', message: 'updated' });
  const events = parseSseBuffer(writes.join(''));
  assert.ok(events.some((item) => item.type === 'task'));
  hub.disconnect(client);
  assert.equal(hub.clientCount, 0);
  hub.emit('task', { taskId: 'TASK-00002' });
  hub.stop();
  assert.ok(hub.history.length <= 5);
});

async function openSse(base) {
  const ac = new AbortController();
  const res = await fetch(`${base}/events`, { signal: ac.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    async waitFor(predicate, timeoutMs = 2500) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const events = parseSseBuffer(buffer);
        if (predicate(events)) return events;
        const remaining = deadline - Date.now();
        const readPromise = reader.read();
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), Math.min(200, remaining)));
        const chunk = await Promise.race([readPromise, timeout]);
        if (chunk?.timeout) continue;
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return parseSseBuffer(buffer);
    },
    close() {
      ac.abort();
      return reader.cancel().catch(() => undefined);
    },
  };
}

test('SSE client receives initial snapshot and later task/relay events', async () => {
  await withDashboard(async ({ app, store, base }) => {
    const stream = await openSse(base);
    try {
      const snapshotEvents = await stream.waitFor((events) => events.some((item) => item.type === 'snapshot'));
      assert.ok(snapshotEvents.some((item) => item.type === 'snapshot'));

      const created = await store.createTask({
        project: 'rent-a-car',
        title: 'Live',
        instructions: 'Emit me',
      });
      await app.poll();
      const later = await stream.waitFor((events) => (
        events.some((item) => item.payload?.taskId === created.id)
      ));
      assert.ok(later.some((item) => item.payload?.taskId === created.id));

      app.supervisor.startRelay();
      await app.poll();
      const relayEvents = await stream.waitFor((events) => (
        events.some((item) => item.type === 'relay' && item.payload?.state === 'ONLINE')
      ));
      assert.ok(relayEvents.some((item) => item.type === 'relay'));
    } finally {
      await stream.close();
    }
  }, { heartbeatMs: 40, pollIntervalMs: 30 });
});

test('SSE disconnected client is removed from the hub', async () => {
  await withDashboard(async ({ app, base }) => {
    const ac = new AbortController();
    const pending = fetch(`${base}/events`, { signal: ac.signal });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.ok(app.events.clientCount >= 1);
    ac.abort();
    await pending.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(app.events.clientCount, 0);
  });
});
