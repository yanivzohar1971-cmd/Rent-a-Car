import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareCollection,
  collectionsForMode,
  mergeCounts,
  MODES,
  planWritesFromDiffs,
} from './compare.mjs';
import { assertNoWriteMethods } from './adapters.mjs';
import { classifyCollection, SHAGRIR_IDENTIFIER_FIELDS } from './schema.mjs';
import { transformOwnershipFields } from './ownership.mjs';

export function createRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `run-${stamp}-${randomUUID().slice(0, 8)}`;
}

/**
 * Scan user tree: known collections + discovered extras.
 * Nested depth-1 subcollections under each document are included.
 */
export async function scanUserTree(adapter, { collections = collectionsForMode() } = {}) {
  assertNoWriteMethods(adapter);
  const discovered = await adapter.listSubcollections();
  const planned = new Set(collections);
  const unknown = discovered.filter((name) => !planned.has(name));
  const byCollection = {};
  let totalDocuments = 0;
  let nestedDocuments = 0;
  const nestedPaths = [];
  const shagrirCoverage = {
    reservationsTotal: 0,
    withSupplierOrder: 0,
    withExternalContract: 0,
    withBoth: 0,
    withNeither: 0,
  };

  const userDoc = await adapter.getUserDoc();
  const userDocPresent = Boolean(userDoc);

  for (const collection of [...planned].sort()) {
    const docs = await adapter.listDocuments(collection);
    byCollection[collection] = {
      scope: classifyCollection(collection),
      count: docs.length,
      documentIds: docs.map((doc) => doc.id),
      docs, // kept for compare; strip before public audit
    };
    totalDocuments += docs.length;

    if (collection === 'reservations') {
      for (const doc of docs) {
        shagrirCoverage.reservationsTotal += 1;
        const hasSo = doc.data?.supplierOrderNumber != null
          && String(doc.data.supplierOrderNumber).length > 0;
        const hasEc = doc.data?.externalContractNumber != null
          && String(doc.data.externalContractNumber).length > 0;
        if (hasSo) shagrirCoverage.withSupplierOrder += 1;
        if (hasEc) shagrirCoverage.withExternalContract += 1;
        if (hasSo && hasEc) shagrirCoverage.withBoth += 1;
        if (!hasSo && !hasEc) shagrirCoverage.withNeither += 1;
      }
    }

    // Nested scan only for small collections or known nested hosts (performance).
    const nestedHosts = new Set(['yardImportJobs']);
    if (docs.length > 100 && !nestedHosts.has(collection)) continue;
    const sample = nestedHosts.has(collection) || docs.length <= 100 ? docs : docs.slice(0, 20);
    for (const doc of sample) {
      const nestedCols = await adapter.listNestedCollections(collection, doc.id);
      for (const nested of nestedCols) {
        const nestedDocs = await adapter.listNestedDocuments(collection, doc.id, nested);
        nestedDocuments += nestedDocs.length;
        nestedPaths.push({
          parentCollection: collection,
          parentId: doc.id,
          nestedCollection: nested,
          count: nestedDocs.length,
        });
        const key = `${collection}/{id}/${nested}`;
        byCollection[key] = {
          scope: 'USER_SCOPED',
          count: (byCollection[key]?.count || 0) + nestedDocs.length,
          nested: true,
          docs: [
            ...(byCollection[key]?.docs || []),
            ...nestedDocs.map((item) => ({
              ...item,
              parentId: doc.id,
              parentCollection: collection,
              nestedCollection: nested,
            })),
          ],
        };
      }
    }
  }

  for (const name of unknown) {
    const docs = await adapter.listDocuments(name);
    byCollection[name] = {
      scope: classifyCollection(name),
      count: docs.length,
      documentIds: docs.map((doc) => doc.id),
      docs,
      discoveredExtra: true,
    };
    totalDocuments += docs.length;
  }

  return {
    uid: adapter.uid,
    userDocPresent,
    userDoc: userDocPresent ? userDoc : null,
    discoveredCollections: discovered,
    unknownCollections: unknown.map((name) => ({
      name,
      scope: classifyCollection(name),
      count: byCollection[name]?.count || 0,
    })),
    byCollection,
    totalDocuments: totalDocuments + (userDocPresent ? 1 : 0),
    nestedDocuments,
    nestedPaths,
    shagrirCoverage,
    shagrirFields: [...SHAGRIR_IDENTIFIER_FIELDS],
  };
}

