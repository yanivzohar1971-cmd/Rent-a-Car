import { loadDotEnv } from '../src/relay/relayConfig.js';

loadDotEnv();

const LOCAL = 'http://127.0.0.1:8787';
const created = await fetch(`${LOCAL}/api/chatgpt-handoff`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ duration: '1h', label: 'route-debug' }),
}).then((r) => r.json());

const url = created.bootstrapUrl;
if (!url) {
  console.log(JSON.stringify({ error: 'no bootstrapUrl', created: { ok: created.ok, code: created.code, error: created.error } }));
  process.exit(2);
}

const u = new URL(url);
const code = u.searchParams.get('code') || '';
console.log(JSON.stringify({
  ok: created.ok,
  origin: u.origin,
  pathname: u.pathname,
  codeLen: code.length,
}, null, 2));

function scrub(text) {
  return String(text || '')
    .replaceAll(code, '<code>')
    .replace(/"sessionKey"\s*:\s*"[^"]+"/g, '"sessionKey":"<redacted>"')
    .replace(/key=[^&\s"']+/gi, 'key=<redacted>')
    .slice(0, 240);
}

const r1 = await fetch(url);
console.log('asReturned', r1.status, scrub(await r1.text()));

const key = process.env.YZ_BRIDGE_CHATGPT_KEY;
if (key) {
  const r2 = await fetch(`${u.origin}/yzBridgeApi/chatgpt/task?id=TASK-DOES-NOT-EXIST&key=${encodeURIComponent(key)}`);
  console.log('knownRouteShape', r2.status, scrub(await r2.text()).replaceAll(key, '<key>'));
}

const r3 = await fetch(`${u.origin}/yzBridgeApi/chatgpt/bootstrap?code=${encodeURIComponent(code)}`);
console.log('explicitBootstrap', r3.status, scrub(await r3.text()));

// Cloud Functions sometimes needs trailing path without double prefix
const r4 = await fetch(`${u.origin}/yzBridgeApi/chatgpt/bootstrap/?code=${encodeURIComponent(code)}`);
console.log('explicitBootstrapSlash', r4.status, scrub(await r4.text()));
