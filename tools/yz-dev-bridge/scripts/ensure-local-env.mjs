import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const secretPath = resolve(root, '.secret-yz-bridge-token');
const urlOverride = String(process.env.YZ_BRIDGE_FIREBASE_API_URL_OVERRIDE || '').trim();

function readExisting(key) {
  if (!existsSync(envPath)) return '';
  const text = readFileSync(envPath, 'utf8');
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const existingToken = readExisting('YZ_BRIDGE_API_TOKEN');
const token = existingToken || randomBytes(32).toString('hex');
const apiUrl = urlOverride || readExisting('YZ_BRIDGE_FIREBASE_API_URL')
  || 'https://us-central1-carexpert-94faa.cloudfunctions.net/yzBridgeApi';
const agentId = readExisting('YZ_BRIDGE_AGENT_ID') || 'yaniv-cursor';
const project = readExisting('YZ_BRIDGE_PROJECT') || 'Rent_a_Car';
const interval = readExisting('YZ_BRIDGE_RELAY_INTERVAL_MS') || '15000';

const contents = [
  '# Local YZ Dev Bridge configuration. Do not commit this file.',
  `YZ_BRIDGE_FIREBASE_API_URL=${apiUrl}`,
  `YZ_BRIDGE_API_TOKEN=${token}`,
  `YZ_BRIDGE_AGENT_ID=${agentId}`,
  `YZ_BRIDGE_PROJECT=${project}`,
  `YZ_BRIDGE_RELAY_INTERVAL_MS=${interval}`,
  '',
].join('\n');

writeFileSync(envPath, contents, { encoding: 'utf8', mode: 0o600 });
writeFileSync(secretPath, token, { encoding: 'utf8', mode: 0o600 });
process.stderr.write(`Wrote ${envPath} (token not printed; tokenConfigured=true; urlHostConfigured=${Boolean(apiUrl)}).\n`);
