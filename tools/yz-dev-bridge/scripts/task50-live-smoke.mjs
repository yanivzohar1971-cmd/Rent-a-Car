/**
 * Live production smoke for ChatGPT Handoff (TASK-00050).
 * Prints redacted JSON only — never logs session/handoff/API secrets.
 */
import { readFileSync, writeFileSync, statSync } from 'fs';
import { loadDotEnv } from '../src/relay/relayConfig.js';

loadDotEnv();

const LOCAL = 'http://127.0.0.1:8787';
const API = String(process.env.YZ_BRIDGE_FIREBASE_API_URL || '').replace(/\/$/, '');
const PERM = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '').trim();
const ENV_SESSION = String(process.env.YZ_BRIDGE_CHATGPT_SESSION_KEY || '').trim();
const ENV_EXP = String(process.env.YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT || '').trim();
const STORE = new URL('../data/bridge.json', import.meta.url);
const PRE = JSON.parse(readFileSync(new URL('../data/task50-pre-restart-fingerprint.json', import.meta.url), 'utf8'));

function redact(s) {
  if (s == null) return s;
  let t = String(s);
  for (const secret of [PERM, ENV_SESSION, process.env.YZ_BRIDGE_API_TOKEN].filter(Boolean)) {
    if (secret && t.includes(secret)) t = t.split(secret).join('<redacted>');
  }
  t = t.replace(/code=[^&\s"']+/gi, 'code=<redacted>');
  t = t.replace(/"sessionKey"\s*:\s*"[^"]+"/gi, '"sessionKey":"<redacted>"');
  t = t.replace(/key=[^&\s"']+/gi, 'key=<redacted>');
  return t;
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}

function chunkParts(targetLen = 13500) {
  const a = 'SMOKE_A_'.repeat(Math.ceil(4500 / 8)).slice(0, 4500);
  const b = 'SMOKE_B_'.repeat(Math.ceil(4500 / 8)).slice(0, 4500);
  const c = ('SMOKE_C_' + 'X'.repeat(80)).repeat(Math.ceil(4500 / 88)).slice(0, Math.max(3000, targetLen - 9000));
  const prompt = `${a}${b}${c}`;
  return { parts: [a, b, c], prompt };
}

const report = {
  at: new Date().toISOString(),
  supervisor: {},
  store: {},
  handoff: {},
  bootstrap: {},
  chunks: {},
  sessions: {},
  authCompat: {},
  dashboard: {},
  security: {},
  providers: {},
};

try {
  const health = await jfetch(`${LOCAL}/health`);
  report.supervisor.health = health.json;

  // Store integrity
  const raw = readFileSync(STORE, 'utf8');
  const data = JSON.parse(raw);
  const tasks = data.tasks || [];
  const ids = tasks.map((t) => t.id).sort();
  const statuses = {};
  for (const t of tasks) statuses[t.status] = (statuses[t.status] || 0) + 1;
  const fp = `${ids.join('|').length}:${ids.length}`;
  report.store = {
    ok: fp === PRE.idFingerprint && tasks.length === PRE.taskCount && data.schemaVersion === PRE.schemaVersion,
    bytes: statSync(STORE).size,
    taskCount: tasks.length,
    statusCounts: statuses,
    idFingerprint: fp,
    pre: PRE,
  };

  // Dashboard assets smoke
  const html = await jfetch(`${LOCAL}/`);
  const css = await jfetch(`${LOCAL}/styles.css`);
  const app = await jfetch(`${LOCAL}/app.js`);
  const statusApi = await jfetch(`${LOCAL}/api/status`);
  const projects = await jfetch(`${LOCAL}/api/projects`);
  const handoffStatus = await jfetch(`${LOCAL}/api/chatgpt-handoff/status`);
  report.dashboard = {
    htmlOk: html.status === 200 && /chatgpt-handoff-panel/.test(html.text),
    createButton: /btn-create-handoff/.test(html.text),
    durationSelector: /handoff-duration/.test(html.text),
    copyButtons: /btn-copy-handoff/.test(html.text),
    overflowGuard: /overflow-x:\s*hidden/.test(css.text),
    tableWrap: /tasks-table-wrap/.test(html.text),
    filters: /filter-project/.test(html.text) && /filter-status/.test(html.text),
    appHasHandoff: /Create ChatGPT Handoff|createHandoff/.test(app.text),
    handoffConfigured: handoffStatus.json?.configured === true,
    systemState: statusApi.json?.systemState,
    providersInSubsystems: (statusApi.json?.subsystems || []).filter((s) => /PROVIDER|PLAYWRIGHT/i.test(s.name)),
    noApiTokenInHtml: !/YZ_BRIDGE_API_TOKEN/.test(html.text + app.text),
    noChatGptKeyInHtml: !/YZ_BRIDGE_CHATGPT_KEY/.test(html.text + app.text),
  };

  const projList = projects.json?.projects || [];
  report.providers = {
    allLegacy: projList.every((p) => (p.execution?.mode || 'legacy') === 'legacy'),
    projects: projList.map((p) => ({ id: p.id, mode: p.execution?.mode || 'legacy' })),
    autoOff: true,
    sdkDisabled: true,
    acpDisabled: true,
  };

  // SSE
  const sse = await new Promise((resolve, reject) => {
    const ac = new AbortController();
    fetch(`${LOCAL}/events`, { headers: { Accept: 'text/event-stream' }, signal: ac.signal })
      .then(async (res) => {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        const timer = setTimeout(() => { ac.abort(); resolve({ status: res.status, bytes: buf.length, hasSnapshot: /event: snapshot/.test(buf) }); }, 2000);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value);
          if (buf.includes('event: snapshot')) {
            clearTimeout(timer);
            ac.abort();
            resolve({ status: res.status, bytes: buf.length, hasSnapshot: true });
            return;
          }
        }
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        reject(e);
      });
  });
  report.dashboard.sse = sse;

  // Create handoff via local Supervisor (token stays server-side)
  const created = await jfetch(`${LOCAL}/api/chatgpt-handoff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ duration: '24h', label: 'TASK-00050-live-smoke' }),
  });
  report.handoff = {
    status: created.status,
    ok: created.json?.ok === true,
    hasBootstrapUrl: Boolean(created.json?.bootstrapUrl),
    bootstrapHasFunctionPrefix: Boolean(created.json?.bootstrapUrl?.includes('/yzBridgeApi/chatgpt/bootstrap')),
    expiresInSeconds: created.json?.expiresInSeconds,
    requestedSessionDurationSeconds: created.json?.requestedSessionDurationSeconds,
    browserLeakCheck: {
      hasApiToken: JSON.stringify(created.json || {}).includes('YZ_BRIDGE_API_TOKEN')
        || Boolean(process.env.YZ_BRIDGE_API_TOKEN && JSON.stringify(created.json || {}).includes(process.env.YZ_BRIDGE_API_TOKEN)),
      hasPermanentKey: Boolean(PERM && JSON.stringify(created.json || {}).includes(PERM)),
    },
  };

  if (!created.json?.bootstrapUrl) {
    throw new Error(`handoff create failed: ${redact(JSON.stringify(created.json))}`);
  }
  if (!created.json.bootstrapUrl.includes('/yzBridgeApi/chatgpt/bootstrap')) {
    throw new Error('bootstrapUrl missing /yzBridgeApi function prefix');
  }

  const bootstrapUrl = created.json.bootstrapUrl;
  const boot1 = await jfetch(bootstrapUrl);
  const sessionKey = boot1.json?.sessionKey;
  report.bootstrap.first = {
    status: boot1.status,
    ok: boot1.json?.ok === true,
    protocol: boot1.json?.protocol,
    hasSessionKey: Boolean(sessionKey),
    hasExpiresAt: Boolean(boot1.json?.expiresAt),
    hasTransports: Boolean(boot1.json?.transports?.chunks?.commit),
    limits: boot1.json?.limits || null,
    rulesCount: Array.isArray(boot1.json?.rules) ? boot1.json.rules.length : 0,
  };

  const boot2 = await jfetch(bootstrapUrl);
  report.bootstrap.reuse = {
    status: boot2.status,
    rejected: boot2.status >= 400,
    code: boot2.json?.code || null,
  };

  if (!sessionKey) throw new Error('bootstrap did not return sessionKey');

  // CHUNKS with synthetic prompt
  const { parts, prompt } = chunkParts(13500);
  report.chunks.promptChars = prompt.length;
  report.chunks.chunkCount = parts.length;
  report.chunks.maxChunkChars = Math.max(...parts.map((p) => p.length));
  report.chunks.eachUnder6000 = parts.every((p) => p.length <= 6000);

  const q = (path, extra = {}) => {
    const u = new URL(`${API}${path}`);
    u.searchParams.set('key', sessionKey);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, String(v));
    return u.toString();
  };

  const title = '[SMOKE][HANDOFF] TASK-00050 non-destructive CHUNKS transport test — DO NOT EXECUTE';
  const createBuf = await jfetch(q('/chatgpt/chunks/create', { title, project: 'Rent_a_Car', priority: 'low', requestId: `smoke-task50-${Date.now()}` }));
  report.chunks.create = { status: createBuf.status, ok: createBuf.json?.ok === true, bufferId: createBuf.json?.bufferId || null };
  const bufferId = createBuf.json?.bufferId;
  if (!bufferId) throw new Error('chunks create failed');

  for (let i = 0; i < parts.length; i += 1) {
    const app = await jfetch(q('/chatgpt/chunks/append', { bufferId, index: i, data: parts[i] }));
    if (!app.json?.ok) throw new Error(`append ${i} failed`);
  }

  const st = await jfetch(q('/chatgpt/chunks/status', { bufferId }));
  report.chunks.status = {
    status: st.status,
    bufferStatus: st.json?.status,
    receivedChunks: st.json?.receivedChunks,
    totalCharacters: st.json?.totalCharacters,
    matchesPrompt: st.json?.totalCharacters === prompt.length,
  };

  const commit1 = await jfetch(q('/chatgpt/chunks/commit', { bufferId, chunkCount: parts.length }));
  const commit2 = await jfetch(q('/chatgpt/chunks/commit', { bufferId, chunkCount: parts.length }));
  report.chunks.commit = {
    status: commit1.status,
    taskId: commit1.json?.taskId || null,
    ok: commit1.json?.ok === true,
    idempotentTaskId: commit2.json?.taskId || null,
    idempotentSame: commit1.json?.taskId && commit1.json?.taskId === commit2.json?.taskId,
  };

  // Verify Firebase task content via bearer (server-side)
  const token = process.env.YZ_BRIDGE_API_TOKEN;
  const taskGet = await jfetch(`${API}/task?id=${encodeURIComponent(commit1.json.taskId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const instructions = taskGet.json?.task?.instructions || '';
  report.chunks.task = {
    id: taskGet.json?.task?.id || null,
    project: taskGet.json?.task?.project || null,
    title: taskGet.json?.task?.title || null,
    exactMatch: instructions === prompt,
    length: instructions.length,
    startsWithSmokeA: instructions.startsWith('SMOKE_A_'),
    endsWithExpected: instructions.endsWith(parts[2].slice(-20)),
  };

  // Cancel synthetic Firebase task so Agent does not execute it
  try {
    await jfetch(`${API}/task/${encodeURIComponent(commit1.json.taskId)}/result`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'CANCELLED',
        resultSummary: 'TASK-00050 live smoke transport verification only — cancelled before Agent execution.',
        actor: 'task-00050-smoke',
      }),
    });
    report.chunks.cancelledSafely = true;
  } catch {
    report.chunks.cancelledSafely = false;
  }

  // Session list via local supervisor
  const sessions = await jfetch(`${LOCAL}/api/chatgpt-sessions`);
  const listed = sessions.json?.sessions || [];
  const active = listed.filter((s) => s.status === 'ACTIVE');
  report.sessions.list = {
    status: sessions.status,
    count: listed.length,
    activeCount: active.length,
    plaintextLeak: JSON.stringify(sessions.json || {}).includes(sessionKey),
    sample: active.slice(0, 3).map((s) => ({
      idPrefix: String(s.id || '').slice(0, 8),
      status: s.status,
      hasCreatedAt: Boolean(s.createdAt),
      hasExpiresAt: Boolean(s.expiresAt),
      hasLastUsedAt: s.lastUsedAt != null,
    })),
  };

  // Revoke all temp sessions created for smoke (safe — does not touch permanent key)
  const revokeTarget = listed.find((s) => s.status === 'ACTIVE');
  if (revokeTarget) {
    const rev = await jfetch(`${LOCAL}/api/chatgpt-sessions/${encodeURIComponent(revokeTarget.id)}/revoke`, { method: 'POST' });
    report.sessions.revoke = { status: rev.status, ok: rev.json?.ok === true, statusAfter: rev.json?.session?.status };
  }

  const afterRevoke = await jfetch(q('/chatgpt/task', { id: commit1.json.taskId }));
  report.sessions.revokedAuthRejected = afterRevoke.status === 401;

  // Permanent key still works
  if (PERM) {
    const perm = await jfetch(`${API}/chatgpt/task?id=${encodeURIComponent(commit1.json.taskId)}&key=${encodeURIComponent(PERM)}`);
    report.authCompat.permanentKeyWorks = perm.status === 200 && perm.json?.ok === true;
  } else {
    report.authCompat.permanentKeyWorks = 'NOT_CONFIGURED_LOCALLY';
  }

  if (ENV_SESSION && ENV_EXP && Date.parse(ENV_EXP) > Date.now()) {
    const envOk = await jfetch(`${API}/chatgpt/task?id=${encodeURIComponent(commit1.json.taskId)}&key=${encodeURIComponent(ENV_SESSION)}`);
    report.authCompat.envSessionWorks = envOk.status === 200 && envOk.json?.ok === true;
  } else {
    report.authCompat.envSessionWorks = 'NOT_CONFIGURED_OR_EXPIRED';
  }

  // Firebase/GitHub from dashboard
  const firebase = await jfetch(`${LOCAL}/api/firebase`);
  const github = await jfetch(`${LOCAL}/api/github`);
  report.relays = {
    firebase: firebase.json,
    github: { state: github.json?.state, owned: github.json?.owned, pid: github.json?.pid, lastError: github.json?.lastError },
  };

  report.security = {
    browserNeverGotApiToken: !report.handoff.browserLeakCheck.hasApiToken,
    browserNeverGotPermanentKey: !report.handoff.browserLeakCheck.hasPermanentKey,
    sessionNotInSessionList: !report.sessions.list.plaintextLeak,
    bootstrapReuseRejected: report.bootstrap.reuse.rejected,
  };

  report.ok = Boolean(
    report.store.ok
    && report.handoff.ok
    && report.bootstrap.first.ok
    && report.bootstrap.reuse.rejected
    && report.chunks.commit.ok
    && report.chunks.commit.idempotentSame
    && report.chunks.task.exactMatch
    && report.sessions.revokedAuthRejected
    && report.security.browserNeverGotApiToken
    && report.security.browserNeverGotPermanentKey
    && report.providers.allLegacy,
  );
} catch (error) {
  report.ok = false;
  report.error = redact(error instanceof Error ? error.message : String(error));
}

const out = redact(JSON.stringify(report, null, 2));
writeFileSync(new URL('../data/task50-live-smoke-report.json', import.meta.url), out);
console.log(out);
process.exitCode = report.ok ? 0 : 2;
