import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const secretPath = resolve(root, '.secret-yz-bridge-chatgpt-key');
const urlsPath = resolve(root, '.chatgpt-urls.local');
const apiUrl = 'https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi';

function readEnv(key) {
  if (!existsSync(envPath)) return '';
  const text = readFileSync(envPath, 'utf8');
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const existing = readEnv('YZ_BRIDGE_CHATGPT_KEY');
const key = existing || randomBytes(32).toString('hex');
let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (!/^YZ_BRIDGE_CHATGPT_KEY=/m.test(envText)) {
  if (envText && !envText.endsWith('\n')) envText += '\n';
  envText += `YZ_BRIDGE_CHATGPT_KEY=${key}\n`;
  writeFileSync(envPath, envText, { encoding: 'utf8', mode: 0o600 });
}

writeFileSync(secretPath, key, { encoding: 'utf8', mode: 0o600 });
writeFileSync(
  urlsPath,
  [
    'Local ChatGPT GET templates. Gitignored. Do not commit.',
    '',
    `INLINE_CREATE=${apiUrl}/chatgpt/enqueue?key=${key}&title=<URL_ENCODED_TITLE>&instructions=<URL_ENCODED_INSTRUCTIONS>&project=Rent_a_Car&requestId=<UNIQUE_ID>`,
    `TASK_READ=${apiUrl}/chatgpt/task?key=${key}&id=<TASK_ID>`,
    `CHUNKS_CREATE=${apiUrl}/chatgpt/chunks/create?key=${key}&title=<URL_ENCODED_TITLE>&project=Rent_a_Car&priority=normal&requestId=<UNIQUE_ID>`,
    `CHUNKS_APPEND=${apiUrl}/chatgpt/chunks/append?key=${key}&bufferId=<BUFFER_ID>&index=<INDEX>&data=<URL_ENCODED_CHUNK>`,
    `CHUNKS_STATUS=${apiUrl}/chatgpt/chunks/status?key=${key}&bufferId=<BUFFER_ID>`,
    `CHUNKS_COMMIT=${apiUrl}/chatgpt/chunks/commit?key=${key}&bufferId=<BUFFER_ID>&chunkCount=<COUNT>`,
    '',
  ].join('\n'),
  { encoding: 'utf8', mode: 0o600 },
);
process.stderr.write('ChatGPT GET key configured locally (value not printed).\n');
