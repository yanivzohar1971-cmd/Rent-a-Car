import { loadDotEnv, loadRelayConfig, assertRelayConfig } from '../src/relay/relayConfig.js';

loadDotEnv();
const config = loadRelayConfig();
assertRelayConfig(config);

const step = process.argv[2] || 'status';
const extra = process.argv[3];

async function request(method, path, body, { token = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${config.token}`;
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

if (step === 'unauthorized') {
  const result = await request('GET', '/status', undefined, { token: false });
  process.stdout.write(`${JSON.stringify({ step, httpStatus: result.status, ok: result.json?.ok === true, code: result.json?.code || null })}\n`);
  process.exit(result.status === 401 ? 0 : 1);
}

if (step === 'list') {
  const qs = extra ? extra : 'project=Rent_a_Car&status=QUEUED';
  const result = await request('GET', `/tasks?${qs}`);
  const tasks = result.json?.tasks || [];
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: result.status,
    ok: result.json?.ok === true,
    count: tasks.length,
    tasks: tasks.map((task) => ({ id: task.id, status: task.status, title: task.title, claimedBy: task.claimedBy || null })),
  })}\n`);
  process.exit(result.status === 200 && result.json?.ok === true ? 0 : 1);
}

if (step === 'status') {
  const result = await request('GET', '/status');
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: result.status,
    ok: result.json?.ok === true,
    service: result.json?.service || null,
    executeLocalCommands: result.json?.executeLocalCommands,
    taskCount: result.json?.taskCount ?? null,
  })}\n`);
  process.exit(result.status === 200 && result.json?.ok === true ? 0 : 1);
}

if (step === 'create') {
  const result = await request('POST', '/tasks', {
    project: 'Rent_a_Car',
    title: 'YZ Bridge connectivity test',
    instructions: 'Return a connectivity confirmation only. Do not modify source code.',
    priority: 'low',
    source: 'setup-verification',
    requestId: extra || `yz-bridge-connectivity-${Date.now()}`,
  });
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: result.status,
    ok: result.json?.ok === true,
    taskId: result.json?.taskId || null,
    status: result.json?.status || null,
  })}\n`);
  process.exit(result.status === 201 && result.json?.ok === true ? 0 : 1);
}

if (step === 'get') {
  const result = await request('GET', `/task?id=${encodeURIComponent(extra)}`);
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: result.status,
    ok: result.json?.ok === true,
    taskId: result.json?.task?.id || null,
    status: result.json?.task?.status || null,
    resultSummary: result.json?.task?.resultSummary || null,
    claimedBy: result.json?.task?.claimedBy || null,
    source: result.json?.task?.source || null,
  })}\n`);
  process.exit(result.status === 200 && result.json?.ok === true ? 0 : 1);
}

if (step === 'result') {
  const result = await request('POST', `/task/${encodeURIComponent(extra)}/result`, {
    status: 'COMPLETED',
    resultSummary: 'Connectivity test archived after successful relay round-trip.',
    tests: ['firebase-relay-e2e'],
    actor: 'setup-verification',
  });
  process.stdout.write(`${JSON.stringify({
    step,
    httpStatus: result.status,
    ok: result.json?.ok === true,
    status: result.json?.status || result.json?.task?.status || null,
  })}\n`);
  process.exit(result.json?.ok === true ? 0 : 1);
}

process.stderr.write(`Unknown step: ${step}\n`);
process.exit(2);
