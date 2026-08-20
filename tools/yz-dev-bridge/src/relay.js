import { BridgeStore } from './store.js';
import { FirebaseRelayClient } from './relay/firebaseRelayClient.js';
import { RelayWorker } from './relay/relayWorker.js';
import { assertRelayConfig, loadDotEnv, loadRelayConfig, redactConfig } from './relay/relayConfig.js';

loadDotEnv();
const config = loadRelayConfig();
assertRelayConfig(config);

console.error('YZ Dev Bridge Firebase relay configuration:', JSON.stringify(redactConfig(config)));
console.error('Relay does not execute shell commands. Cursor remains responsible for local code changes via MCP.');

const store = new BridgeStore();
const client = new FirebaseRelayClient({
  apiUrl: config.apiUrl,
  token: config.token,
  agentId: config.agentId,
});

for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    const remote = await client.status();
    console.error(`YZ Dev Bridge relay connected to ${remote.service || 'yzBridgeApi'} (tasks=${remote.taskCount ?? 'n/a'}).`);
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`YZ Dev Bridge relay startup probe ${attempt}/5 failed: ${message}`);
    if (attempt === 5) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

const worker = new RelayWorker({ client, store, config, logger: console });

function shutdown(signal) {
  console.error(`YZ Dev Bridge relay received ${signal}; shutting down.`);
  worker.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await worker.start();