export async function runDryRun({
  sourceAdapter,
  targetAdapter,
  sourceUid,
  targetUid,
  mode = MODES.MISSING_ONLY,
  identity,
  planDir,
} = {}) {
  assertNoWriteMethods(sourceAdapter);
  if (targetAdapter.writeEnabled) {
    throw new Error('DRY RUN refuses a write-enabled target adapter');
  }
  assertNoWriteMethods(targetAdapter);

  const runId = createRunId();
  const collections = collectionsForMode();
  const sourceScan = await scanUserTree(sourceAdapter, { collections });
  const targetScan = await scanUserTree(targetAdapter, { collections });

  const collectionResults = [];
  const allDiffs = [];

  for (const collection of collections) {
    const result = compareCollection({
      collection,
      sourceDocs: sourceScan.byCollection[collection]?.docs || [],
      targetDocs: targetScan.byCollection[collection]?.docs || [],
      sourceUid,
      targetUid,
      mode,
    });
    collectionResults.push({
      collection: result.collection,
      scope: result.scope,
      counts: result.counts,
    });
    allDiffs.push(...result.diffs);
  }

  // User root doc
  if (sourceScan.userDocPresent && !targetScan.userDocPresent) {
    allDiffs.push({
      type: 'MISSING_DOCUMENT',
      collection: '__userRoot__',
      documentId: targetUid,
      sourcePath: `users/${sourceUid}`,
      targetPath: `users/${targetUid}`,
      ownershipTransforms: [],
    });
  }

  const totals = mergeCounts(collectionResults.map((item) => item.counts));
  if (sourceScan.userDocPresent && !targetScan.userDocPresent) {
    totals.MISSING_DOCUMENT += 1;
  }

  const operations = planWritesFromDiffs(allDiffs, { mode });
  const ownershipTransforms = [];
  for (const op of operations) {
    for (const t of op.ownershipTransforms || []) ownershipTransforms.push({ ...t, documentId: op.documentId, collection: op.collection });
  }

  // Sample ownership transform potential across source docs (reporting only)
  for (const collection of collections) {
    for (const doc of sourceScan.byCollection[collection]?.docs || []) {
      const { transforms } = transformOwnershipFields(doc.data, { sourceUid, targetUid });
      for (const t of transforms) {
        ownershipTransforms.push({ ...t, documentId: doc.id, collection, planned: true });
      }
    }
  }

  const uniqueOwnership = dedupeOwnership(ownershipTransforms);

  const plan = {
    runId,
    createdAt: new Date().toISOString(),
    mode,
    sourceUid,
    targetUid,
    identity,
    pipeline: [
      'VERIFY_IDENTITIES',
      'DISCOVER_SCHEMA',
      'SCAN_SOURCE',
      'SCAN_TARGET',
      'COMPARE',
      'PLAN',
      'DRY_RUN',
      'BACKUP_TARGET',
      'APPLY',
      'VERIFY',
      'AUDIT_REPORT',
    ],
    stoppedAt: 'DRY_RUN',
    applyEnabled: false,
    deleteEnabled: false,
    sourceReadonly: true,
    collections,
    copyPlan: {
      COPY: collections.map((name) => `users/{uid}/${name}`),
      COPY_ROOT: ['users/{uid}'],
      REFERENCE_ONLY: [
        'publicCars (SHARED_GLOBAL)',
        'yards (SHARED_GLOBAL)',
        'config/* (SHARED_GLOBAL)',
      ],
      SKIP: [
        'Room-only templates/price-lists/reconciliation history (not in Firestore sync set)',
      ],
      UNKNOWN_REQUIRES_DECISION: sourceScan.unknownCollections
        .concat(targetScan.unknownCollections)
        .filter((item, index, arr) => arr.findIndex((x) => x.name === item.name) === index),
    },
    counts: {
      sourceTotalDocuments: sourceScan.totalDocuments,
      targetTotalDocuments: targetScan.totalDocuments,
      sourceByCollection: summarizeCounts(sourceScan),
      targetByCollection: summarizeCounts(targetScan),
      diffs: totals,
      plannedDocumentCreates: operations.filter((op) => op.op === 'CREATE_DOCUMENT').length,
      plannedFieldAdditions: operations
        .filter((op) => op.op === 'ADD_MISSING_FIELDS')
        .reduce((sum, op) => sum + (op.fields?.length || 0), 0),
      plannedFieldAdditionOps: operations.filter((op) => op.op === 'ADD_MISSING_FIELDS').length,
      plannedMissingOnlyWrites: operations.length,
      totalPlannedFutureWrites: operations.length,
      nestedSourceDocuments: sourceScan.nestedDocuments,
      nestedTargetDocuments: targetScan.nestedDocuments,
      nestedDocumentsTotal: sourceScan.nestedDocuments + targetScan.nestedDocuments,
    },
    shagrir: {
      fields: [...SHAGRIR_IDENTIFIER_FIELDS],
      source: sourceScan.shagrirCoverage,
      target: targetScan.shagrirCoverage,
      normalize: false,
      coerceTypes: false,
    },
    ownershipFieldTransforms: uniqueOwnership,
    operations: operations.map((op) => ({
      op: op.op,
      collection: op.collection,
      documentId: op.documentId,
      fields: op.fields || null,
      sourcePath: op.sourcePath,
      targetPath: op.targetPath,
      sourceHash: op.sourceHash || null,
      targetPreconditionHash: op.targetPreconditionHash || null,
      ownershipTransforms: op.ownershipTransforms || [],
      merge: op.merge === true,
      overwriteExisting: op.overwriteExisting === true,
    })),
    dependencyOrder: [
      'suppliers',
      'branches',
      'agents',
      'carTypes',
      'customers',
      'reservations',
      'payments',
      'commissionRules',
      'cardStubs',
      'requests',
      'carSales',
      'carSaleCommissionPayments',
    ],
    recommendedApplySemantics: 'MERGE',
    recommendedApplySemanticsReason:
      'Path-scoped users/{uid}/** docs use stable Room integer IDs; MISSING_ONLY merge preserves TARGET_ONLY debug data and avoids destructive replace.',
    backupPolicy: {
      requiredBeforeApply: true,
      location: 'tools/userDataCompletion/backups/',
      mustMatchTargetUidAndRunId: true,
    },
    checkpointStrategy: {
      batchSize: 200,
      storeLocation: 'tools/userDataCompletion/runs/{runId}/checkpoint.json',
      neverInSourceBusinessData: true,
      idempotentRetry: true,
    },
    stalePlanProtection: {
      requireRunId: true,
      requireTargetPreconditionHashForFieldOps: true,
      onMismatch: 'CONFLICT_SKIP_REPORT',
    },
    writesPerformed: 0,
    firestoreWrites: 0,
    authWrites: 0,
    storageWrites: 0,
  };

  if (planDir) {
    mkdirSync(planDir, { recursive: true });
    const planPath = resolve(planDir, `firebase-sync-plan-${runId}.json`);
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    plan.planPath = planPath;
  }

  return {
    runId,
    plan,
    sourceScan: publicScan(sourceScan),
    targetScan: publicScan(targetScan),
    totals,
    operations,
  };
}

