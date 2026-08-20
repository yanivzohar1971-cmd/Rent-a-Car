import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createBridgeServer } from './server.js';

const host = process.env.BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.BRIDGE_PORT || 8787);
const authToken = process.env.BRIDGE_AUTH_TOKEN || '';
const allowUnauthenticatedRemote = process.env.BRIDGE_ALLOW_UNAUTHENTICATED_REMOTE === 'true';
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

if (!loopbackHosts.has(host) && !authToken && !allowUnauthenticatedRemote) {
  throw new Error('Refusing unauthenticated non-loopback bind. Set BRIDGE_AUTH_TOKEN or explicitly set BRIDGE_ALLOW_UNAUTHENTICATED_REMOTE=true.');
}

function secureEquals(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isAuthorized(req) {
  if (!authToken) return true;
  const header = req.headers.authorization || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;
  return secureEquals(header.slice(prefix.length), authToken);
}

const handler = createMcpHandler(() => createBridgeServer());
const nodeHandler = toNodeHandler(handler);

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, name: 'YZ Dev Bridge', mcp: '/mcp' }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (!isAuthorized(req)) {
    res.writeHead(401, {
      'content-type': 'application/json; charset=utf-8',
      'www-authenticate': 'Bearer realm="yz-dev-bridge"',
    });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  void nodeHandler(req, res);
});

function shutdown(signal) {
  console.error(`YZ Dev Bridge received ${signal}; shutting down.`);
  httpServer.close(async () => {
    await handler.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(port, host, () => {
  console.error(`YZ Dev Bridge HTTP listening on http://${host}:${port}/mcp`);
  console.error(`Health endpoint: http://${host}:${port}/health`);
});
