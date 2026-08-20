import { BridgeStore } from './store.js';
import { FirebaseRelayClient } from './relay/firebaseRelayClient.js';
import { assertRelayConfig, loadDotEnv, loadRelayConfig, redactConfig } from './relay/relayConfig.js';

loadDotEnv();
const config = loadRelayConfig();
assertRelayConfig(config);

const store = new BridgeStore();
const client = new FirebaseRelayClient({
  apiUrl: config.apiUrl,
  token: config.token,
  agentId: config.agentId,
});

const remote = await client.status();
const local = await store.status();
const payload = {
  ok: true,
  relay: redactConfig(config),
  firebase: {
    ok: remote.ok === true,
    service: remote.service || null,
    taskCount: remote.taskCount ?? null,
  },
  local,
};
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
