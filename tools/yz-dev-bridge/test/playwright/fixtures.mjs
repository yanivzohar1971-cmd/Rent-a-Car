import { test as base, expect } from '@playwright/test';
import { startIsolatedDashboard, seedManyTasks } from '../dashboardHarness.js';

export const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

export const test = base.extend({
  dashboard: async ({}, use) => {
    const ctx = await startIsolatedDashboard({
      setupStore: async (store) => {
        await seedManyTasks(store, { count: 36 });
      },
      heartbeatMs: 20_000,
      pollIntervalMs: 300,
    });
    await use(ctx);
    await ctx.close();
  },
});

export { expect };

export async function assertNoDocumentHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    // Ignore off-screen accessibility helpers; measure layout roots only.
    const main = document.getElementById('main');
    return {
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      mainScrollWidth: main ? main.scrollWidth : null,
      innerWidth: window.innerWidth,
    };
  });
  expect(metrics.scrollWidth, `document scrollWidth overflow: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.bodyScrollWidth, `body scrollWidth overflow: ${JSON.stringify(metrics)}`)
    .toBeLessThanOrEqual(metrics.innerWidth + 1);
  if (metrics.mainScrollWidth != null) {
    expect(metrics.mainScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  }
  return metrics;
}

export async function assertRightEdgeVisible(page) {
  const result = await page.evaluate(() => {
    const main = document.getElementById('main') || document.body;
    const rect = main.getBoundingClientRect();
    return {
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.right).toBeGreaterThan(0);
}

export async function assertTableInnerScroll(page) {
  const wrap = page.getByTestId('tasks-table-wrap');
  await expect(wrap).toBeVisible();
  const geometry = await wrap.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflowY: style.overflowY,
      maxHeight: style.maxHeight,
    };
  });
  expect(['auto', 'scroll', 'overlay']).toContain(geometry.overflowY);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  // Scroll inside the wrap without growing the page endlessly.
  const beforeDoc = await page.evaluate(() => document.documentElement.scrollHeight);
  await wrap.evaluate((el) => { el.scrollTop = Math.min(el.scrollHeight, 200); });
  const after = await wrap.evaluate((el) => el.scrollTop);
  expect(after).toBeGreaterThan(0);
  const afterDoc = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(afterDoc).toBeLessThanOrEqual(beforeDoc + 2);
  return geometry;
}
