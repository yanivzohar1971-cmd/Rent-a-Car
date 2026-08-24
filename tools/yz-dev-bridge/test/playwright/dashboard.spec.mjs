import { test, expect, VIEWPORTS, assertNoDocumentHorizontalOverflow, assertRightEdgeVisible, assertTableInnerScroll } from './fixtures.mjs';

test.describe('YZ Dev Bridge Control Center — Playwright acceptance', () => {
  for (const vp of VIEWPORTS) {
    test(`layout @ ${vp.name} (${vp.width}x${vp.height}): no clipping / overflow`, async ({ page, dashboard }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('system-state')).toBeVisible();
      await expect(page.getByTestId('tasks-table')).toBeVisible();
      await assertNoDocumentHorizontalOverflow(page);
      await assertRightEdgeVisible(page);

      // RTL geometry check without redesigning the product UI.
      await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
      await page.waitForTimeout(50);
      await assertNoDocumentHorizontalOverflow(page);
      await assertRightEdgeVisible(page);
      const mainRight = await page.locator('#main').evaluate((el) => el.getBoundingClientRect().right);
      expect(mainRight).toBeLessThanOrEqual(vp.width + 1);
    });
  }

  test('task table has fixed scroll area for large lists', async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('filters')).toBeVisible();
    await assertTableInnerScroll(page);
    // Header/filters remain usable while table scrolls.
    await expect(page.getByTestId('filter-status')).toBeEnabled();
    const filterBox = await page.getByTestId('filters').boundingBox();
    expect(filterBox?.height || 0).toBeGreaterThan(0);
  });

  test('filters are clickable and change visible rows', async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });

    const status = page.getByTestId('filter-status');
    await expect(status).toBeVisible();
    // Prove clickability by interacting — not only hit-testing (labels may sit above native controls).
    await status.click();
    await status.selectOption('FAILED');
    await expect(status).toHaveValue('FAILED');

    const beforeAll = await page.locator('#tasks-table tbody tr').count();
    // Reset to ALL to capture baseline, then apply FAILED again for delta assertion.
    await status.selectOption('');
    await page.waitForTimeout(80);
    const beforeCount = await page.locator('#tasks-table tbody tr').count();
    expect(beforeCount).toBeGreaterThan(5);
    await status.selectOption('FAILED');
    await page.waitForTimeout(100);
    const failedCount = await page.locator('#tasks-table tbody tr').count();
    expect(failedCount).toBeGreaterThan(0);
    expect(failedCount).toBeLessThan(beforeCount);
    expect(beforeAll).toBeGreaterThan(0);

    await status.selectOption('');
    await page.getByTestId('filter-source').selectOption('mcp');
    await page.waitForTimeout(100);
    const mcpCount = await page.locator('#tasks-table tbody tr').count();
    expect(mcpCount).toBeGreaterThan(0);
    expect(mcpCount).toBeLessThanOrEqual(beforeCount);

    // Keyboard activation path for search filter using a visible row id.
    const firstId = await page.locator('#tasks-table tbody tr').first().getAttribute('data-task-id');
    expect(firstId).toBeTruthy();
    await page.getByTestId('filter-status').selectOption('');
    await page.getByTestId('filter-source').selectOption('');
    await page.getByTestId('filter-task').fill(firstId);
    await page.getByTestId('filter-task').press('Enter');
    await page.waitForTimeout(100);
    const idCount = await page.locator('#tasks-table tbody tr').count();
    expect(idCount).toBe(1);
  });

  test('SSE connects and filter state survives snapshot updates', async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sse-state')).toBeVisible();
    await expect.poll(async () => page.getByTestId('sse-state').innerText(), { timeout: 15_000 })
      .toMatch(/LIVE|CONNECTED|ONLINE|OK/i);

    await page.getByTestId('filter-status').selectOption('READY');
    await page.waitForTimeout(80);
    const readyBefore = await page.locator('#tasks-table tbody tr').count();
    expect(readyBefore).toBeGreaterThan(0);

    // Trigger authoritative refresh via store mutation + poll.
    const snap = await dashboard.store.readSnapshot();
    const readyTask = (snap.tasks || []).find((t) => t.status === 'READY');
    if (readyTask) {
      await dashboard.store.claimTask({ id: readyTask.id, actor: 'playwright' });
    }
    await dashboard.app.poll();
    await page.waitForTimeout(600);

    // Filter selection preserved; rows still reflect READY filter.
    await expect(page.getByTestId('filter-status')).toHaveValue('READY');
    const readyAfter = await page.locator('#tasks-table tbody tr').count();
    expect(readyAfter).toBeGreaterThan(0);

    // Soft reconnect: reload EventSource by navigating same page.
    await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.getByTestId('sse-state').innerText(), { timeout: 15_000 })
      .toMatch(/LIVE|CONNECTED|ONLINE|OK/i);
    await expect(page.getByTestId('tasks-table')).toBeVisible();
  });

  test('mobile controls remain accessible at 375', async ({ page, dashboard }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(dashboard.base, { waitUntil: 'domcontentloaded' });
    await assertNoDocumentHorizontalOverflow(page);
    const status = page.getByTestId('filter-status');
    await expect(status).toBeVisible();
    await status.selectOption('COMPLETED');
    await expect(status).toHaveValue('COMPLETED');
    const box = await status.boundingBox();
    expect(box?.width || 0).toBeGreaterThan(0);
    expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(375 + 1);
  });
});
