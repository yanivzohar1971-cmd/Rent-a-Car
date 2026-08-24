import { loadDotEnv } from '../relay/relayConfig.js';
import { BridgeStore } from '../store.js';
import { parseBoolean } from './present.js';
import { createDashboardApp, listenDashboard, resolveDashboardBind } from './server.js';

loadDotEnv();

const host = resolveDashboardBind({
  host: process.env.YZ_BRIDGE_DASHBOARD_HOST || '127.0.0.1',
});
const port = Number(process.env.YZ_BRIDGE_DASHBOARD_PORT || 8787);
const autoStartRelay = parseBoolean(process.env.YZ_BRIDGE_DASHBOARD_AUTO_START_RELAY, true);
const debug = parseBoolean(process.env.YZ_BRIDGE_DASHBOARD_DEBUG, false);

const store = new BridgeStore(process.env.BRIDGE_DATA_FILE);
const app = createDashboardApp({
  store,
  host,
  port,
  debug,
  env: process.env,
});

const address = await listenDashboard(app, { host, port });
console.error(`YZ DEV BRIDGE — LIVE CONTROL CENTER`);
console.error(`Dashboard: http://${address.host}:${address.port}/`);
console.error(`SSE:       http://${address.host}:${address.port}/events`);
console.error(`Health:    http://${address.host}:${address.port}/health`);

if (autoStartRelay) {
  try {
    const started = app.supervisor.startRelay();
    console.error(`GitHub relay: ONLINE pid=${started.pid}`);
  } catch (error) {
    console.error(`GitHub relay: not started (${error.message})`);
  }
} else {
  console.error('GitHub relay: Supervisor ready (auto-start disabled)');
}

function shutdown(signal) {
  console.error(`YZ Dev Bridge Control Center received ${signal}; shutting down.`);
  void (async () => {
    try {
      await app.supervisor.stopRelay();
    } catch {
      // owned child only
    }
    await app.close();
    process.exit(0);
  })();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
