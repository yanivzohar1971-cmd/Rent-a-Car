import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockChatGptHandoffService, withDashboard } from './dashboardHarness.js';

test('dashboard chatgpt handoff API never returns bearer/permanent secrets', async () => {
  const mock = createMockChatGptHandoffService();
  mock.seedSession({ id: 's1', status: 'ACTIVE' });
  await withDashboard(async ({ base }) => {
    const status = await fetch(`${base}/api/chatgpt-handoff/status`).then((r) => r.json());
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes('Bearer'), false);

    const created = await fetch(`${base}/api/chatgpt-handoff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration: '24h' }),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
    assert.equal(created.status, 201);
    assert.ok(created.json.bootstrapUrl.includes('/chatgpt/bootstrap?code='));
    assert.equal(JSON.stringify(created.json).includes('YZ_BRIDGE_API_TOKEN'), false);
    assert.equal(JSON.stringify(created.json).includes('YZ_BRIDGE_CHATGPT_KEY'), false);

    const sessions = await fetch(`${base}/api/chatgpt-sessions`).then((r) => r.json());
    assert.equal(sessions.ok, true);
    assert.ok(sessions.sessions.some((s) => s.id === 's1'));
    assert.equal(JSON.stringify(sessions).includes('sessionKey'), false);

    const revoked = await fetch(`${base}/api/chatgpt-sessions/s1/revoke`, { method: 'POST' })
      .then((r) => r.json());
    assert.equal(revoked.ok, true);
    assert.equal(revoked.session.status, 'REVOKED');
  }, {
    chatgptHandoffService: mock,
  });
});

test('dashboard reports friendly not-configured status', async () => {
  const mock = createMockChatGptHandoffService({ configured: false });
  await withDashboard(async ({ base }) => {
    const created = await fetch(`${base}/api/chatgpt-handoff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration: '24h' }),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));
    assert.equal(created.status, 503);
    assert.match(created.json.error, /not configured/i);
  }, {
    chatgptHandoffService: mock,
  });
});
