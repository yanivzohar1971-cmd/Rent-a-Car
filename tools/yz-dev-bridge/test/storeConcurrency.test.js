import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  BridgeStore,
  classifyStoreError,
  isPidAlive,
  isTransientFsError,
  parseStoreLockOwner,
  renameWithRetry,
  sanitizeStoreErrorReason,
} from '../src/store.js';

async function withTempStore(fn, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yz-store-concurrency-'));
  try {
    const file = join(dir, 'bridge.json');
    const store = new BridgeStore(file, options);
    await fn({ dir, file, store });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runWorker(file, prefix, count) {
  const worker = fileURLToPath(new URL('../scripts/worker-mutate.mjs', import.meta.url));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [worker, file, prefix, String(count)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(stderr || `worker exited ${code}`));
    });
  });
}

test('isTransientFsError recognizes Windows rename denial codes', () => {
  assert.equal(isTransientFsError({ code: 'EPERM' }), true);
  assert.equal(isTransientFsError({ code: 'EBUSY' }), true);
  assert.equal(isTransientFsError({ code: 'ENOENT' }), false);
});

test('parseStoreLockOwner supports JSON and legacy pid formats', () => {
  assert.deepEqual(parseStoreLockOwner('{"pid":1234,"at":"2026-08-20T00:00:00.000Z"}'), {
    pid: 1234,
    at: '2026-08-20T00:00:00.000Z',
    file: null,
  });
  assert.equal(parseStoreLockOwner('4321\n2026-08-20T00:00:00.000Z\n').pid, 4321);
  assert.equal(parseStoreLockOwner('not-a-lock'), null);
});

test('renameWithRetry recovers after transient EPERM then commits once', async () => {
  let attempts = 0;
  const calls = [];
  const result = await renameWithRetry('from.tmp', 'to.json', {
    maxAttempts: 5,
    baseDelayMs: 1,
    sleepImpl: async () => undefined,
    renameImpl: async (from, to) => {
      attempts += 1;
      calls.push([from, to]);
      if (attempts < 3) {
        const error = new Error('EPERM: operation not permitted, rename');
        error.code = 'EPERM';
        throw error;
      }
    },
  });
  assert.equal(attempts, 3);
  assert.equal(result.recovered, true);
  assert.equal(calls.length, 3);
});

test('renameWithRetry exhausts and preserves original EPERM', async () => {
  await assert.rejects(
    () => renameWithRetry('from.tmp', 'to.json', {
      maxAttempts: 3,
      baseDelayMs: 1,
      sleepImpl: async () => undefined,
      renameImpl: async () => {
        const error = new Error('EPERM: operation not permitted, rename');
        error.code = 'EPERM';
        throw error;
      },
    }),
    (error) => error.code === 'EPERM',
  );
});

test('Store write recovers from injected EPERM rename and leaves no orphan temp for this op', async () => {
  await withTempStore(async ({ dir, file, store }) => {
    let attempts = 0;
    store._renameImpl = async (from, to) => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('EPERM: operation not permitted, rename');
        error.code = 'EPERM';
        throw error;
      }
      return rename(from, to);
    };
    store._sleepImpl = async () => undefined;
    store._renameMaxAttempts = 5;

    const task = await store.createTask({
      project: 'rent-a-car',
      title: 'Recovered write',
      instructions: 'Survive EPERM',
    });
    assert.equal(task.id, 'TASK-00001');
    assert.equal(store.lastCommitMeta.recovered, true);
    assert.equal(attempts, 3);

    const raw = await readFile(file, 'utf8');
    assert.match(raw, /Recovered write/);
    const leftovers = (await import('node:fs/promises')).readdir(dir);
    const names = await leftovers;
    assert.equal(names.filter((name) => name.endsWith('.tmp')).length, 0);
  });
});

test('Store write fails honestly when every rename attempt is EPERM and cleans its temp', async () => {
  await withTempStore(async ({ dir, store }) => {
    store._renameImpl = async () => {
      const error = new Error('EPERM: operation not permitted, rename');
      error.code = 'EPERM';
      throw error;
    };
    store._sleepImpl = async () => undefined;
    store._renameMaxAttempts = 3;
    await assert.rejects(
      () => store.createTask({ project: 'rent-a-car', title: 'Fail', instructions: 'No commit' }),
      (error) => error.code === 'EPERM',
    );
    const names = await (await import('node:fs/promises')).readdir(dir);
    assert.equal(names.filter((name) => name.endsWith('.tmp')).length, 0);
  });
});

