import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { applyTaskFilters } from '../src/dashboard/present.js';
import { getJson, withDashboard } from './dashboardHarness.js';

test('dashboard HTML loads LIVE CONTROL CENTER and key regions', async () => {
  const htmlPath = fileURLToPath(new URL('../dashboard/index.html', import.meta.url));
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /YZ DEV BRIDGE/);
  assert.match(html, /LIVE CONTROL CENTER/);
  assert.match(html, /data-testid="system-state"/);
  assert.match(html, /data-testid="projects"/);
  assert.match(html, /data-testid="tasks-table"/);
  assert.match(html, /data-testid="sse-state"/);
  assert.match(html, /data-testid="drawer"/);
  assert.match(html, /data-testid="filters"/);
  assert.doesNotMatch(html, /cdn\.|fonts\.google/i);

  await withDashboard(async ({ base }) => {
    const res = await fetch(`${base}/`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /LIVE CONTROL CENTER/);
    const css = await fetch(`${base}/styles.css`);
    assert.equal(css.status, 200);
    const js = await fetch(`${base}/app.js`);
    assert.equal(js.status, 200);

    const status = await getJson(base, '/api/status');
    assert.ok(status.body.systemState);
    const projects = await getJson(base, '/api/projects');
    assert.ok(Array.isArray(projects.body.projects));
    const tasks = await getJson(base, '/api/tasks');
    assert.ok(Array.isArray(tasks.body.tasks));
  });
});

test('recent task filters match project, status, source, id, and issue', () => {
  const tasks = [
    { taskId: 'TASK-00001', projectId: 'rent-a-car', status: 'READY', source: 'github-inbox', githubIssueNumber: '12', title: 'Alpha', createdAt: '2026-08-20T10:00:00.000Z' },
    { taskId: 'TASK-00002', projectId: 'glasses', status: 'COMPLETED', source: 'mcp', githubIssueNumber: '3', title: 'Beta', createdAt: '2026-08-20T11:00:00.000Z' },
  ];
  assert.equal(applyTaskFilters(tasks, { project: 'glasses' })[0].taskId, 'TASK-00002');
  assert.equal(applyTaskFilters(tasks, { status: 'READY' })[0].taskId, 'TASK-00001');
  assert.equal(applyTaskFilters(tasks, { source: 'mcp' })[0].taskId, 'TASK-00002');
  assert.equal(applyTaskFilters(tasks, { taskId: '00001' })[0].taskId, 'TASK-00001');
  assert.equal(applyTaskFilters(tasks, { githubIssue: '12' })[0].taskId, 'TASK-00001');
});
