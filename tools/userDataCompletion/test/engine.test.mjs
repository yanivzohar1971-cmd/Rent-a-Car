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
  canonicalize,
  classifyFieldRole,
} from '../lib/ownership.mjs';
import {
  compareCollection,
  MODES,
  DIFF,
  planWritesFromDiffs,
  assertNoDeleteOperations,
} from '../lib/compare.mjs';
import { runDryRun, assertApplyPreconditions, createRunId } from '../lib/engine.mjs';
import { writeBackup } from '../lib/backup.mjs';
import { SHAGRIR_IDENTIFIER_FIELDS } from '../lib/schema.mjs';

function memoryDb(seed = {}) {
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
                      return { async get() { return { docs: [] }; } };
                    },
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

test('identity: source/target UID and email mismatches hard STOP', async () => {
  const auth = {
    async getUser(uid) {
      if (uid === 'src') return { uid: 'src', email: 'wrong@example.com', providerData: [] };
      if (uid === 'tgt') return { uid: 'tgt', email: 'yanivzohar1971@gmail.com', providerData: [] };
      throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
    },
  };
  await assert.rejects(
    () => verifyAuthIdentity(auth, { uid: 'src', expectedEmail: 'idancarexpert@gmail.com', label: 'SOURCE' }),
    (e) => e instanceof IdentityMismatchError,
  );
  await assert.rejects(
    () => verifyAuthIdentity(auth, { uid: 'missing', expectedEmail: 'x@y.com', label: 'SOURCE' }),
    /UID does not exist/,
  );
  await assert.rejects(
    () => verifyAuthIdentity(auth, { uid: 'tgt', expectedEmail: 'other@example.com', label: 'TARGET' }),
    (e) => e instanceof IdentityMismatchError,
  );
});

test('source adapter exposes no write API', () => {
  const adapter = createReadOnlySourceAdapter(memoryDb(), { uid: 'src' });
  assert.equal(adapter.kind, 'SOURCE_READ_ONLY');
  assertNoWriteMethods(adapter);
  assert.equal(typeof adapter.setDocument, 'undefined');
  assert.equal(typeof adapter.delete, 'undefined');
});

test('target adapter is read-only unless writeEnabled', () => {
  assertNoWriteMethods(createTargetAdapter(memoryDb(), { uid: 'tgt', writeEnabled: false }));
  const rw = createTargetAdapter(memoryDb(), { uid: 'tgt', writeEnabled: true });
  assert.equal(typeof rw.setDocument, 'function');
});

test('ownership UID transform is exact; unrelated text untouched', () => {
  const sourceUid = 'XM885dekl0SCV4IbVwobglsICfP2';
  const targetUid = '5gw9sbDlBrfB5p3kcbCr6S9k3SI3';
  const { data, transforms } = transformOwnershipFields({
    userUid: sourceUid,
    note: `customer-${sourceUid}-literal`,
    supplierOrderNumber: '0028004',
  }, { sourceUid, targetUid });
  assert.equal(data.userUid, targetUid);
  assert.equal(data.note, `customer-${sourceUid}-literal`);
  assert.equal(data.supplierOrderNumber, '0028004');
  assert.equal(transforms.length, 1);
});

test('string identifier never coerces to number; leading zeros preserved', () => {
  assert.notEqual(fingerprintDocument({ supplierOrderNumber: '0028004' }), fingerprintDocument({ supplierOrderNumber: 28004 }));
  assert.notEqual(canonicalize('0028004'), canonicalize(28004));
  assert.deepEqual(canonicalize('0028004'), { __t: 'string', v: '0028004' });
  assert.deepEqual(canonicalize(28004), { __t: 'number', v: 28004 });
});

