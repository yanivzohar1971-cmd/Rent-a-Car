import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BridgeStore } from '../src/store.js';
import { createDashboardApp, listenDashboard } from '../src/dashboard/server.js';
import { DashboardSupervisor } from '../src/dashboard/supervisor.js';
import { parseSseBuffer } from '../src/dashboard/events.js';

export const DUMMY_RELAY = fileURLToPath(new URL('../scripts/dummy-relay.mjs', import.meta.url));

export function createMockChatGptHandoffService({
  configured = true,
  apiBase = 'https://example.test/yzBridgeApi',
} = {}) {
  const sessions = new Map();
  let handoffSeq = 0;
  return {
    isConfigured() { return configured; },
    configSummary() {
      return {
        configured,
        apiUrl: configured ? apiBase : '',
        agentId: 'test-agent',
        project: 'Rent_a_Car',
        intervalMs: 15000,
        tokenConfigured: configured,
      };
    },
    async createHandoff({ durationPreset = '24h' } = {}) {
      if (!configured) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      handoffSeq += 1;
      const seconds = durationPreset === '1h' ? 3600 : durationPreset === '7d' ? 604800 : 86400;
      const code = `test-handoff-code-${handoffSeq}`;
      return {
        ok: true,
        handoffId: `handoff-${handoffSeq}`,
        bootstrapUrl: `${apiBase}/chatgpt/bootstrap?code=${encodeURIComponent(code)}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        expiresInSeconds: 600,
        requestedSessionDurationSeconds: seconds,
        label: null,
      };
    },
    async listSessions() {
      if (!configured) {
        const err = new Error('ChatGPT handoff service not configured');
        err.code = 'not_configured';
        throw err;
      }
      return { ok: true, sessions: [...sessions.values()] };
    },
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.status = 'REVOKED';
        session.revokedAt = new Date().toISOString();
      }
      return { ok: true, session: session || null };
    },
    async revokeAllSessions() {
      let revoked = 0;
      for (const session of sessions.values()) {
        if (session.status === 'REVOKED' || session.revokedAt) continue;
        // Match backend: only skip already-revoked; expired ACTIVE-status can still be marked REVOKED.
        session.status = 'REVOKED';
        session.revokedAt = new Date().toISOString();
        revoked += 1;
      }
      return { ok: true, revoked };
    },
    /** Test helper: seed a visible session without secrets. */
    seedSession(partial = {}) {
      const id = partial.id || `session-${sessions.size + 1}`;
      const session = {
        id,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
        revokedAt: null,
        lastUsedAt: null,
        createdVia: 'dashboard-handoff',
        label: partial.label || null,
        status: partial.status || 'ACTIVE',
        ...partial,
      };
      sessions.set(id, session);
      return session;
    },
  };
}

/**
 * Start an isolated dashboard (temp Store, port 0, dummy relay).
 * Callers MUST await close() — used by Playwright fixtures.
 */
export async function startIsolatedDashboard({
  setupStore,
  heartbeatMs = 15_000,
  pollIntervalMs = 500,
  env = process.env,
  chatgptHandoffService = null,
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dashboard-'));
  const store = new BridgeStore(join(dir, 'bridge.json'));
  if (typeof setupStore === 'function') await setupStore(store);
  const supervisor = new DashboardSupervisor({
    store,
    relayScript: DUMMY_RELAY,
    env: {
      ...env,
      YZ_BRIDGE_TEST_MODE: '1',
      YZ_BRIDGE_DASHBOARD_AUTO_START_RELAY: 'false',
      YZ_BRIDGE_DISABLE_FIREBASE: '1',
      YZ_BRIDGE_DISABLE_GITHUB: '1',
      YZ_BRIDGE_DISABLE_REAL_AGENT_LAUNCH: '1',
    },
  });
  const app = createDashboardApp({
    store,
    supervisor,
    host: '127.0.0.1',
    port: 0,
    heartbeatMs,
    pollIntervalMs,
    debug: false,
    chatgptHandoffService: chatgptHandoffService || createMockChatGptHandoffService(),
  });
  const address = await listenDashboard(app, { host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${address.port}`;
  await app.poll();
  return {
    app,
    store,
    base,
    address,
    dir,
    async close() {
      try { await app.supervisor.stopRelay(); } catch { /* owned child only */ }
      try { app.supervisor.child?.kill('SIGKILL'); } catch { /* already gone */ }
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function withDashboard(fn, { setupStore, heartbeatMs = 40, pollIntervalMs = 25, chatgptHandoffService = null } = {}) {
  const ctx = await startIsolatedDashboard({ setupStore, heartbeatMs, pollIntervalMs, chatgptHandoffService });
  try {
    return await fn(ctx);
  } finally {
    await ctx.close();
  }
}

export async function seedManyTasks(store, {
  count = 40,
} = {}) {
  for (let i = 1; i <= count; i += 1) {
    const task = await store.createTask({
      project: i % 11 === 0 ? 'glasses' : 'rent-a-car',
      title: i === 1
        ? `Very long title for overflow and wrapping checks ${'X'.repeat(80)}`
        : `Fixture task ${i}`,
      instructions: 'fixture-only — never launch agents',
      createdBy: 'playwright',
      metadata: {
        source: i % 2 === 0 ? 'github-inbox' : 'mcp',
        githubIssueNumber: i % 2 === 0 ? String(1000 + i) : undefined,
        githubRepo: i % 2 === 0 ? 'yanivzohar1971-cmd/Rent-a-Car' : undefined,
        v2: i === 2 ? {
          execution: { provider: 'legacy', state: 'RUNNING', executionId: 'EXEC-FIX' },
          verification: { state: 'PASS' },
        } : undefined,
      },
    });
    if (i % 7 === 0) {
      await store.updateTask({ id: task.id, status: 'FAILED', actor: 'playwright', summary: 'fixture fail' });
    } else if (i % 5 === 0) {
      await store.updateTask({ id: task.id, status: 'COMPLETED', actor: 'playwright', summary: 'fixture ok' });
    } else if (i % 3 === 0) {
      await store.claimTask({ id: task.id, actor: 'cursor' });
    }
  }
}

export async function getJson(base, path) {
  const res = await fetch(`${base}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

export async function postJson(base, path) {
  const res = await fetch(`${base}${path}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export function collectSse(base, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL('/events', base);
    const req = fetch(url).then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const timer = setTimeout(() => {
        reader.cancel().catch(() => undefined);
      }, timeoutMs);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      } finally {
        clearTimeout(timer);
      }
      resolve({ status: res.status, events: parseSseBuffer(buffer), raw: buffer });
    }).catch(reject);
    void req;
  });
}

export async function readSseUntil(base, predicate, { timeoutMs = 2000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const res = await fetch(`${base}/events`, { signal: ac.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = parseSseBuffer(buffer);
      if (predicate(events)) {
        await reader.cancel().catch(() => undefined);
        return events;
      }
    }
    return parseSseBuffer(buffer);
  } finally {
    clearTimeout(timer);
  }
}

export function agentSessionFixture(overrides = {}) {
  return {
    nonce: 'test-nonce-should-never-leak',
    file: 'C:\\Users\\Yaniv\\AppData\\Local\\Temp\\agent-secret.json',
    pid: 4242,
    startedAt: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    taskId: overrides.taskId || null,
    ...overrides,
  };
}
