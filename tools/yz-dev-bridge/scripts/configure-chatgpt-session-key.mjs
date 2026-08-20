import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const secretPath = resolve(root, '.secret-yz-bridge-chatgpt-session-key');
const expiresPath = resolve(root, '.secret-yz-bridge-chatgpt-session-expires-at');

function upsertEnv(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
}

const secret = readFileSync(secretPath, 'utf8').trim();
if (!secret) {
  throw new Error('session secret file is empty');
}

const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
writeFileSync(expiresPath, expiresAt, { encoding: 'utf8', mode: 0o600 });

let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
envText = upsertEnv(envText, 'YZ_BRIDGE_CHATGPT_SESSION_KEY', secret);
envText = upsertEnv(envText, 'YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT', expiresAt);
writeFileSync(envPath, envText, { encoding: 'utf8', mode: 0o600 });

process.stdout.write(`YZ_BRIDGE_CHATGPT_SESSION_EXPIRES_AT=${expiresAt}\n`);
process.stderr.write('Session capability configured locally (secret not printed).\n');
