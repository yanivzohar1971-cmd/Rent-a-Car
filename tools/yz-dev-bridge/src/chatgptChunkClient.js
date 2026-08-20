import { loadDotEnv, loadRelayConfig } from './relay/relayConfig.js';

loadDotEnv();

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export class ChatGptChunkClient {
  constructor({ apiUrl, key, fetchImpl = fetch } = {}) {
    this.apiUrl = String(apiUrl || '').replace(/\/$/, '');
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async get(path, params) {
    const qs = query({ key: this.key, ...params });
    const res = await this.fetchImpl(`${this.apiUrl}${path}?${qs}`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(json?.error || `HTTP ${res.status}`);
      error.status = res.status;
      error.code = json?.code;
      throw error;
    }
    return json;
  }

  create({ title, project = 'Rent_a_Car', priority = 'normal', requestId } = {}) {
    return this.get('/chatgpt/chunks/create', { title, project, priority, requestId });
  }

  append({ bufferId, index, data }) {
    return this.get('/chatgpt/chunks/append', { bufferId, index, data });
  }

  status({ bufferId }) {
    return this.get('/chatgpt/chunks/status', { bufferId });
  }

  commit({ bufferId, chunkCount }) {
    return this.get('/chatgpt/chunks/commit', { bufferId, chunkCount });
  }
}

export function createChatGptChunkClientFromEnv() {
  loadDotEnv();
  const config = loadRelayConfig();
  if (!config.apiUrl) {
    throw new Error('YZ_BRIDGE_FIREBASE_API_URL is required');
  }
  const key = String(process.env.YZ_BRIDGE_CHATGPT_KEY || '').trim();
  if (!key) throw new Error('YZ_BRIDGE_CHATGPT_KEY is required');
  return new ChatGptChunkClient({ apiUrl: config.apiUrl, key });
}

async function runCli(argv) {
  const [command, ...rest] = argv;
  const client = createChatGptChunkClientFromEnv();
  if (command === 'create') {
    const [title, requestId] = rest;
    const result = await client.create({ title, requestId });
    console.log(JSON.stringify({ ok: result.ok, bufferId: result.bufferId, status: result.status, nextChunk: result.nextChunk }));
    return;
  }
  if (command === 'append') {
    const [bufferId, index, ...dataParts] = rest;
    const result = await client.append({ bufferId, index: Number(index), data: dataParts.join(' ') });
    console.log(JSON.stringify({
      ok: result.ok,
      bufferId: result.bufferId,
      index: result.index,
      receivedChunks: result.receivedChunks,
      totalCharacters: result.totalCharacters,
    }));
    return;
  }
  if (command === 'status') {
    const [bufferId] = rest;
    const result = await client.status({ bufferId });
    console.log(JSON.stringify({
      ok: result.ok,
      bufferId: result.bufferId,
      status: result.status,
      receivedChunks: result.receivedChunks,
      totalCharacters: result.totalCharacters,
      committedTaskId: result.committedTaskId,
    }));
    return;
  }
  if (command === 'commit') {
    const [bufferId, chunkCount] = rest;
    const result = await client.commit({ bufferId, chunkCount: chunkCount ? Number(chunkCount) : undefined });
    console.log(JSON.stringify({ ok: result.ok, bufferId: result.bufferId, taskId: result.taskId, status: result.status }));
    return;
  }
  console.error('Usage: node src/chatgptChunkClient.js create|append|status|commit ...');
  process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('chatgptChunkClient.js');
if (invokedDirectly && process.argv[2]) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message || 'chunk client failed');
    process.exitCode = 1;
  });
}
