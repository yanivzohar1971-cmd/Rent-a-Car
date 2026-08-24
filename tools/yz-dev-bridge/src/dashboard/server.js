import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeStore } from '../store.js';
import { applyTaskFilters, parseBoolean } from './present.js';
import { EventHub } from './events.js';
import { buildDashboardSnapshot, compactSsePayload, diffActivity, presentTaskDetail, summarizeTask } from './snapshot.js';
import { DashboardSupervisor, RelaySupervisorError } from './supervisor.js';
import { readRelayRuntimeStatus, relayRuntimePathForStore } from '../github/relayRuntimeStatus.js';
import { createChatGptHandoffService, userFacingHandoffError } from './chatgptHandoff.js';
import { sanitizeText } from './sanitize.js';

const DEFAULT_STATIC_DIR = resolve(fileURLToPath(new URL('../../dashboard', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function resolveDashboardBind({
  host = process.env.YZ_BRIDGE_DASHBOARD_HOST || '127.0.0.1',
  allowRemote = process.env.YZ_BRIDGE_DASHBOARD_ALLOW_REMOTE,
} = {}) {
  const bindHost = String(host || '127.0.0.1').trim() || '127.0.0.1';
  const remoteOk = parseBoolean(allowRemote, false);
  if (!LOOPBACK.has(bindHost) && bindHost !== '::1' && !remoteOk) {
    throw new Error('Refusing non-loopback dashboard bind. Set YZ_BRIDGE_DASHBOARD_ALLOW_REMOTE=true only if you understand the risk.');
  }
  return bindHost;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readJsonBody(req, { limit = 64_000 } = {}) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { code: 'INVALID_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

function isDebugRequest(url, options) {
  if (parseBoolean(url.searchParams.get('debug'), false)) return true;
  return Boolean(options.debug);
}

function safeStaticPath(staticDir, pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const abs = resolve(staticDir, `.${decoded}`);
  const rel = relative(staticDir, abs);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || normalize(rel).startsWith('..')) return null;
  if (!abs.startsWith(staticDir)) return null;
  return abs;
}

export function createDashboardApp(options = {}) {
  const store = options.store || new BridgeStore(options.dataFile);
  const startedAt = options.startedAt || new Date().toISOString();
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 8787);
  const staticDir = options.staticDir || DEFAULT_STATIC_DIR;
  const debugDefault = Boolean(options.debug);
  const supervisor = options.supervisor || new DashboardSupervisor({
    store,
    relayScript: options.relayScript,
    env: options.env || process.env,
    spawnImpl: options.spawnImpl,
  });
  const events = options.events || new EventHub({
    limit: options.eventLimit || 200,
    heartbeatMs: options.heartbeatMs || 15_000,
  });
  const pollIntervalMs = Math.max(250, Number(options.pollIntervalMs) || 1000);
  const watchStore = options.watchStore !== false;
  const chatgptHandoff = options.chatgptHandoffService
    || createChatGptHandoffService({ env: options.env || process.env });

  let previousTasks = [];
  let pollTimer = null;
  let closed = false;
  let lastRelayFingerprint = '';
  let primed = false;
  let pollChain = Promise.resolve();
  const errors = [];

  supervisor.onInfrastructureEvent = (event) => {
    const safe = {
      type: event.type || 'RELAY_ERROR',
      taskId: event.taskId || null,
      projectId: event.projectId || null,
      message: event.message || 'infrastructure event',
    };
    errors.push({ at: new Date().toISOString(), ...safe });
    if (errors.length > 80) errors.splice(0, errors.length - 80);
    events.emit('health', safe);
    events.emit('event', safe);
  };

  async function snapshot(debug = debugDefault) {
    return buildDashboardSnapshot({
      store,
      supervisor,
      debug,
      startedAt,
      host,
      port,
      now: Date.now(),
    });
  }

  function poll() {
    const run = async () => {
    if (closed) return;
    try {
      await supervisor.maybeRunPendingRestart();
      const state = await store.readSnapshot();
      const nextTasks = Array.isArray(state.tasks) ? state.tasks : [];
      const relay = supervisor.status();
      const relayFingerprint = JSON.stringify(relay);
      if (!primed) {
        previousTasks = nextTasks;
        lastRelayFingerprint = relayFingerprint;
        primed = true;
        return;
      }
      const activity = diffActivity(previousTasks, nextTasks);
      previousTasks = nextTasks;
      const relayChanged = relayFingerprint !== lastRelayFingerprint;
      lastRelayFingerprint = relayFingerprint;
      for (const item of activity) {
        events.emit('event', item);
        if (item.type.startsWith('TASK') || item.type === 'RESULT_POSTED' || item.type === 'ISSUE_CLOSED') {
          events.emit('task', item);
        }
        if (item.type.includes('AGENT')) events.emit('agent', item);
      }
      if (activity.length || relayChanged) {
        const live = compactSsePayload(await snapshot(false));
        events.emit('status', {
          stats: live.stats,
          relay: live.relay,
          systemState: live.systemState,
          subsystems: live.subsystems,
          github: live.github,
        });
        events.emit('stats', live.stats);
        events.emit('projects', { projects: live.projects });
        events.emit('relay', live.relay);
        events.emit('state', live);
      }
    } catch (error) {
      events.emit('health', {
        type: 'STORE_RETRY',
        message: String(error?.message || error).slice(0, 180),
      });
    }
    };
    const next = pollChain.then(run, run);
    pollChain = next.then(() => undefined, () => undefined);
    return next;
  }

  function startPolling() {
    events.start();
    if (pollTimer) return;
    void poll();
    pollTimer = setInterval(() => {
      void poll();
    }, pollIntervalMs);
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    events.stop();
  }

  async function handleApi(req, res, url) {
    const debug = isDebugRequest(url, { debug: debugDefault });
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const data = await snapshot(debug);
      return sendJson(res, 200, {
        name: data.name,
        subtitle: data.subtitle,
        version: data.version,
        build: data.build,
        systemState: data.systemState,
        uptimeMs: data.uptimeMs,
        startedAt: data.startedAt,
        now: data.now,
        host: data.host,
        port: data.port,
        relay: data.relay,
        store: data.store,
        agents: { activeCount: data.stats.activeAgents },
        projects: { count: data.projects.length, activeCount: data.stats.activeProjects },
        subsystems: data.subsystems,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      const data = await snapshot(debug);
      return sendJson(res, 200, data.stats);
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const data = await snapshot(debug);
      return sendJson(res, 200, { projects: data.projects });
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      const data = await snapshot(debug);
      return sendJson(res, 200, { agents: data.agents });
    }

    if (req.method === 'GET' && url.pathname === '/api/github') {
      const data = await snapshot(debug);
      return sendJson(res, 200, data.github);
    }

    if (req.method === 'GET' && url.pathname === '/api/firebase') {
      const data = await snapshot(debug);
      return sendJson(res, 200, data.firebase);
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const data = await snapshot(false);
      return sendJson(res, 200, {
        ok: true,
        name: 'YZ Dev Bridge',
        dashboard: true,
        systemState: data.systemState,
        relay: data.relay.state,
        store: data.store.state,
        errors: errors.slice(-20),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const limit = Number(url.searchParams.get('limit') || 50);
      return sendJson(res, 200, {
        events: events.recent({ limit }),
        errors: errors.slice(-limit),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      const state = await store.readSnapshot();
      const runtime = await readRelayRuntimeStatus(relayRuntimePathForStore(store.filePath));
      const now = Date.now();
      const summarized = (state.tasks || [])
        .map((task) => summarizeTask(task, {
          debug,
          now,
          openIssueNumbersByRepo: runtime?.openIssueNumbersByRepo || null,
          openIssuesKnown: Boolean(runtime?.openIssueNumbersByRepo),
        }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const filtered = applyTaskFilters(summarized, {
        project: url.searchParams.get('project'),
        status: url.searchParams.get('status'),
        source: url.searchParams.get('source'),
        taskId: url.searchParams.get('taskId') || url.searchParams.get('q'),
        githubIssue: url.searchParams.get('githubIssue'),
        since: url.searchParams.get('since'),
        until: url.searchParams.get('until'),
      });
      const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 40), 100));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      return sendJson(res, 200, {
        tasks: filtered.slice(offset, offset + limit),
        total: filtered.length,
        limit,
        offset,
        bounded: true,
      });
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'tasks' && parts[2]) {
      const task = await store.getTask(parts[2]);
      if (!task) return sendJson(res, 404, { error: 'Task not found', taskId: parts[2] });
      const runtime = await readRelayRuntimeStatus(relayRuntimePathForStore(store.filePath));
      const detail = presentTaskDetail(task, {
        debug,
        now: Date.now(),
        openIssueNumbersByRepo: runtime?.openIssueNumbersByRepo || null,
        openIssuesKnown: Boolean(runtime?.openIssueNumbersByRepo),
      });
      return sendJson(res, 200, { task: detail });
    }

    if (req.method === 'POST' && url.pathname === '/api/relay/start') {
      try {
        const result = supervisor.startRelay();
        events.emit('relay', result);
        return sendJson(res, 200, result);
      } catch (error) {
        const status = error instanceof RelaySupervisorError && error.code === 'RELAY_ALREADY_RUNNING' ? 409 : 400;
        return sendJson(res, status, { error: error.message, code: error.code || 'RELAY_START_FAILED' });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/relay/stop') {
      const result = await supervisor.stopRelay();
      events.emit('relay', result);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/relay/restart-after-current-task') {
      const result = await supervisor.restartRelay({ afterCurrentTask: true });
      events.emit('relay', result);
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/relay/restart') {
      if (await supervisor.hasActiveAgentTask()) {
        return sendJson(res, 409, {
          error: 'An agent task is active. Use RESTART AFTER CURRENT TASK.',
          code: 'TASK_ACTIVE',
          suggest: 'restart-after-current-task',
        });
      }
      const result = await supervisor.restartRelay({ afterCurrentTask: false });
      events.emit('relay', result);
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/chatgpt-handoff/status') {
      return sendJson(res, 200, {
        ok: true,
        ...chatgptHandoff.configSummary(),
        durations: [
          { id: '1h', label: '1 hour', seconds: 3600 },
          { id: '24h', label: '24 hours', seconds: 86400 },
          { id: '7d', label: '7 days', seconds: 604800 },
        ],
        defaultDuration: '24h',
        bootstrapTtlSeconds: 600,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt-handoff') {
      try {
        const body = await readJsonBody(req);
        const created = await chatgptHandoff.createHandoff({
          durationPreset: body.duration || body.durationPreset || '24h',
          label: body.label || null,
        });
        return sendJson(res, 201, {
          ok: true,
          bootstrapUrl: created.bootstrapUrl,
          expiresAt: created.expiresAt,
          expiresInSeconds: created.expiresInSeconds,
          requestedSessionDurationSeconds: created.requestedSessionDurationSeconds,
          label: created.label || null,
          handoffId: created.handoffId,
        });
      } catch (error) {
        const facing = userFacingHandoffError(error);
        return sendJson(res, error.status || (error.code === 'not_configured' ? 503 : 502), {
          ok: false,
          error: facing.message,
          detail: sanitizeText(facing.detail || '', { debug: false }),
          code: error.code || 'HANDOFF_CREATE_FAILED',
        });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/chatgpt-sessions') {
      try {
        const listed = await chatgptHandoff.listSessions();
        return sendJson(res, 200, {
          ok: true,
          sessions: Array.isArray(listed?.sessions) ? listed.sessions : [],
        });
      } catch (error) {
        const facing = userFacingHandoffError(error);
        return sendJson(res, error.status || (error.code === 'not_configured' ? 503 : 502), {
          ok: false,
          error: facing.message,
          detail: sanitizeText(facing.detail || '', { debug: false }),
          code: error.code || 'SESSION_LIST_FAILED',
          sessions: [],
        });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/chatgpt-sessions/revoke-all') {
      try {
        const result = await chatgptHandoff.revokeAllSessions();
        return sendJson(res, 200, { ok: true, revoked: result.revoked || 0 });
      } catch (error) {
        const facing = userFacingHandoffError(error);
        return sendJson(res, error.status || (error.code === 'not_configured' ? 503 : 502), {
          ok: false,
          error: facing.message,
          detail: sanitizeText(facing.detail || '', { debug: false }),
          code: error.code || 'SESSION_REVOKE_ALL_FAILED',
        });
      }
    }

    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'chatgpt-sessions' && parts[2] && parts[3] === 'revoke') {
      try {
        const result = await chatgptHandoff.revokeSession(parts[2]);
        return sendJson(res, 200, { ok: true, session: result.session || null });
      } catch (error) {
        const facing = userFacingHandoffError(error);
        return sendJson(res, error.status || (error.code === 'not_configured' ? 503 : 502), {
          ok: false,
          error: facing.message,
          detail: sanitizeText(facing.detail || '', { debug: false }),
          code: error.code || 'SESSION_REVOKE_FAILED',
        });
      }
    }

    return sendJson(res, 404, { error: 'Not found' });
  }

  function serveStatic(req, res, url) {
    const filePath = safeStaticPath(staticDir, url.pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      if (url.pathname === '/' || !extname(url.pathname)) {
        const index = join(staticDir, 'index.html');
        if (existsSync(index)) return streamFile(res, index);
      }
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    streamFile(res, filePath);
  }

  function streamFile(res, filePath) {
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    createReadStream(filePath).pipe(res);
  }

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && (url.pathname === '/events' || url.pathname === '/api/stream')) {
      const client = events.subscribe(res);
      void snapshot(false)
        .then((data) => {
          events.push(client, 'snapshot', compactSsePayload(data));
        })
        .catch(() => {
          events.push(client, 'snapshot', { systemState: 'UNKNOWN' });
        });
      return;
    }
    if (url.pathname === '/health') {
      void handleApi(req, res, new URL('/api/health', url.origin));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      void handleApi(req, res, url).catch((error) => {
        sendJson(res, 500, { error: 'Dashboard API failed', code: 'DASHBOARD_API' });
        void error;
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    serveStatic(req, res, url);
  });

  return {
    httpServer,
    store,
    supervisor,
    events,
    snapshot,
    startPolling,
    stopPolling,
    poll,
    watchStore,
    get previousTaskCount() {
      return previousTasks.length;
    },
    async close() {
      closed = true;
      stopPolling();
      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
      await new Promise((resolvePromise) => httpServer.close(() => resolvePromise()));
    },
  };
}

export function listenDashboard(app, {
  host = '127.0.0.1',
  port = 8787,
} = {}) {
  const bindHost = resolveDashboardBind({ host });
  const bindPort = Number(port);
  return new Promise((resolvePromise, rejectPromise) => {
    app.httpServer.once('error', rejectPromise);
    app.httpServer.listen(bindPort, bindHost, () => {
      app.httpServer.removeListener('error', rejectPromise);
      app.startPolling();
      const address = app.httpServer.address();
      resolvePromise({
        host: bindHost,
        port: typeof address === 'object' && address ? address.port : bindPort,
      });
    });
  });
}
