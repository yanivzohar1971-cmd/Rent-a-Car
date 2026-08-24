import { test, expect, VIEWPORTS, assertNoDocumentHorizontalOverflow, assertRightEdgeVisible } from './fixtures.mjs';
import { createMockChatGptHandoffService, startIsolatedDashboard, seedManyTasks } from '../dashboardHarness.js';

async function openHandoffDashboard(browser, seedFn) {
  const mock = createMockChatGptHandoffService();
  if (typeof seedFn === 'function') seedFn(mock);
  const ctx = await startIsolatedDashboard({
    chatgptHandoffService: mock,
    setupStore: async (store) => { await seedManyTasks(store, { count: 8 }); },
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${ctx.base}/`);
  await expect(page.getByTestId('chatgpt-handoff-panel')).toBeVisible();
  // Wait for session refresh
  await page.waitForTimeout(200);
  return { page, ctx, mock };
}

test.describe('ChatGPT Handoff Control Center', () => {
  test('handoff card create/copy without leaking secrets', async ({ page, dashboard }) => {
    await page.goto(dashboard.base + '/');
    await expect(page.getByTestId('chatgpt-handoff-panel')).toBeVisible();
    await expect(page.getByTestId('chatgpt-handoff-help')).toContainText('Create a ChatGPT Handoff');

    await page.getByTestId('handoff-duration').selectOption('1h');
    await page.getByTestId('btn-create-handoff').click();
    await expect(page.getByTestId('handoff-result')).toBeVisible();
    await expect(page.getByTestId('handoff-ready-title')).toHaveText('ChatGPT Handoff Ready');
    await expect(page.getByTestId('handoff-meta')).toContainText('1 hour');

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('btn-copy-handoff').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('/chatgpt/bootstrap?code=');
    expect(copied.toLowerCase()).not.toContain('bearer');
    expect(copied).not.toContain('YZ_BRIDGE_API_TOKEN');
    expect(copied).not.toContain('YZ_BRIDGE_CHATGPT_KEY');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('YZ_BRIDGE_API_TOKEN');
    expect(bodyText).not.toContain('YZ_BRIDGE_CHATGPT_KEY');
  });

  test('unavailable handoff service renders friendly error', async ({ browser }) => {
    const mock = createMockChatGptHandoffService({ configured: false });
    const ctx = await startIsolatedDashboard({
      chatgptHandoffService: mock,
      setupStore: async () => {},
    });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    try {
      await page.goto(ctx.base + '/');
      await page.getByTestId('btn-create-handoff').click();
      await expect(page.getByTestId('handoff-error')).toBeVisible();
      await expect(page.getByTestId('handoff-error')).toContainText('not configured');
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  test('active vs history classification and action buttons', async ({ browser }) => {
    const { page, ctx } = await openHandoffDashboard(browser, (mock) => {
      mock.seedSession({
        id: 'sess-active',
        status: 'ACTIVE',
        label: 'live-active',
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      });
      mock.seedSession({
        id: 'sess-revoked',
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        label: 'TASK-00050-live-smoke',
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      });
      mock.seedSession({
        id: 'sess-expired',
        status: 'ACTIVE',
        label: 'stale-expired',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
    });
    try {
      await expect(page.getByTestId('chatgpt-sessions-active').getByTestId('session-card-active')).toHaveCount(1);
      await expect(page.getByTestId('chatgpt-sessions-active')).toContainText('live-active');
      await expect(page.getByTestId('chatgpt-sessions-active')).not.toContainText('TASK-00050-live-smoke');
      await expect(page.getByTestId('chatgpt-sessions-active')).not.toContainText('stale-expired');

      await expect(page.getByTestId('chatgpt-sessions-history').getByTestId('session-card-history')).toHaveCount(2);
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('REVOKED');
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('EXPIRED');
      await expect(page.getByTestId('chatgpt-sessions-history')).not.toContainText('live-active');

      await expect(page.getByTestId('chatgpt-sessions-active').getByTestId('btn-revoke-session')).toHaveCount(1);
      await expect(page.getByTestId('chatgpt-sessions-history').locator('.btn-revoke-session')).toHaveCount(0);
      await expect(page.getByTestId('btn-revoke-all-sessions')).toBeVisible();
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  test('empty active state with history only hides Revoke All', async ({ browser }) => {
    const { page, ctx } = await openHandoffDashboard(browser, (mock) => {
      mock.seedSession({
        id: 'hist-1',
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        label: 'route-debug',
      });
      mock.seedSession({
        id: 'hist-2',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 120_000).toISOString(),
        label: 'old-expired',
      });
    });
    try {
      await expect(page.getByTestId('sessions-active-empty')).toHaveText('No active temporary sessions');
      await expect(page.getByTestId('btn-revoke-all-sessions')).toBeHidden();
      await expect(page.getByTestId('chatgpt-sessions-history').getByTestId('session-card-history')).toHaveCount(2);
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('route-debug');
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  test('revoke moves session from active to history', async ({ browser }) => {
    const { page, ctx } = await openHandoffDashboard(browser, (mock) => {
      mock.seedSession({ id: 'to-revoke', status: 'ACTIVE', label: 'revoke-me' });
      mock.seedSession({
        id: 'already-revoked',
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        label: 'keep-history',
      });
    });
    try {
      await expect(page.getByTestId('chatgpt-sessions-active').getByTestId('session-card-active')).toHaveCount(1);
      await page.getByTestId('btn-revoke-session').click();
      await expect(page.getByTestId('sessions-active-empty')).toBeVisible();
      await expect(page.getByTestId('btn-revoke-all-sessions')).toBeHidden();
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('revoke-me');
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('REVOKED');
      await expect(page.getByTestId('chatgpt-sessions-history').locator('.btn-revoke-session')).toHaveCount(0);
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  test('revoke-all only affects active sessions', async ({ browser }) => {
    const { page, ctx } = await openHandoffDashboard(browser, (mock) => {
      mock.seedSession({ id: 'a1', status: 'ACTIVE', label: 'active-one' });
      mock.seedSession({ id: 'a2', status: 'ACTIVE', label: 'active-two' });
      mock.seedSession({
        id: 'h1',
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        label: 'history-kept',
      });
    });
    try {
      await expect(page.getByTestId('btn-revoke-all-sessions')).toBeVisible();
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByTestId('btn-revoke-all-sessions').click();
      await expect(page.getByTestId('sessions-active-empty')).toBeVisible();
      await expect(page.getByTestId('btn-revoke-all-sessions')).toBeHidden();
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('active-one');
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('active-two');
      await expect(page.getByTestId('chatgpt-sessions-history')).toContainText('history-kept');
      await expect(page.getByTestId('chatgpt-sessions-history').getByTestId('session-card-history')).toHaveCount(3);
    } finally {
      await page.close();
      await ctx.close();
    }
  });

  for (const vp of VIEWPORTS) {
    test(`handoff layout @ ${vp.name} (${vp.width}x${vp.height})`, async ({ page, dashboard }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(dashboard.base + '/');
      await expect(page.getByTestId('chatgpt-handoff-panel')).toBeVisible();
      await expect(page.getByTestId('btn-create-handoff')).toBeEnabled();
      await assertNoDocumentHorizontalOverflow(page);
      await assertRightEdgeVisible(page);
      await page.evaluate(() => { document.documentElement.setAttribute('dir', 'rtl'); });
      await assertNoDocumentHorizontalOverflow(page);
      await assertRightEdgeVisible(page);
      await page.evaluate(() => { document.documentElement.removeAttribute('dir'); });
    });
  }
});