test('mutation reloads durable state after lock acquisition', async () => {
  await withTempStore(async ({ file }) => {
    const first = new BridgeStore(file);
    const second = new BridgeStore(file);
    await first.createTask({ project: 'rent-a-car', title: 'seed', instructions: 'seed' });

    let releaseSlow;
    const gate = new Promise((resolvePromise) => { releaseSlow = resolvePromise; });
    let slowEntered = false;

    const slow = first._withFileLock(async () => {
      slowEntered = true;
      const state = await first._readState();
      await gate;
      state.tasks[0].summary = 'from-slow-writer';
      await first._writeState(state);
      return state.tasks[0];
    });

    while (!slowEntered) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    }

    const createPromise = second.createTask({
      project: 'rent-a-car',
      title: 'concurrent',
      instructions: 'created while lock held',
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
    releaseSlow();
    await slow;
    await createPromise;

    const finalStore = new BridgeStore(file);
    const tasks = await finalStore.listTasks({ project: 'rent-a-car', limit: 20 });
    assert.equal(tasks.length, 2);
    assert.equal(tasks.find((task) => task.title === 'seed')?.summary, 'from-slow-writer');
    assert.ok(tasks.some((task) => task.title === 'concurrent'));
  });
});

test('second writer waits while first holds lock; lock is released after success', async () => {
  await withTempStore(async ({ file }) => {
    const first = new BridgeStore(file);
    const second = new BridgeStore(file, { sleepImpl: async () => undefined });
    let release;
    const gate = new Promise((resolvePromise) => { release = resolvePromise; });
    let sawWait = false;

    const holder = first._withFileLock(async () => {
      await gate;
      return 'held';
    });

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    const waiter = (async () => {
      const started = Date.now();
      await second.createTask({ project: 'rent-a-car', title: 'waiter', instructions: 'waited' });
      sawWait = Date.now() - started >= 10;
    })();

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    release();
    await holder;
    await waiter;
    assert.equal(sawWait, true);
    assert.equal(await readFile(`${file}.lock`, 'utf8').then(() => false).catch((error) => error.code === 'ENOENT'), true);
  });
});

test('lock is released after a thrown mutation', async () => {
  await withTempStore(async ({ file, store }) => {
    await assert.rejects(
      () => store._mutate(() => {
        throw new Error('boom-inside-mutation');
      }),
      /boom-inside-mutation/,
    );
    await assert.rejects(
      () => readFile(`${file}.lock`, 'utf8'),
      (error) => error.code === 'ENOENT',
    );
    const created = await store.createTask({ project: 'rent-a-car', title: 'after', instructions: 'ok' });
    assert.equal(created.id, 'TASK-00001');
  });
});

test('dead lock can be recovered; live lock is never stolen', async () => {
  await withTempStore(async ({ file }) => {
    const live = new BridgeStore(file, {
      lockWaitMs: 150,
      sleepImpl: async () => undefined,
      pidAliveImpl: () => true,
    });
    await writeFile(`${file}.lock`, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`, 'utf8');
    await assert.rejects(
      () => live.createTask({ project: 'rent-a-car', title: 'blocked', instructions: 'no' }),
      /Timed out waiting for bridge lock/,
    );

    const dead = new BridgeStore(file, {
      lockWaitMs: 500,
      sleepImpl: async () => undefined,
      pidAliveImpl: () => false,
    });
    await writeFile(`${file}.lock`, `${JSON.stringify({ pid: 987654321, at: new Date().toISOString() })}\n`, 'utf8');
    const created = await dead.createTask({ project: 'rent-a-car', title: 'recovered', instructions: 'yes' });
    assert.equal(created.title, 'recovered');
  });
});

test('independent child processes do not lose concurrent Store updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yz-store-cross-process-'));
  try {
    const file = join(dir, 'bridge.json');
    await new BridgeStore(file).init();
    for (let round = 0; round < 3; round += 1) {
      await Promise.all([
        runWorker(file, `A${round}`, 8),
        runWorker(file, `B${round}`, 8),
        runWorker(file, `C${round}`, 8),
      ]);
    }
    const store = new BridgeStore(file);
    const tasks = await store.listTasks({ project: 'rent-a-car', limit: 200 });
    assert.equal(tasks.length, 72);
    assert.equal(new Set(tasks.map((task) => task.id)).size, 72);
    assert.equal(tasks.filter((task) => task.title.startsWith('A')).length, 24);
    assert.equal(tasks.filter((task) => task.title.startsWith('B')).length, 24);
    assert.equal(tasks.filter((task) => task.title.startsWith('C')).length, 24);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('simultaneous different-project session registration does not lose either state', async () => {
  await withTempStore(async ({ file }) => {
    const rentStore = new BridgeStore(file);
    const glassesStore = new BridgeStore(file);
    const rent = await rentStore.createTask({ project: 'rent-a-car', title: 'Rent', instructions: 'r' });
    const glasses = await glassesStore.createTask({ project: 'glasses', title: 'Glasses', instructions: 'g' });

    await Promise.all([
      rentStore.markAgentSessionRegistered({
        id: rent.id,
        session: {
          taskId: rent.id,
          nonce: 'rent-nonce',
          pid: 111,
          startedAt: '2026-08-20T10:00:00.000Z',
          file: 'rent-session.json',
        },
      }),
      glassesStore.markAgentSessionRegistered({
        id: glasses.id,
        session: {
          taskId: glasses.id,
          nonce: 'glasses-nonce',
          pid: 222,
          startedAt: '2026-08-20T10:00:01.000Z',
          file: 'glasses-session.json',
        },
      }),
    ]);

    const finalStore = new BridgeStore(file);
    const rentTask = await finalStore.getTask(rent.id);
    const glassesTask = await finalStore.getTask(glasses.id);
    assert.equal(rentTask.metadata.agentSession.nonce, 'rent-nonce');
    assert.equal(glassesTask.metadata.agentSession.nonce, 'glasses-nonce');
    assert.equal(rentTask.projectId, 'rent-a-car');
    assert.equal(glassesTask.projectId, 'glasses');
  });
});

test('classifyStoreError never exposes temp path or UUID details', () => {
  const error = new Error(
    "EPERM: operation not permitted, rename 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car\\tools\\yz-dev-bridge\\data\\bridge.json.1234.abcdef01-2345-6789-abcd-ef0123456789.tmp' -> 'C:\\Users\\Yaniv\\source\\repos\\Rent_a_Car\\tools\\yz-dev-bridge\\data\\bridge.json'",
  );
  error.code = 'EPERM';
  const classified = classifyStoreError(error);
  assert.equal(classified.component, 'Bridge Store');
  assert.equal(classified.operation, 'STORE COMMIT');
  assert.equal(classified.code, 'EPERM');
  assert.equal(classified.status, 'FAILED');
  // Card helpers use only these fields — raw path stays only on classified.message for RAW mode.
  assert.match(classified.message, /EPERM/);
  assert.match(classified.safeReason, /EPERM/);
  assert.doesNotMatch(classified.safeReason, /abcdef01-2345/i);
  assert.doesNotMatch(classified.safeReason, /Rent_a_Car/);
  assert.doesNotMatch(classified.safeReason, /\.tmp/i);
  assert.equal(
    sanitizeStoreErrorReason(error.message, 'EPERM').includes('bridge.json.1234'),
    false,
  );
});

test('concurrent claim and update operations preserve both tasks', async () => {
  await withTempStore(async ({ file }) => {
    const seed = new BridgeStore(file);
    const rent = await seed.createTask({
      project: 'rent-a-car',
      title: 'Rent claim',
      instructions: 'claim me',
      metadata: { githubRepo: 'yanivzohar1971-cmd/Rent-a-Car', githubIssueNumber: '34' },
    });
    const glasses = await seed.createTask({
      project: 'glasses',
      title: 'Glasses claim',
      instructions: 'claim me too',
      metadata: { githubRepo: 'yanivzohar1971-cmd/Glasses', githubIssueNumber: '1' },
    });

    const rentStore = new BridgeStore(file);
    const glassesStore = new BridgeStore(file);
    await Promise.all([
      rentStore.claimTask({ id: rent.id, actor: 'cursor' }),
      glassesStore.claimTask({ id: glasses.id, actor: 'cursor' }),
    ]);
    await Promise.all([
      rentStore.updateTask({
        id: rent.id,
        status: 'IN_PROGRESS',
        actor: 'cursor',
        note: 'rent working',
      }),
      glassesStore.updateTask({
        id: glasses.id,
        status: 'IN_PROGRESS',
        actor: 'cursor',
        note: 'glasses working',
      }),
    ]);

    const finalStore = new BridgeStore(file);
    const rentTask = await finalStore.getTask(rent.id);
    const glassesTask = await finalStore.getTask(glasses.id);
    assert.equal(rentTask.status, 'IN_PROGRESS');
    assert.equal(glassesTask.status, 'IN_PROGRESS');
    assert.equal(rentTask.claimedBy, 'cursor');
    assert.equal(glassesTask.claimedBy, 'cursor');
    assert.equal(rentTask.metadata.githubRepo, 'yanivzohar1971-cmd/Rent-a-Car');
    assert.equal(glassesTask.metadata.githubRepo, 'yanivzohar1971-cmd/Glasses');
    assert.ok(rentTask.notes.some((note) => note.text === 'rent working'));
    assert.ok(glassesTask.notes.some((note) => note.text === 'glasses working'));
  });
});

test('concurrent COMPLETED updates preserve source repo and project metadata', async () => {
  await withTempStore(async ({ file }) => {
    const seed = new BridgeStore(file);
    const rent = await seed.createTask({
      project: 'rent-a-car',
      title: 'Rent done',
      instructions: 'finish',
      metadata: {
        githubRepo: 'yanivzohar1971-cmd/Rent-a-Car',
        githubIssueNumber: '34',
        source: 'github-inbox',
      },
    });
    const glasses = await seed.createTask({
      project: 'glasses',
      title: 'Glasses done',
      instructions: 'finish',
      metadata: {
        githubRepo: 'yanivzohar1971-cmd/Glasses',
        githubIssueNumber: '1',
        source: 'github-inbox',
      },
    });
    await seed.claimTask({ id: rent.id, actor: 'cursor' });
    await seed.claimTask({ id: glasses.id, actor: 'cursor' });

    const rentStore = new BridgeStore(file);
    const glassesStore = new BridgeStore(file);
    await Promise.all([
      rentStore.updateTask({
        id: rent.id,
        status: 'COMPLETED',
        actor: 'cursor',
        summary: 'rent ok',
        metadata: { structuredResult: { resultSummary: 'rent ok' } },
      }),
      glassesStore.updateTask({
        id: glasses.id,
        status: 'COMPLETED',
        actor: 'cursor',
        summary: 'glasses ok',
        metadata: { structuredResult: { resultSummary: 'glasses ok' } },
      }),
    ]);

    const finalStore = new BridgeStore(file);
    const rentTask = await finalStore.getTask(rent.id);
    const glassesTask = await finalStore.getTask(glasses.id);
    assert.equal(rentTask.status, 'COMPLETED');
    assert.equal(glassesTask.status, 'COMPLETED');
    assert.equal(rentTask.projectId, 'rent-a-car');
    assert.equal(glassesTask.projectId, 'glasses');
    assert.equal(rentTask.metadata.githubRepo, 'yanivzohar1971-cmd/Rent-a-Car');
    assert.equal(glassesTask.metadata.githubRepo, 'yanivzohar1971-cmd/Glasses');
    assert.equal(rentTask.metadata.githubIssueNumber, '34');
    assert.equal(glassesTask.metadata.githubIssueNumber, '1');
    assert.equal(rentTask.metadata.structuredResult.resultSummary, 'rent ok');
    assert.equal(glassesTask.metadata.structuredResult.resultSummary, 'glasses ok');
    assert.equal(rentTask.summary, 'rent ok');
    assert.equal(glassesTask.summary, 'glasses ok');
  });
});

test('isPidAlive treats current process as alive', () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(-1), false);
});

test('open lock file handle still allows exclusive-create denial for second writer', async () => {
  await withTempStore(async ({ file }) => {
    const handle = await open(`${file}.lock`, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`, 'utf8');
      const store = new BridgeStore(file, {
        lockWaitMs: 120,
        sleepImpl: async () => undefined,
        pidAliveImpl: () => true,
      });
      await assert.rejects(
        () => store.createTask({ project: 'rent-a-car', title: 'denied', instructions: 'lock held' }),
        /Timed out waiting for bridge lock/,
      );
    } finally {
      await handle.close().catch(() => undefined);
      await rm(`${file}.lock`, { force: true });
    }
  });
});
