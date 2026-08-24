import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Mirror of dashboard effectiveSessionStatus / classifySessions for unit coverage
 * without loading browser DOM code.
 */
function effectiveSessionStatus(session, now = Date.now()) {
  if (!session) return 'EXPIRED';
  if (session.revokedAt || session.status === 'REVOKED') return 'REVOKED';
  if (session.status === 'EXPIRED') return 'EXPIRED';
  const expiresMs = Date.parse(session.expiresAt || '');
  if (Number.isFinite(expiresMs) && expiresMs <= now) return 'EXPIRED';
  return 'ACTIVE';
}

function classifySessions(sessions, now = Date.now()) {
  const active = [];
  const history = [];
  for (const session of sessions) {
    const effective = effectiveSessionStatus(session, now);
    if (effective === 'ACTIVE') active.push({ ...session, effective });
    else history.push({ ...session, effective });
  }
  return { active, history };
}

test('effectiveSessionStatus classifies revoked/expired/active truthfully', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');
  assert.equal(effectiveSessionStatus({ status: 'ACTIVE', expiresAt: '2026-08-25T00:00:00.000Z' }, now), 'ACTIVE');
  assert.equal(effectiveSessionStatus({ status: 'REVOKED', revokedAt: '2026-08-24T11:00:00.000Z', expiresAt: '2026-08-25T00:00:00.000Z' }, now), 'REVOKED');
  assert.equal(effectiveSessionStatus({ status: 'ACTIVE', expiresAt: '2026-08-24T11:00:00.000Z' }, now), 'EXPIRED');
  assert.equal(effectiveSessionStatus({ status: 'EXPIRED', expiresAt: '2026-08-25T00:00:00.000Z' }, now), 'EXPIRED');
});

test('classifySessions keeps revoked out of active bucket', () => {
  const now = Date.parse('2026-08-24T12:00:00.000Z');
  const { active, history } = classifySessions([
    { id: 'a', status: 'ACTIVE', expiresAt: '2026-08-25T00:00:00.000Z', label: 'live' },
    { id: 'r', status: 'REVOKED', revokedAt: '2026-08-24T10:00:00.000Z', expiresAt: '2026-08-25T00:00:00.000Z', label: 'smoke' },
    { id: 'e', status: 'ACTIVE', expiresAt: '2026-08-24T11:00:00.000Z', label: 'old' },
  ], now);
  assert.deepEqual(active.map((s) => s.id), ['a']);
  assert.deepEqual(history.map((s) => s.id), ['r', 'e']);
  assert.equal(history.find((s) => s.id === 'e').effective, 'EXPIRED');
});

test('dashboard markup includes active and history session containers', () => {
  const htmlPath = fileURLToPath(new URL('../dashboard/index.html', import.meta.url));
  const html = readFileSync(htmlPath, 'utf8');
  assert.match(html, /chatgpt-sessions-active/);
  assert.match(html, /chatgpt-sessions-history/);
  assert.match(html, /Active ChatGPT Sessions/);
  assert.match(html, /Session History/);
  assert.doesNotMatch(html, /id="chatgpt-sessions"/);
});
