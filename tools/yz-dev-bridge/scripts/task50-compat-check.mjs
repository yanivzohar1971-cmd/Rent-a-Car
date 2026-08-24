import { loadDotEnv } from '../src/relay/relayConfig.js';
loadDotEnv();

const API = String(process.env.YZ_BRIDGE_FIREBASE_API_URL || '').replace(/\/$/, '');
const PERM = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '').trim();
const TOKEN = String(process.env.YZ_BRIDGE_API_TOKEN || '').trim();

const out = {
  hasLocalPermanentKey: Boolean(PERM),
  permanentKeyLen: PERM.length,
  hasBearer: Boolean(TOKEN),
};

if (PERM) {
  const missing = await fetch(`${API}/chatgpt/task?id=NOPE&key=${encodeURIComponent(PERM)}`);
  const body = await missing.json();
  out.permanentProbe = {
    status: missing.status,
    ok: body.ok,
    code: body.code || null,
    // 401 = key rejected; 404 = key accepted, task missing
    interpretation: missing.status === 404
      ? 'PERMANENT_KEY_ACCEPTED'
      : missing.status === 401
        ? 'PERMANENT_KEY_REJECTED'
        : `OTHER_${missing.status}`,
  };
}

// bearer status
const status = await fetch(`${API}/status`, { headers: { authorization: `Bearer ${TOKEN}` } });
out.bearerStatus = { status: status.status, ok: (await status.json()).ok === true };

// revoke-all remaining smoke sessions via local supervisor
const revokeAll = await fetch('http://127.0.0.1:8787/api/chatgpt-sessions/revoke-all', { method: 'POST' });
out.revokeAll = { status: revokeAll.status, ...(await revokeAll.json()) };

// store fingerprint after smoke
import { readFileSync, statSync } from 'fs';
const storePath = new URL('../data/bridge.json', import.meta.url);
const data = JSON.parse(readFileSync(storePath, 'utf8'));
const tasks = data.tasks || [];
const ids = tasks.map((t) => t.id).sort();
const statuses = {};
for (const t of tasks) statuses[t.status] = (statuses[t.status] || 0) + 1;
out.storeAfter = {
  bytes: statSync(storePath).size,
  taskCount: tasks.length,
  statusCounts: statuses,
  idFingerprint: `${ids.join('|').length}:${ids.length}`,
  lastIds: ids.slice(-5),
  smokeLocalTasks: tasks.filter((t) => /SMOKE|HANDOFF|TASK-00050 non-destructive/i.test(String(t.title || ''))).map((t) => ({ id: t.id, status: t.status })),
};

console.log(JSON.stringify(out, null, 2));
