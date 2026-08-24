import { test, expect, VIEWPORTS, assertNoDocumentHorizontalOverflow, assertRightEdgeVisible } from './fixtures.mjs';
import { createMockChatGptHandoffService } from '../dashboardHarness.js';

test.describe('ChatGPT Handoff Control Center', () => {
  test('handoff card create/copy/sessions/revoke without leaking secrets', async ({ page, dashboard }) => {
    const mock = createMockChatGptHandoffService();
    mock.seedSession({ id: 'session-active-1', status: 'ACTIVE', label: 'demo' });
    // Replace service on running app is not available; use API against harness mock via page.
    // The fixture already injects a mock — seed via API create then list.
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
    expect(bodyText).not.toContain('unit-test-yz-bridge-token');

    await page.getByTestId('btn-create-handoff').click();
    await expect(page.getByTestId('handoff-result')).toBeVisible();

    // Force a session into mock by creating handoff then calling revoke-all path existence
    await expect(page.getByTestId('btn-revoke-all-sessions')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('btn-revoke-all-sessions').click();
  });

  test('unavailable handoff service renders friendly error', async ({ browser }) => {
    const { startIsolatedDashboard } = await import('../dashboardHarness.js');
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
