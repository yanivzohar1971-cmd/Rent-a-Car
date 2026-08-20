import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../src/store.js';
import { FirebaseRelayClient, RelayHttpError } from '../src/relay/firebaseRelayClient.js';
import { RelayWorker } from '../src/relay/relayWorker.js';
import { mapFirebaseTaskToLocalInput, mapLocalStatusToFirebase, shouldPublishResult } from '../src/relay/taskMapper.js';

function silentLogger() {
  return { error() {}, info() {} };
}

class FakeFirebaseApi {
  constructor() {
    this.tasks = new Map();
    this.fetchCalls = 0;
    this.failuresLeft = 0;
  }

  seedQueued(task) {
    this.tasks.set(task.id, { ...task, status: 'QUEUED', claimedBy: null });
  }

  async handle(url, options = {}) {
    this.fetchCalls += 1;
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('temporary network failure');
    }
    const parsed = new URL(url);
    const method = options.method || 'GET';
    const path = parsed.pathname;
    const json = (status, body) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });

    if (method === 'GET' && path.endsWith('/tasks')) {
      const status = parsed.searchParams.get('status');
      const project = parsed.searchParams.get('project');
      const claimedBy = parsed.searchParams.get('claimedBy');
      const tasks = [...this.tasks.values()].filter((task) => {
        if (project && task.project !== project) return false;
        if (status && task.status !== status) return false;
        if (claimedBy && task.claimedBy !== claimedBy) return false;
        return true;
      });
      return json(200, { ok: true, tasks });
    }

    const claimMatch = path.match(/\/task\/([^/]+)\/claim$/);
    if (method === 'POST' && claimMatch) {
      const id = decodeURIComponent(claimMatch[1]);
      const task = this.tasks.get(id);
      if (!task) return json(404, { ok: false, error: 'not found', code: 'not_found' });
      if (task.status !== 'QUEUED') {
        return json(409, { ok: false, error: 'already claimed', code: 'already_claimed' });
      }
      const body = JSON.parse(options.body || '{}');
      task.status = 'CLAIMED';
      task.claimedBy = body.actor;
      this.tasks.set(id, task);
      return json(200, { ok: true, taskId: id, status: task.status, task });
    }

    const statusMatch = path.match(/\/task\/([^/]+)\/status$/);
    if (method === 'POST' && statusMatch) {
      const id = decodeURIComponent(statusMatch[1]);
      const task = this.tasks.get(id);
      const body = JSON.parse(options.body || '{}');
      if (task.status === body.status) {
        return json(409, { ok: false, error: 'invalid transition', code: 'invalid_transition' });
      }
      task.status = body.status;
      this.tasks.set(id, task);
      return json(200, { ok: true, taskId: id, status: task.status, task });
    }

    const resultMatch = path.match(/\/task\/([^/]+)\/result$/);
    if (method === 'POST' && resultMatch) {
      const id = decodeURIComponent(resultMatch[1]);
      const task = this.tasks.get(id);
      const body = JSON.parse(options.body || '{}');
      Object.assign(task, {
        status: body.status,
        resultSummary: body.resultSummary,
        changedFiles: body.changedFiles || [],
        tests: body.tests || [],
        error: body.error || null,
        publishCount: (task.publishCount || 0) + 1,
      });
      this.tasks.set(id, task);
      return json(200, { ok: true, taskId: id, status: task.status, task });
    }

    return json(404, { ok: false, error: 'Not found' });
  }
}

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-relay-'));
  try {
    const store = new BridgeStore(join(dir, 'bridge.json'));
    await fn(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Firebase task maps correctly into local bridge task', async () => {
  await withStore(async (store) => {
    const mapped = mapFirebaseTaskToLocalInput({
      id: 'abc123',
      project: 'Rent_a_Car',
      title: 'Diagnose matching',
      instructions: 'Inspect Shagrir code',
      priority: 'high',
      source: 'chatgpt',
      requestId: 'req-1',
    });
    const imported = await store.importFirebaseTask(mapped);
    assert.equal(imported.created, true);
    assert.equal(imported.task.status, 'READY');
    assert.equal(imported.task.project, 'Rent_a_Car');
    assert.equal(imported.task.metadata.firebaseTaskId, 'abc123');
    assert.equal(imported.task.metadata.requestId, 'req-1');
    assert.equal(imported.task.priority, 'high');
  });
});

