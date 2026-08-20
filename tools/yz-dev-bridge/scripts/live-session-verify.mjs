import { loadDotEnv, loadRelayConfig } from '../src/relay/relayConfig.js';
import { ChatGptChunkClient } from '../src/chatgptChunkClient.js';
import { BridgeStore } from '../src/store.js';

loadDotEnv();

function redact(value) {
  const secrets = [
    process.env.YZ_BRIDGE_CHATGPT_KEY,
    process.env.YZ_BRIDGE_CHATGPT_SESSION_KEY,
    process.env.YZ_BRIDGE_API_TOKEN,
  ].filter(Boolean);
  let text = JSON.stringify(value);
  for (const secret of secrets) {
    text = text.split(secret).join('<REDACTED>');
  }
  return text;
}

async function chatgptGet(apiUrl, key, path, params) {
  const search = new URLSearchParams({ key, ...params });
  const res = await fetch(`${apiUrl}${path}?${search.toString()}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, raw: JSON.stringify(json) };
}

async function waitForLocal(store, firebaseTaskId) {
  for (let i = 0; i < 12; i += 1) {
    const local = await store.findByFirebaseTaskId(firebaseTaskId);
    if (local) return local;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function completeLocal(store, local, summary) {
  if (!local) return null;
  if (local.status === 'READY' || local.status === 'BLOCKED') {
    await store.claimTask({ id: local.id, actor: 'cursor' });
  }
  if (local.status !== 'COMPLETED' && local.status !== 'CANCELLED') {
    await store.updateTask({
      id: local.id,
      status: 'COMPLETED',
      actor: 'cursor',
      summary,
      changedFiles: [],
      tests: [],
    });
  }
  return (await store.getTask(local.id)).id;
}

async function waitChatGptCompleted(apiUrl, key, id) {
  for (let i = 0; i < 12; i += 1) {
    const read = await chatgptGet(apiUrl, key, '/chatgpt/task', { id });
    if (read.json?.task?.status === 'COMPLETED') return read;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return chatgptGet(apiUrl, key, '/chatgpt/task', { id });
}

async function main() {
  const config = loadRelayConfig();
  const sessionKey = String(process.env.YZ_BRIDGE_CHATGPT_SESSION_KEY || '').trim();
  const permanentKey = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '').trim();
  if (!config.apiUrl || !sessionKey || !permanentKey || !config.token) {
    throw new Error('required env is missing');
  }

  const inline = await chatgptGet(config.apiUrl, sessionKey, '/chatgpt/enqueue', {
    title: 'ChatGPT temporary session key test',
    instructions: 'Confirm YZ Dev Bridge temporary ChatGPT session authentication. Do not modify Rent_a_Car source code.',
    project: 'Rent_a_Car',
    requestId: `session-inline-${Date.now()}`,
  });

  const client = new ChatGptChunkClient({ apiUrl: config.apiUrl, key: sessionKey });
  const chunksSource = 'session-chunks-ok';
  const created = await client.create({ title: 'Session CHUNKS test', requestId: `session-chunks-${Date.now()}` });
  await client.append({ bufferId: created.bufferId, index: 0, data: chunksSource });
  const status = await client.status({ bufferId: created.bufferId });
  const committed = await client.commit({ bufferId: created.bufferId, chunkCount: 1 });

  const permanent = await chatgptGet(config.apiUrl, permanentKey, '/chatgpt/enqueue', {
    title: 'Permanent key regression after session deploy',
    instructions: 'Confirm permanent ChatGPT key still works. Do not modify Rent_a_Car source code.',
    project: 'Rent_a_Car',
    requestId: `perm-inline-${Date.now()}`,
  });

  const bearer = await fetch(`${config.apiUrl}/status`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  const bearerJson = await bearer.json();

  const sessionOnBearer = await fetch(`${config.apiUrl}/status`, {
    headers: { authorization: `Bearer ${sessionKey}` },
  });

  const store = new BridgeStore();
  const inlineLocal = await waitForLocal(store, inline.json?.taskId);
  const chunksLocal = await waitForLocal(store, committed.taskId);
  const permLocal = await waitForLocal(store, permanent.json?.taskId);

  const inlineLocalId = await completeLocal(
    store,
    inlineLocal,
    'Temporary ChatGPT session authentication confirmed. No Rent_a_Car source changes.',
  );
  const chunksLocalId = await completeLocal(
    store,
    chunksLocal,
    'Session CHUNKS authentication confirmed. No Rent_a_Car source changes.',
  );
  const permLocalId = await completeLocal(
    store,
    permLocal,
    'Permanent ChatGPT key regression confirmed. No Rent_a_Car source changes.',
  );

  const inlineRead = await waitChatGptCompleted(config.apiUrl, sessionKey, inline.json?.taskId);
  const chunksRead = await waitChatGptCompleted(config.apiUrl, sessionKey, committed.taskId);

  console.log(redact({
    expiresAt: process.env.YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT,
    inline: {
      httpStatus: inline.status,
      taskId: inline.json?.taskId,
      leakedSession: inline.raw.includes(sessionKey),
      localTaskId: inlineLocalId,
      chatgptStatus: inlineRead.json?.task?.status,
    },
    chunks: {
      bufferId: created.bufferId,
      receivedChunks: status.receivedChunks,
      taskId: committed.taskId,
      localTaskId: chunksLocalId,
      chatgptStatus: chunksRead.json?.task?.status,
    },
    permanent: {
      httpStatus: permanent.status,
      taskId: permanent.json?.taskId,
      localTaskId: permLocalId,
    },
    bearer: { httpStatus: bearer.status, ok: bearerJson.ok, service: bearerJson.service },
    sessionRejectedOnBearer: sessionOnBearer.status === 401,
  }));
}

main().catch((error) => {
  console.error(error.message || 'session live verify failed');
  process.exitCode = 1;
});
