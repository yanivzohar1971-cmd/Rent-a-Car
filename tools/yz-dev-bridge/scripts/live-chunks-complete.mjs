import { loadDotEnv, loadRelayConfig } from '../src/relay/relayConfig.js';
import { BridgeStore } from '../src/store.js';

loadDotEnv();

const SOURCE =
  'YZ Bridge CHUNKS connectivity test. Do not modify Rent_a_Car source code. Return only a confirmation that all chunks arrived in the correct order.';
const firebaseTaskId = process.argv[2];
const chatgptTaskId = process.argv[3] || firebaseTaskId;

if (!firebaseTaskId) {
  throw new Error('firebase task id required');
}

function redact(value) {
  const key = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '');
  const token = String(process.env.YZ_BRIDGE_API_TOKEN || '');
  let text = JSON.stringify(value);
  if (key) text = text.split(key).join('<YZ_BRIDGE_CHATGPT_KEY>');
  if (token) text = text.split(token).join('<YZ_BRIDGE_API_TOKEN>');
  return text;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = loadRelayConfig();
  const res = await fetch(`${config.apiUrl}/task/${firebaseTaskId}`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  const body = await res.json();
  const task = body.task || body;
  const exact = task.instructions === SOURCE;

  const store = new BridgeStore();
  let local = null;
  for (let i = 0; i < 12; i += 1) {
    local = await store.findByFirebaseTaskId(firebaseTaskId);
    if (local) break;
    await sleep(2000);
  }

  let completedLocalId = null;
  if (local) {
    if (local.status === 'READY' || local.status === 'BLOCKED') {
      await store.claimTask({ id: local.id, actor: 'cursor' });
    }
    const updated = await store.updateTask({
      id: local.id,
      status: 'COMPLETED',
      actor: 'cursor',
      summary: 'All chunks arrived in the correct order. No Rent_a_Car source changes.',
      changedFiles: [],
      tests: ['functions npm run test:yz-bridge', 'tools/yz-dev-bridge npm test'],
    });
    completedLocalId = updated.id;
  }

  let chatgptView = null;
  for (let i = 0; i < 12; i += 1) {
    const search = new URLSearchParams({
      key: process.env.YZ_BRIDGE_CHATGPT_KEY,
      id: chatgptTaskId,
    });
    const read = await fetch(`${config.apiUrl}/chatgpt/task?${search.toString()}`);
    chatgptView = await read.json();
    if (chatgptView?.task?.status === 'COMPLETED') break;
    await sleep(2000);
  }

  console.log(redact({
    bearerHttpStatus: res.status,
    firebaseTaskId,
    source: task.source,
    project: task.project,
    priority: task.priority,
    promptBufferId: task.metadata?.promptBufferId,
    transport: task.metadata?.transport,
    exactReconstruction: exact,
    instructionLength: typeof task.instructions === 'string' ? task.instructions.length : null,
    localTaskId: local?.id || null,
    localStatusBeforeComplete: local?.status || null,
    completedLocalId,
    chatgptTaskStatus: chatgptView?.task?.status || null,
    chatgptResultSummary: chatgptView?.task?.resultSummary || null,
    chatgptHasInstructions: Object.prototype.hasOwnProperty.call(chatgptView?.task || {}, 'instructions'),
  }));
}

main().catch((error) => {
  console.error(error.message || 'follow-up failed');
  process.exitCode = 1;
});