function summarizeCounts(scan) {
  const out = {};
  for (const [name, info] of Object.entries(scan.byCollection)) {
    if (info.nested) continue;
    out[name] = info.count;
  }
  out.__userRoot__ = scan.userDocPresent ? 1 : 0;
  return out;
}

function publicScan(scan) {
  return {
    uid: scan.uid,
    userDocPresent: scan.userDocPresent,
    discoveredCollections: scan.discoveredCollections,
    unknownCollections: scan.unknownCollections,
    totalDocuments: scan.totalDocuments,
    nestedDocuments: scan.nestedDocuments,
    nestedPathCount: scan.nestedPaths.length,
    shagrirCoverage: scan.shagrirCoverage,
    byCollection: summarizeCounts(scan),
  };
}

function dedupeOwnership(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.collection}:${item.documentId}:${item.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * APPLY is intentionally not implemented for execution in this task.
 * This stub enforces backup + apply flag requirements for tests.
 */
export function assertApplyPreconditions({
  applyFlag = false,
  backupCompleted = false,
  backupTargetUid = null,
  backupRunId = null,
  runId = null,
  targetUid = null,
  planFresh = true,
} = {}) {
  if (!applyFlag) {
    throw new Error('APPLY refused: explicit --apply flag required');
  }
  if (!runId) {
    throw new Error('APPLY refused: exact run ID required');
  }
  if (!backupCompleted) {
    throw new Error('APPLY refused: TARGET backup required');
  }
  if (backupTargetUid !== targetUid) {
    throw new Error('APPLY refused: backup target UID mismatch');
  }
  if (backupRunId !== runId) {
    throw new Error('APPLY refused: backup run ID mismatch');
  }
  if (!planFresh) {
    throw new Error('APPLY refused: stale plan / TARGET precondition failed');
  }
  return true;
}