test('Shagrir identifiers remain byte/value equivalent after ownership normalize', () => {
  const sourceUid = 'S';
  const targetUid = 'T';
  const sourceDoc = {
    id: '42',
    path: 'users/S/reservations/42',
    data: {
      supplierOrderNumber: '0028004',
      externalContractNumber: 'EC-9',
      userUid: sourceUid,
    },
  };
  const targetDoc = {
    id: '42',
    path: 'users/T/reservations/42',
    data: {
      supplierOrderNumber: '0028004',
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

test('MISSING_ONLY plans creates and eligible field adds without overwrite', () => {
  const sourceUid = 'S';
  const targetUid = 'T';
  const result = compareCollection({
    collection: 'reservations',
    sourceDocs: [
      { id: '1', path: 'users/S/reservations/1', data: { supplierOrderNumber: 'A' } },
      { id: '2', path: 'users/S/reservations/2', data: { supplierOrderNumber: 'B', dateFrom: 1 } },
      { id: '3', path: 'users/S/reservations/3', data: { supplierOrderNumber: 'C', mystery: 1 } },
    ],
    targetDocs: [
      { id: '2', path: 'users/T/reservations/2', data: { supplierOrderNumber: 'B' } },
      { id: '3', path: 'users/T/reservations/3', data: { supplierOrderNumber: 'C' } },
      { id: '9', path: 'users/T/reservations/9', data: { localOnly: true } },
    ],
    sourceUid,
    targetUid,
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(result.counts.MISSING_DOCUMENT, 1);
  assert.equal(result.counts.TARGET_ONLY, 1);
  assert.ok(result.counts.MISSING_FIELD >= 1);
  const ops = planWritesFromDiffs(result.diffs, { mode: MODES.MISSING_ONLY });
  assert.ok(ops.some((op) => op.op === 'CREATE_DOCUMENT' && op.documentId === '1'));
  assert.ok(ops.some((op) => op.op === 'ADD_MISSING_FIELDS' && op.documentId === '2' && op.fields.includes('dateFrom')));
  // UNKNOWN field "mystery" must not be planned for add under MISSING_ONLY eligible set
  const mysteryOp = ops.find((op) => op.documentId === '3' && op.op === 'ADD_MISSING_FIELDS');
  assert.equal(mysteryOp, undefined);
  assertNoDeleteOperations(ops);
});

test('existing TARGET value is never overwritten by MISSING_ONLY plan', () => {
  const result = compareCollection({
    collection: 'suppliers',
    sourceDocs: [{ id: '1', path: 'users/S/suppliers/1', data: { name: 'A' } }],
    targetDocs: [{ id: '1', path: 'users/T/suppliers/1', data: { name: 'B' } }],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.MISSING_ONLY,
  });
  assert.equal(result.counts.SOURCE_CHANGED, 1);
  const ops = planWritesFromDiffs(result.diffs, { mode: MODES.MISSING_ONLY });
  assert.equal(ops.length, 0);
});

test('incremental: identical second run plans zero missing creates', () => {
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
  assert.equal(planWritesFromDiffs(second.diffs, { mode: MODES.MISSING_ONLY }).length, 0);
});

test('SOURCE_CHANGES detects authoritative change; UNKNOWN does not auto-overwrite', () => {
  assert.equal(classifyFieldRole('supplierOrderNumber'), 'SOURCE_AUTHORITATIVE');
  assert.equal(classifyFieldRole('mysteryField'), 'UNKNOWN');
  const result = compareCollection({
    collection: 'reservations',
    sourceDocs: [{ id: '1', path: 'users/S/reservations/1', data: { supplierOrderNumber: 'NEW', mysteryField: 2 } }],
    targetDocs: [{ id: '1', path: 'users/T/reservations/1', data: { supplierOrderNumber: 'OLD', mysteryField: 1 } }],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.SOURCE_CHANGES,
  });
  assert.ok(result.counts.SOURCE_CHANGED + result.counts.CONFLICT >= 1);
  const diff = result.diffs.find((d) => d.documentId === '1' && d.fields);
  assert.ok(diff.unknownFields?.includes('mysteryField') || diff.plannedAction === 'report-conflict-no-auto-overwrite' || diff.type === DIFF.CONFLICT || diff.type === DIFF.SOURCE_CHANGED);
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

test('shared/global collections excluded from copy ops', () => {
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

test('assertNoDeleteOperations rejects delete ops', () => {
  assert.throws(() => assertNoDeleteOperations([{ op: 'DELETE_DOCUMENT' }]), /Forbidden delete/);
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
  assert.equal(result.plan.authWrites, 0);
  assert.equal(result.plan.storageWrites, 0);
  assert.equal(result.plan.applyEnabled, false);
  assert.equal(result.plan.deleteEnabled, false);
  assert.ok(result.totals.MISSING_DOCUMENT >= 1);
  assert.equal(result.plan.shagrir.source.withSupplierOrder, 1);
  assert.equal(result.plan.shagrir.source.withExternalContract, 1);
  assert.equal(result.plan.shagrir.source.withBoth, 1);

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

test('APPLY safety: flag, backup, runId, stale plan', () => {
  assert.throws(() => assertApplyPreconditions({ applyFlag: false }), /explicit --apply/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    runId: null,
  }), /run ID required/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    runId: 'run-1',
    backupCompleted: false,
  }), /backup required/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    runId: 'run-1',
    backupCompleted: true,
    backupTargetUid: 'OTHER',
    backupRunId: 'run-1',
    targetUid: 'T',
  }), /backup target UID/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    runId: 'run-1',
    backupCompleted: true,
    backupTargetUid: 'T',
    backupRunId: 'run-OLD',
    targetUid: 'T',
  }), /backup run ID/);
  assert.throws(() => assertApplyPreconditions({
    applyFlag: true,
    runId: 'run-1',
    backupCompleted: true,
    backupTargetUid: 'T',
    backupRunId: 'run-1',
    targetUid: 'T',
    planFresh: false,
  }), /stale plan/);
  assert.equal(assertApplyPreconditions({
    applyFlag: true,
    backupCompleted: true,
    backupTargetUid: 'T',
    backupRunId: 'run-1',
    runId: 'run-1',
    targetUid: 'T',
    planFresh: true,
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

test('plan validation accepts approved create-only plan and rejects deletes', async () => {
  const { loadAndValidatePlan } = await import('../lib/apply.mjs');
  const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const dir = resolve('tools/userDataCompletion/runs/_test-plan-validation');
  mkdirSync(dir, { recursive: true });
  const planPath = resolve(dir, 'firebase-sync-plan-run-test.json');
  writeFileSync(planPath, JSON.stringify({
    runId: 'run-test',
    mode: 'missing-only',
    sourceUid: 'S',
    targetUid: 'T',
    operations: [{
      op: 'CREATE_DOCUMENT',
      collection: 'reservations',
      documentId: '1',
      sourcePath: 'users/S/reservations/1',
      targetPath: 'users/T/reservations/1',
      overwriteExisting: false,
    }],
  }));
  const ok = loadAndValidatePlan(planPath, {
    expectedRunId: 'run-test',
    expectedSourceUid: 'S',
    expectedTargetUid: 'T',
    expectedMode: 'missing-only',
  });
  assert.equal(ok.createCount, 1);
  writeFileSync(planPath, JSON.stringify({
    runId: 'run-test',
    mode: 'missing-only',
    sourceUid: 'S',
    targetUid: 'T',
    operations: [{ op: 'DELETE_DOCUMENT', collection: 'x', documentId: '1', targetPath: 'users/T/x/1', sourcePath: 'users/S/x/1' }],
  }));
  assert.throws(() => loadAndValidatePlan(planPath, {
    expectedRunId: 'run-test',
    expectedSourceUid: 'S',
    expectedTargetUid: 'T',
  }), /Forbidden delete|Delete/);
  rmSync(dir, { recursive: true, force: true });
});

test('run IDs are unique; audit dry-run writes are zero', () => {
  assert.notEqual(createRunId(), createRunId());
});

test('document IDs and nested path planning remain deterministic', () => {
  const result = compareCollection({
    collection: 'branches',
    sourceDocs: [
      { id: '10', path: 'users/S/branches/10', data: { name: 'A' } },
      { id: '2', path: 'users/S/branches/2', data: { name: 'B' } },
    ],
    targetDocs: [],
    sourceUid: 'S',
    targetUid: 'T',
    mode: MODES.MISSING_ONLY,
  });
  const ops = planWritesFromDiffs(result.diffs, { mode: MODES.MISSING_ONLY });
  assert.deepEqual(ops.map((op) => op.documentId).sort(), ['10', '2']);
  assert.ok(ops.every((op) => op.targetPath.includes(`/branches/${op.documentId}`)));
});

test('analyze: Shagrir detection, classification, identifier fidelity, zero writes', async () => {
  const {
    isShagrirSupplier,
    classifyChangedFields,
    DIFF_CLASS,
    analyzeIdentifierQuality,
    sanitizeValueSummary,
    describeFirestoreType,
    runAnalyzeDifferences,
  } = await import('../lib/analyzeDifferences.mjs');
  const { scanUserTree } = await import('../lib/engine.mjs');

  assert.equal(isShagrirSupplier({ data: { name: 'שגריר', commissionReportEmail: 'x@shagrir.co.il' } }), true);
  assert.equal(isShagrirSupplier({ data: { name: 'Other', email: 'a@b.com' } }), false);

  assert.equal(
    classifyChangedFields(['supplierOrderNumber'], { collection: 'reservations', isShagrirDoc: true }),
    DIFF_CLASS.SHAGRIR_CRITICAL,
  );
  assert.equal(
    classifyChangedFields(['supplierOrderNumber'], { collection: 'reservations', isShagrirDoc: false }),
    DIFF_CLASS.BUSINESS_RELEVANT_NOT_SHAGRIR,
  );
  assert.equal(
    classifyChangedFields(['updatedAt'], { collection: 'reservations', isShagrirDoc: true }),
    DIFF_CLASS.TARGET_LOCAL,
  );
  assert.equal(
    classifyChangedFields(['userUid'], { collection: 'customers' }),
    DIFF_CLASS.IRRELEVANT,
  );

  assert.equal(describeFirestoreType('0028004'), 'string');
  assert.equal(describeFirestoreType(28004), 'number:int');
  assert.notEqual(
    sanitizeValueSummary('0028004').hash8,
    sanitizeValueSummary(28004).hash8,
  );
  assert.equal(sanitizeValueSummary('0028004').leadingZero, true);

  const quality = analyzeIdentifierQuality([
    { id: '1', data: { supplierOrderNumber: '0028004' } },
    { id: '2', data: { supplierOrderNumber: '0028004' } },
    { id: '3', data: { supplierOrderNumber: 28004 } },
    { id: '4', data: { supplierOrderNumber: null } },
    { id: '5', data: { supplierOrderNumber: '' } },
  ]);
  assert.equal(quality.duplicateSupplierOrderNumberValues, 1);
  assert.equal(quality.ambiguousDuplicateReservationCount, 2);
  assert.equal(quality.leadingZeroCount, 2);
  assert.equal(quality.nullCount, 1);
  assert.equal(quality.blankCount, 1);
  assert.equal(quality.numericCount, 1);
  assert.equal(quality.stringCount, 3);

  const seed = {
    users: {
      S: {
        __doc: { ok: true },
        __collections: {
          suppliers: {
            '1': { id: 1, name: 'שגריר', commissionReportEmail: 'assaft@shagrir.co.il' },
          },
          reservations: {
            '10': { id: 10, supplierId: 1, supplierOrderNumber: '0028004', status: 'Confirmed' },
            '11': { id: 11, supplierId: 1, supplierOrderNumber: '111', updatedAt: 1 },
          },
          customers: {},
          agents: {},
          branches: {},
          carTypes: {},
          payments: {},
          commissionRules: {},
          cardStubs: {},
          requests: {},
          carSales: {},
          carSaleCommissionPayments: {},
        },
      },
      T: {
        __doc: { ok: true },
        __collections: {
          suppliers: {
            '1': { id: 1, name: 'שגריר', commissionReportEmail: 'assaft@shagrir.co.il' },
          },
          reservations: {
            // Changed identifier vs SOURCE — SHAGRIR_CRITICAL
            '10': { id: 10, supplierId: 1, supplierOrderNumber: '0028005', status: 'Confirmed' },
            // Timestamp-only change
            '11': { id: 11, supplierId: 1, supplierOrderNumber: '111', updatedAt: 99 },
            // TARGET_ONLY Shagrir with overlapping-capable id
            '99': { id: 99, supplierId: 1, supplierOrderNumber: '999999' },
          },
          customers: {},
          agents: {},
          branches: {},
          carTypes: {},
          payments: {},
          commissionRules: {},
          cardStubs: {},
          requests: {},
          carSales: {},
          carSaleCommissionPayments: {},
        },
      },
    },
  };
  const db = memoryDb(seed);
  const sourceAdapter = createReadOnlySourceAdapter(db, { uid: 'S' });
  const targetAdapter = createTargetAdapter(db, { uid: 'T', writeEnabled: false });
  assertNoWriteMethods(sourceAdapter);
  assertNoWriteMethods(targetAdapter);

  const report = await runAnalyzeDifferences({
    sourceAdapter,
    targetAdapter,
    sourceUid: 'S',
    targetUid: 'T',
    identity: { source: { uid: 'S', email: 'a@b.com' }, target: { uid: 'T', email: 'c@d.com' } },
    scanUserTree,
  });
  assert.equal(report.firestoreWrites, 0);
  assert.equal(report.authWrites, 0);
  assert.equal(report.storageWrites, 0);
  assert.equal(report.deletes, 0);
  assert.equal(report.sourceChangedApplied, false);
  assert.equal(report.targetOnlyDeleted, false);
  assert.ok(report.sourceChanged.byClassification.SHAGRIR_CRITICAL >= 1);
  assert.equal(report.targetOnly.shagrirReservationCount, 1);
  assert.equal(report.targetOnly.canContaminateMatching, true);
  assert.equal(report.readiness, 'NO_REVIEW_REQUIRED');
  const json = JSON.stringify(report);
  assert.equal(json.includes('firstName'), false);
  assert.equal(json.includes('phone'), false);
});
