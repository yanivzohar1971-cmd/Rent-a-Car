import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../src/store.js';
import { buildDashboardSnapshot } from '../src/dashboard/snapshot.js';

test('dashboard snapshot reads go through Store and do not lose concurrent mutations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-dash-store-'));
  try {
    const file = join(dir, 'bridge.json');
    const store = new BridgeStore(file);
    await store.createTask({ project: 'rent-a-car', title: 'seed', instructions: 'seed' });

    const writers = Promise.all(Array.from({ length: 12 }, (_, index) => store.createTask({
      project: 'rent-a-car',
      title: `D-${index}`,
      instructions: 'concurrent dashboard read',
    })));
    const readers = Promise.all(Array.from({ length: 8 }, async () => {
      const snapshot = await buildDashboardSnapshot({ store });
      assert.ok(snapshot.stats.totalTasks >= 1);
      assert.equal(snapshot.store.state, 'ONLINE');
      return snapshot.stats.totalTasks;
    }));

    await Promise.all([writers, readers]);

    const after = await store.listTasks({ limit: 200 });
    assert.equal(after.length, 13);
    const snap = await buildDashboardSnapshot({ store });
    assert.equal(snap.stats.totalTasks, 13);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
