import { loadDotEnv } from '../src/relay/relayConfig.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotEnv();
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
function upsert(key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) text = text.replace(pattern, line);
  else text += `${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
}
upsert('YZ_BRIDGE_GITHUB_REPO', 'yanivzohar1971-cmd/Rent-a-Car');
upsert('YZ_BRIDGE_GITHUB_POLL_INTERVAL_MS', '15000');
upsert('YZ_BRIDGE_AGENT_AUTO_LAUNCH', 'true');
upsert('YZ_BRIDGE_AGENT_WINDOW_KEEP_OPEN', 'false');
upsert('YZ_BRIDGE_WORKSPACE', 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car');
writeFileSync(envPath, text, 'utf8');
process.stdout.write('GitHub relay local flags upserted (no secrets printed).\n');
