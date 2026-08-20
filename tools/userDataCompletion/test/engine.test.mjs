import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuthIdentity, IdentityMismatchError } from '../lib/identity.mjs';
import {
  createReadOnlySourceAdapter,
  createTargetAdapter,
  assertNoWriteMethods,
} from '../lib/adapters.mjs';
import {
  transformOwnershipFields,
  ownershipNormalizedEquals,
  fingerprintDocument,
} from '../lib/ownership.mjs';
import {
  compareCollection,
  MODES,
  DIFF,
  planWritesFromDiffs,
} from '../lib/compare.mjs';
import { runDryRun, assertApplyPreconditions, createRunId } from '../lib/engine.mjs';
import { writeBackup } from '../lib/backup.mjs';
import { SHAGRIR_IDENTIFIER_FIELDS } from '../lib/schema.mjs';

function memoryDb(seed = {}) {
  // seed: { users: { [uid]: { __doc, [collection]: { [id]: data } } } }
  return {
    collection(name) {
      return {
        doc(id) {
          const user = () => {
            seed.users ||= {};
            seed.users[id] ||= { __collections: {} };
            return seed.users[id];
          };
          return {
            async get() {
              const node = seed.users?.[id];
              return {
                exists: Boolean(node?.__doc),
                id,
                ref: { path: `${name}/${id}` },
                data: () => node?.__doc || null,
              };
            },
            async listCollections() {
              const node = user();
              return Object.keys(node.__collections || {}).map((colId) => ({ id: colId }));
            },
            collection(colName) {
              const ensureCol = () => {
                const node = user();
                node.__collections[colName] ||= {};
                return node.__collections[colName];
              };
              return {
                async get() {
                  const col = ensureCol();
                  return {
                    docs: Object.entries(col).map(([docId, data]) => ({
                      id: docId,
                      ref: { path: `${name}/${id}/${colName}/${docId}` },
                      data: () => data,
                    })),
                  };
                },
                doc(docId) {
                  return {
                    async listCollections() { return []; },
                    collection() {
                      return {
                        async get() { return { docs: [] }; },
                      };
                    },
                    async set() { throw new Error('should not write in tests via raw'); },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('UID/email mismatch hard STOPs', async () => {
  const auth = {
    async getUser(uid) {
      if (uid === 'src') return { uid: 'src', email: 'wrong@example.com', providerData: [] };
      throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    },
  };
  await assert.rejects(
    () => verifyAuthIdentity(auth, { uid: 'src', expectedEmail: 'idancarexpert@gmail.com', label: 'SOURCE' }),
    (error) => error instanceof IdentityMismatchError,
  );
  await assert.rejects(
    () => verifyAuthIdentity(auth, { uid: 'missing', expectedEmail: 'x@y.com', label: 'SOURCE' }),
    /UID does not exist/,
  );
});

test('source adapter exposes no write API', () => {
  const adapter = createReadOnlySourceAdapter(memoryDb(), { uid: 'src' });
  assert.equal(adapter.kind, 'SOURCE_READ_ONLY');
  assertNoWriteMethods(adapter);
  assert.equal(typeof adapter.setDocument, 'undefined');
});

test('target adapter is read-only in dry-run mode', () => {
  const adapter = createTargetAdapter(memoryDb(), { uid: 'tgt', writeEnabled: false });
  assertNoWriteMethods(adapter);
});

test('ownership UID transform is exact; unrelated text untouched', () => {
  const sourceUid = 'XM885dekl0SCV4IbVwobglsICfP2';
  const targetUid = '5gw9sbDlBrfB5p3kcbCr6S9k3SI3';
  const { data, transforms } = transformOwnershipFields({
    userUid: sourceUid,
    note: `customer-${sourceUid}-literal`,
    supplierOrderNumber: 'ABC-001',
  }, { sourceUid, targetUid });
  assert.equal(data.userUid, targetUid);
  assert.equal(data.note, `customer-${sourceUid}-literal`);
  assert.equal(data.supplierOrderNumber, 'ABC-001');
  assert.equal(transforms.length, 1);
});

test('document IDs preserved and Shagrir identifiers stay equivalent', () => {
  const sourceUid = 'S';
  const targetUid = 'T';
  const sourceDoc = {
    id: '42',
    path: 'users/S/reservations/42',
    data: {
      supplierOrderNumber: 'SO-9',
      externalContractNumber: 'EC-9',
      userUid: sourceUid,
    },
  };
  const targetDoc = {
    id: '42',
    path: 'users/T/reservations/42',
    data: {
      supplierOrderNumber: 'SO-9',
      externalContractNumber: 'EC-9',
      userUid: targetUid,
    },
  };
  assert.equal(ownershipNormalizedEquals(sourceDoc.data, targetDoc.data, { sourceUid, targetUid }), true);
  for (const field of SHAGRIR_IDENTIFIER_FIELDS) {
    assert.equal(sourceDoc.data[field], targetDoc.data[field]);
  }
  const result = compareCollection({
    collection: 'reservations',
    sourceDocs: [sourceDoc],
    targetDocs: [targetDoc],
    sourceUid,
    targetUid,
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(result.counts.IDENTICAL, 1);
});

test('MISSING_ONLY plans creates for missing docs and never overwrites existing', () => {
  const sourceUid = 'S';
  const targetUid = 'T';
  const result = compareCollection({
    collection: 'reservations',
    sourceDocs: [
      { id: '1', path: 'users/S/reservations/1', data: { a: 1 } },
      { id: '2', path: 'users/S/reservations/2', data: { a: 2, b: 9 } },
    ],
    targetDocs: [
      { id: '2', path: 'users/T/reservations/2', data: { a: 2 } },
    ],
    sourceUid,
    targetUid,
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(result.counts.MISSING_DOCUMENT, 1);
  assert.equal(result.counts.MISSING_FIELD, 1);
  const ops = planWritesFromDiffs(result.diffs, { mode: MODES.MISSING_ONLY });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].documentId, '1');
  assert.equal(ops[0].op, 'CREATE_DOCUMENT');
});

test('FULL_RECONCILE reports TARGET_ONLY without delete ops', () => {
  const result = compareCollection({
    collection: 'agents',
    sourceDocs: [],
    targetDocs: [{ id: 'x', path: 'users/T/agents/x', data: {} }],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.FULL_RECONCILE,
  });
  assert.equal(result.counts.TARGET_ONLY, 1);
  assert.equal(result.diffs[0].plannedAction, 'report-only-no-delete');
  assert.equal(planWritesFromDiffs(result.diffs, { mode: MODES.FULL_RECONCILE }).length, 0);
});

test('second sync after completion plans zero missing creates', () => {
  const docs = [{ id: '1', path: 'users/S/customers/1', data: { n: 'a' } }];
  const first = compareCollection({
    collection: 'customers',
    sourceDocs: docs,
    targetDocs: [],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(first.counts.MISSING_DOCUMENT, 1);
  const second = compareCollection({
    collection: 'customers',
    sourceDocs: docs,
    targetDocs: [{ id: '1', path: 'users/T/customers/1', data: { n: 'a' } }],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(second.counts.MISSING_DOCUMENT, 0);
  assert.equal(second.counts.IDENTICAL, 1);
});

test('SOURCE_CHANGES detects changed fields', () => {
  const result = compareCollection({
    collection: 'suppliers',
    sourceDocs: [{ id: '1', path: 'users/S/suppliers/1', data: { name: 'A' } }],
    targetDocs: [{ id: '1', path: 'users/T/suppliers/1', data: { name: 'B' } }],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.SOURCE_CHANGES,
  });
  assert.equal(result.counts.SOURCE_CHANGED, 1);
});

test('dry-run performs no writes and refuses write-enabled target', async () => {
  const seed = {
    users: {
      S: {
        __doc: { ok: true },
        __collections: {
          reservations: {
            '1': { supplierOrderNumber: 'X', externalContractNumber: 'Y' },
          },
        },
      },
      T: {
        __doc: { ok: true },
        __collections: {
          reservations: {},
        },
      },
    },
  };
  const db = memoryDb(seed);
  const sourceAdapter = createReadOnlySourceAdapter(db, { uid: 'S' });
  const targetAdapter = createTargetAdapter(db, { uid: 'T', writeEnabled: false });
  const result = await runDryRun({
    sourceAdapter,
    targetAdapter,
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.MISSING_ONLY,
    identity: { source: { uid: 'S' }, target: { uid: 'T' } },
  });
  assert.equal(result.plan.firestoreWrites, 0);
  assert.equal(result.plan.applyEnabled, false);
  assert.equal(result.plan.deleteEnabled, false);
  assert.ok(result.totals.MISSING_DOCUMENT >= 1);

  const writable = createTargetAdapter(db, { uid: 'T', writeEnabled: true });
  await assert.rejects(
    () => runDryRun({
      sourceAdapter,
      targetAdapter: writable,
      sourceUid: 'S',
      targetUid: 'T',
    }),
    /write-enabled/,
  );
});

test('backup required before APPLY; apply flag required', () => {
  assert.throws(() => assertApplyPreconditions({ applyFlag: false }), /explicit --apply/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    backupCompleted: false,
  }), /backup required/);
  assert.equal(assertApplyPreconditions({
    applyFlag: true,
    backupCompleted: true,
    backupTargetUid: 'T',
    backupRunId: 'run-1',
    runId: 'run-1',
    targetUid: 'T',
  }), true);
});

test('backup write refused when writeEnabled=false', () => {
  assert.throws(() => writeBackup({
    backupDir: '.',
    runId: 'r',
    targetUid: 'T',
    documentsByCollection: {},
    writeEnabled: false,
  }), /DRY RUN safety/);
});

test('run IDs are unique', () => {
  assert.notEqual(createRunId(), createRunId());
});

test('fingerprints differ when business values differ', () => {
  assert.notEqual(
    fingerprintDocument({ supplierOrderNumber: '1' }),
    fingerprintDocument({ supplierOrderNumber: '2' }),
  );
});

test('unknown/shared collections excluded from copy ops', () => {
  const shared = compareCollection({
    collection: 'publicCars',
    sourceDocs: [{ id: '1', path: 'publicCars/1', data: {} }],
    targetDocs: [],
    sourceUid: 'S',
    targetUid: 'T',
  });
  assert.equal(shared.diffs[0].type, DIFF.EXCLUDED_SHARED_GLOBAL);
  assert.equal(planWritesFromDiffs(shared.diffs).length, 0);
});
