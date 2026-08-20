import { loadDotEnv } from '../src/relay/relayConfig.js';

loadDotEnv();
const apiUrl = (process.env.YZ_BRIDGE_FIREBASE_API_URL || '').replace(/\/$/, '');
const bearer = process.env.YZ_BRIDGE_API_TOKEN || '';
const chatgptKey = process.env.YZ_BRIDGE_CHATGPT_KEY || '';
const step = process.argv[2];
const extra = process.argv[3];

if (!apiUrl) {
  process.stderr.write('Missing YZ_BRIDGE_FIREBASE_API_URL\n');
  process.exit(2);
}

async function get(path, { includeKey = false, key = chatgptKey } = {}) {
  const url = includeKey
    ? `${apiUrl}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`
    : `${apiUrl}${path}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, raw: JSON.stringify(json) };
}

if (step === 'missing-key') {
  const result = await get('/chatgpt/enqueue?title=T&instructions=I');
  process.stdout.write(`${JSON.stringify({ step, httpStatus: result.status, code: result.json?.code || null, hasKeyField: result.json?.key !== undefined })}\n`);
  process.exit(result.status === 401 ? 0 : 1);
}

if (step === 'wrong-key') {
  const result = await get('/chatgpt/enqueue?title=T&instructions=I', { includeKey: true, key: 'wrong-key' });
  process.stdout.write(`${JSON.stringify({ step, httpStatus: result.status, code: result.json?.code || null })}\n`);
  process.exit(result.status === 401 ? 0 : 1);
}

if (step === 'bearer-status') {
  const res = await fetch(`${apiUrl}/status`, { headers: { authorization: `Bearer ${bearer}` } });
  const json = await res.json();
  process.stdout.write(`${JSON.stringify({ step, httpStatus: res.status, ok: json.ok === true, service: json.service || null })}\n`);
  process.exit(res.status === 200 && json.ok === true ? 0 : 1);
}

if (step === 'enqueue') {
  const requestId = extra || `chatgpt-get-e2e-${Date.now()}`;
  const params = new URLSearchParams({
    key: chatgptKey,
    title: 'YZ Bridge ChatGPT GET connectivity test',
    instructions: 'Return a connectivity confirmation only. Do not modify source code.',
    project: 'Rent_a_Car',
    priority: 'low',
    requestId,
  });
  const res = await fetch(`${apiUrl}/chatgpt/enqueue?${params.toString()}`);
  const json = await res.json();
  const raw = JSON.stringify(json);
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: res.status,
    ok: json.ok === true,
    taskId: json.taskId || null,
    status: json.status || null,
    leakedKey: raw.includes(chatgptKey),
  })}\n`);
  process.exit(res.status === 200 && json.ok === true && !raw.includes(chatgptKey) ? 0 : 1);
}

if (step === 'task') {
  const params = new URLSearchParams({ key: chatgptKey, id: extra });
  const res = await fetch(`${apiUrl}/chatgpt/task?${params.toString()}`);
  const json = await res.json();
  const raw = JSON.stringify(json);
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: res.status,
    ok: json.ok === true,
    taskId: json.task?.id || null,
    status: json.task?.status || null,
    resultSummary: json.task?.resultSummary || null,
    leakedKey: raw.includes(chatgptKey),
  })}\n`);
  process.exit(res.status === 200 && json.ok === true ? 0 : 1);
}

process.stderr.write(`Unknown step ${step}\n`);
process.exit(2);
