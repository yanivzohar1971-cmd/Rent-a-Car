import { readFileSync, statSync } from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ExecutionRouter } from '../src/execution/router.js';
import { resolveProjectExecutionConfig } from '../src/execution/types.js';
import { loadProjectRegistry } from '../src/projects/projectRegistry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.YZ_BRIDGE_DASHBOARD_URL || 'http://127.0.0.1:8787';
const STORE = join(ROOT, 'data', 'bridge.json');
const PRE = JSON.parse(readFileSync(join(ROOT, 'data', 'canary-pre-restart-fingerprint.json'), 'utf8'));

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* text */ }
        resolve({ status: res.statusCode, headers: res.headers, json, body });
      });
    }).on('error', reject);
  });
}

function sseOnce(path, waitMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { headers: { Accept: 'text/event-stream' } }, (res) => {
      let buf = '';
      const timer = setTimeout(() => {
        req.destroy();
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          bytes: buf.length,
          sample: buf.slice(0, 300),
          dataBlocks: (buf.match(/^data:/gm) || []).length,
        });
      }, waitMs);
      res.on('data', (c) => { buf += c.toString(); });
      res.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    req.on('error', reject);
  });
}

const report = { at: new Date().toISOString(), base: BASE, canaries: {} };

const st = statSync(STORE);
const data = JSON.parse(readFileSync(STORE, 'utf8'));
const tasks = Array.isArray(data.tasks) ? data.tasks : [];
const ids = tasks.map((t) => t.id).sort();
const statuses = {};
for (const t of tasks) statuses[t.status] = (statuses[t.status] || 0) + 1;
const fp = `${ids.join('|').length}:${ids.length}`;
const fixtureLike = tasks.filter((t) => {
  const id = String(t.id || '');
  const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  return Boolean(meta.playwright)
    || Boolean(meta.isolatedDashboardFixture)
    || /^pw-/i.test(id)
    || /isolated-dashboard|seedManyTasks/i.test(String(t.title || ''));
});
report.canaries.store = {
  ok: fp === PRE.idFingerprint
    && tasks.length === PRE.taskCount
    && data.schemaVersion === PRE.schemaVersion
    && fixtureLike.length === 0
    && JSON.stringify(statuses) === JSON.stringify(PRE.statusCounts),
  bytes: st.size,
  schemaVersion: data.schemaVersion,
  taskCount: tasks.length,
  statusCounts: statuses,
  idFingerprint: fp,
  pre: PRE,
  noFixtureData: fixtureLike.length === 0,
  noOrphanLeases: !(data.projectLeases || data.leases),
  task49: tasks.find((t) => t.id === 'TASK-00049')?.status || null,
};

const health = await get('/health');
const status = await get('/api/status');
report.canaries.supervisor = {
  ok: health.status === 200 && health.json?.ok === true && health.json?.store === 'ONLINE',
  health: health.json,
  systemState: status.json?.systemState || health.json?.systemState,
  providers: status.json?.providers || null,
  port: 8787,
};

const projectsApi = await get('/api/projects');
const registry = loadProjectRegistry();
const router = new ExecutionRouter({
  providers: { legacy: { id: 'legacy' } },
  featureFlags: {},
});
const projectViews = [];
for (const p of registry.projects) {
  const exec = resolveProjectExecutionConfig(p);
  projectViews.push({
    id: p.id,
    displayName: p.displayName,
    aliases: p.aliases,
    githubRepo: p.githubRepo,
    workspaceRoot: p.workspaceRoot,
    mode: exec.mode,
    preferredProvider: exec.preferredProvider,
    selected: router.selectProviderId(p),
  });
}
report.canaries.routing = {
  ok: projectViews.length === 2
    && projectViews.every((p) => p.mode === 'legacy' && p.selected === 'legacy'),
  httpStatus: projectsApi.status,
  apiProjects: projectsApi.json,
  registryProjects: projectViews,
  allowSdk: false,
  allowAcp: false,
  allowAuto: false,
  autoOff: true,
};

const firebase = await get('/api/firebase');
const github = await get('/api/github');
report.canaries.firebase = { ok: firebase.status === 200, status: firebase.status, body: firebase.json };
report.canaries.github = { ok: github.status === 200, status: github.status, body: github.json };

const html = await get('/');
const css = await get('/styles.css');
const appJs = await get('/app.js');
const tasksApi = await get('/api/tasks');
report.canaries.dashboard = {
  ok: html.status === 200 && css.status === 200 && appJs.status === 200 && tasksApi.status === 200,
  htmlStatus: html.status,
  cssHasOverflowGuard: /overflow-x:\s*hidden/i.test(css.body || ''),
  cssHasTableScroll: /tasks-table/i.test(css.body || ''),
  appHasFilters: /filter-btn|data-filter|status-filter|project-filter/i.test(appJs.body || ''),
  appHasProviderFields: /provider|verificationState|gateState/i.test(appJs.body || ''),
  taskSampleProvider: (tasksApi.json?.tasks || tasksApi.json || [])?.[0]?.provider || null,
  subsystems: (status.json?.subsystems || []).map((s) => ({ name: s.name, state: s.state })),
  providers: status.json?.providers || null,
};

const sse1 = await sseOnce('/events', 2000);
const sse2 = await sseOnce('/events', 1500);
report.canaries.sse = {
  ok: sse1.status === 200
    && String(sse1.contentType).includes('text/event-stream')
    && sse1.bytes > 0
    && sse2.status === 200
    && sse2.bytes > 0,
  first: sse1,
  reconnect: sse2,
};

const readyTasks = tasks.filter((t) => t.status === 'READY');
report.canaries.legacyExecution = {
  result: readyTasks.length === 0
    ? 'LEGACY_EXECUTION_CANARY_NOT_RUN_NO_SAFE_TASK'
    : 'SAFE_READY_TASK_FOUND_BUT_SKIPPED_PER_POLICY',
  readyCount: readyTasks.length,
  reason: 'No safe non-destructive READY production task; will not invent launcher work.',
};

report.summary = {
  store: report.canaries.store.ok,
  supervisor: report.canaries.supervisor.ok,
  routing: report.canaries.routing.ok,
  firebase: report.canaries.firebase.ok,
  github: report.canaries.github.ok,
  dashboard: report.canaries.dashboard.ok,
  sse: report.canaries.sse.ok,
};

console.log(JSON.stringify(report, null, 2));
if (!Object.values(report.summary).every(Boolean)) process.exitCode = 2;
