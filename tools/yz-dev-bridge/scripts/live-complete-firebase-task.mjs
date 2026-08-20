import { loadDotEnv } from '../src/relay/relayConfig.js';
import { BridgeStore } from '../src/store.js';

loadDotEnv();

const firebaseTaskId = process.argv[2];
if (!firebaseTaskId) throw new Error('firebase task id required');

const store = new BridgeStore();
let local = null;
for (let i = 0; i < 12; i += 1) {
  local = await store.findByFirebaseTaskId(firebaseTaskId);
  if (local) break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (!local) {
  console.log(JSON.stringify({ found: false, firebaseTaskId }));
  process.exit(0);
}
if (local.status === 'READY' || local.status === 'BLOCKED') {
  await store.claimTask({ id: local.id, actor: 'cursor' });
}
if (local.status !== 'COMPLETED' && local.status !== 'CANCELLED') {
  await store.updateTask({
    id: local.id,
    status: 'COMPLETED',
    actor: 'cursor',
    summary: 'INLINE regression confirmed. No Rent_a_Car source changes.',
    changedFiles: [],
    tests: [],
  });
}
const after = await store.getTask(local.id);
console.log(JSON.stringify({ found: true, localTaskId: after.id, status: after.status, firebaseTaskId }));