test('duplicate Firebase task is not inserted twice', async () => {
  await withStore(async (store) => {
    const payload = mapFirebaseTaskToLocalInput({
      id: 'dup-1',
      project: 'Rent_a_Car',
      title: 'Dup',
      instructions: 'Once only',
    });
    const first = await store.importFirebaseTask(payload);
    const second = await store.importFirebaseTask(payload);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.task.id, first.task.id);
    const listed = await store.listFirebaseRelayTasks();
    assert.equal(listed.length, 1);
  });
});

test('local completed task publishes result once', async () => {
  await withStore(async (store) => {
    const api = new FakeFirebaseApi();
    api.seedQueued({
      id: 'fb-complete',
      project: 'Rent_a_Car',
      title: 'Complete',
      instructions: 'Work',
      priority: 'normal',
      source: 'chatgpt',
    });
    const client = new FirebaseRelayClient({
      apiUrl: 'http://firebase.test/yzBridgeApi',
      token: 'test-token',
      agentId: 'agent-1',
      fetchImpl: (url, options) => api.handle(url, options),
    });
    const worker = new RelayWorker({
      client,
      store,
      config: { project: 'Rent_a_Car', agentId: 'agent-1', intervalMs: 15_000 },
      logger: silentLogger(),
    });

    await worker.tick();
    const local = await store.findByFirebaseTaskId('fb-complete');
    assert.ok(local);
    await store.claimTask({ id: local.id, actor: 'cursor' });
    await store.updateTask({
      id: local.id,
      status: 'COMPLETED',
      summary: 'Finished',
      changedFiles: ['A.kt'],
      tests: ['unit passed'],
    });

    await worker.tick();
    await worker.tick();
    const remote = api.tasks.get('fb-complete');
    assert.equal(remote.status, 'COMPLETED');
    assert.equal(remote.resultSummary, 'Finished');
    assert.equal(remote.publishCount, 1);
    const published = await store.getTask(local.id);
    assert.ok(published.metadata.relayPublishedAt);
    assert.equal(shouldPublishResult(published), false);
  });
});

test('retry after temporary network failure', async () => {
  const api = new FakeFirebaseApi();
  api.seedQueued({
    id: 'fb-retry',
    project: 'Rent_a_Car',
    title: 'Retry',
    instructions: 'Work',
  });
  api.failuresLeft = 2;
  const client = new FirebaseRelayClient({
    apiUrl: 'http://firebase.test/yzBridgeApi',
    token: 'test-token',
    agentId: 'agent-1',
    retries: 4,
    fetchImpl: (url, options) => api.handle(url, options),
  });
  const listed = await client.listTasks({ project: 'Rent_a_Car', status: 'QUEUED' });
  assert.equal(listed.tasks.length, 1);
  assert.ok(api.fetchCalls >= 3);
});

test('restart does not duplicate completed or claimed work', async () => {
  await withStore(async (store) => {
    const api = new FakeFirebaseApi();
    api.seedQueued({
      id: 'fb-restart',
      project: 'Rent_a_Car',
      title: 'Restart',
      instructions: 'Work',
    });
    const client = new FirebaseRelayClient({
      apiUrl: 'http://firebase.test/yzBridgeApi',
      token: 'test-token',
      agentId: 'agent-1',
      fetchImpl: (url, options) => api.handle(url, options),
    });
    const config = { project: 'Rent_a_Car', agentId: 'agent-1', intervalMs: 15_000 };
    const first = new RelayWorker({ client, store, config, logger: silentLogger() });
    await first.tick();
    const afterFirst = await store.listFirebaseRelayTasks();
    assert.equal(afterFirst.length, 1);

    const second = new RelayWorker({ client, store, config, logger: silentLogger() });
    await second.tick();
    const afterRestart = await store.listFirebaseRelayTasks();
    assert.equal(afterRestart.length, 1);
    assert.equal(afterRestart[0].id, afterFirst[0].id);
    assert.equal(api.tasks.get('fb-restart').status, 'CLAIMED');
  });
});

test('claim conflict is not treated as a fatal relay error', async () => {
  const err = new RelayHttpError(409, 'already_claimed', 'already claimed', false);
  assert.equal(err.retryable, false);
  assert.equal(err.status, 409);
});

test('local FAILED maps to Firebase FAILED and is publishable', () => {
  const failed = { status: 'FAILED', metadata: { firebaseTaskId: 'fb-1' } };
  assert.equal(mapLocalStatusToFirebase(failed), 'FAILED');
  assert.equal(shouldPublishResult(failed), true);
  assert.equal(mapLocalStatusToFirebase({
    status: 'COMPLETED',
    metadata: { firebaseTaskId: 'fb-2', verificationFailed: true },
  }), 'FAILED');
});
