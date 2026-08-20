import { loadDotEnv, loadRelayConfig } from '../src/relay/relayConfig.js';
import { ChatGptChunkClient } from '../src/chatgptChunkClient.js';

loadDotEnv();

const SOURCE =
  'YZ Bridge CHUNKS connectivity test. Do not modify Rent_a_Car source code. Return only a confirmation that all chunks arrived in the correct order.';
const CHUNKS = [
  'YZ Bridge CHUNKS connectivity test. ',
  'Do not modify Rent_a_Car source code. ',
  'Return only a confirmation that all chunks arrived in the correct order.',
];

function redact(value) {
  const key = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '');
  const token = String(process.env.YZ_BRIDGE_API_TOKEN || '');
  let text = JSON.stringify(value);
  if (key) text = text.split(key).join('<YZ_BRIDGE_CHATGPT_KEY>');
  if (token) text = text.split(token).join('<YZ_BRIDGE_API_TOKEN>');
  return text;
}

async function chatgptGet(apiUrl, path, params) {
  const search = new URLSearchParams({ key: process.env.YZ_BRIDGE_CHATGPT_KEY, ...params });
  const res = await fetch(`${apiUrl}${path}?${search.toString()}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  const config = loadRelayConfig();
  const key = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '').trim();
  if (!config.apiUrl || !key) {
    throw new Error('YZ_BRIDGE_FIREBASE_API_URL and YZ_BRIDGE_CHATGPT_KEY are required');
  }
  const assembled = CHUNKS.join('');
  if (assembled !== SOURCE) {
    throw new Error('local chunk split does not match source text');
  }

  const client = new ChatGptChunkClient({ apiUrl: config.apiUrl, key });
  const requestId = `chunks-live-${Date.now()}`;
  const created = await client.create({
    title: 'CHUNKS connectivity test',
    requestId,
  });
  for (let i = 0; i < CHUNKS.length; i += 1) {
    await client.append({ bufferId: created.bufferId, index: i, data: CHUNKS[i] });
  }
  const status = await client.status({ bufferId: created.bufferId });
  const committed = await client.commit({ bufferId: created.bufferId, chunkCount: 3 });
  const inline = await chatgptGet(config.apiUrl, '/chatgpt/enqueue', {
    title: 'INLINE regression after CHUNKS',
    instructions: 'YZ Bridge INLINE connectivity test. Do not modify Rent_a_Car source code.',
    project: 'Rent_a_Car',
    requestId: `inline-live-${Date.now()}`,
  });
  const bearer = await fetch(`${config.apiUrl}/status`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  const bearerJson = await bearer.json();

  console.log(redact({
    chunks: {
      bufferId: created.bufferId,
      createStatus: created.status,
      receivedChunks: status.receivedChunks,
      totalCharacters: status.totalCharacters,
      statusHasContentField: Object.prototype.hasOwnProperty.call(status, 'content'),
      taskId: committed.taskId,
      commitStatus: committed.status,
      sourceMatches: assembled === SOURCE,
      assembledLength: assembled.length,
    },
    inline: {
      httpStatus: inline.status,
      taskId: inline.json?.taskId,
      status: inline.json?.status,
    },
    bearer: {
      httpStatus: bearer.status,
      ok: bearerJson.ok,
      service: bearerJson.service,
    },
  }));
}

main().catch((error) => {
  console.error(error.message || 'live smoke failed');
  process.exitCode = 1;
});
