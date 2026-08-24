import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { assertNoDeleteOperations } from './compare.mjs';
import { assertApplyPreconditions } from './engine.mjs';
import { fingerprintDocument, transformOwnershipFields } from './ownership.mjs';
import { writeBackup } from './backup.mjs';
import { assertNoWriteMethods } from './adapters.mjs';

const DEFAULT_BATCH_SIZE = 200;

const DEPENDENCY_ORDER = [
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
  '__userRoot__',
];

/**
 * Load and validate an existing dry-run plan. Never regenerates under the same runId.
 */
export function loadAndValidatePlan(planPath, {
  expectedRunId,
  expectedSourceUid,
  expectedTargetUid,
  expectedMode = 'missing-only',
} = {}) {
  if (!planPath || !existsSync(planPath)) {
    throw new Error(`Plan not found: ${planPath}`);
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));

  if (plan.runId !== expectedRunId) {
    throw new Error(`Plan runId mismatch: expected ${expectedRunId}, got ${plan.runId}`);
  }
  if (plan.sourceUid !== expectedSourceUid) {
    throw new Error(`Plan sourceUid mismatch`);
  }
  if (plan.targetUid !== expectedTargetUid) {
    throw new Error(`Plan targetUid mismatch`);
  }
  if (String(plan.mode || '').toLowerCase() !== String(expectedMode).toLowerCase()) {
    throw new Error(`Plan mode mismatch: expected ${expectedMode}, got ${plan.mode}`);
  }
  if (!Array.isArray(plan.operations)) {
    throw new Error('Plan operations missing or invalid');
  }

  assertNoDeleteOperations(plan.operations);

  for (const op of plan.operations) {
    const name = String(op.op || '').toUpperCase();
    if (name.includes('SOURCE') && name.includes('WRITE')) {
      throw new Error(`Forbidden SOURCE write operation in plan: ${op.op}`);
    }
    if (op.targetPath && !String(op.targetPath).startsWith(`users/${expectedTargetUid}`)) {
      throw new Error(`Operation targetPath outside TARGET UID: ${op.targetPath}`);
    }
    if (op.sourcePath && !String(op.sourcePath).startsWith(`users/${expectedSourceUid}`)) {
      throw new Error(`Operation sourcePath outside SOURCE UID: ${op.sourcePath}`);
    }
    if (op.overwriteExisting === true) {
      throw new Error('Plan contains overwriteExisting=true which is forbidden for MISSING_ONLY APPLY');
    }
  }

  const creates = plan.operations.filter((op) => op.op === 'CREATE_DOCUMENT');
  const fieldAdds = plan.operations.filter((op) => op.op === 'ADD_MISSING_FIELDS');
  const other = plan.operations.filter(
    (op) => op.op !== 'CREATE_DOCUMENT' && op.op !== 'ADD_MISSING_FIELDS',
  );
  if (other.length) {
    throw new Error(`Plan contains unexpected operation types: ${[...new Set(other.map((o) => o.op))].join(',')}`);
  }

  return {
    plan,
    createCount: creates.length,
    fieldAddCount: fieldAdds.length,
    operations: sortOperations(plan.operations, plan.dependencyOrder || DEPENDENCY_ORDER),
  };
}

export function sortOperations(operations, order = DEPENDENCY_ORDER) {
  const rank = new Map(order.map((name, index) => [name, index]));
  return [...operations].sort((a, b) => {
    const ra = rank.has(a.collection) ? rank.get(a.collection) : 1000;
    const rb = rank.has(b.collection) ? rank.get(b.collection) : 1000;
    if (ra !== rb) return ra - rb;
    return String(a.documentId).localeCompare(String(b.documentId), 'en');
  });
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Build TARGET backup from a live scan (docs included).
 */
export function backupTargetFromScan({
  backupDir,
  runId,
  targetUid,
  targetScan,
} = {}) {
  const documentsByCollection = {};
  for (const [name, info] of Object.entries(targetScan.byCollection || {})) {
    if (info?.nested) continue;
    documentsByCollection[name] = (info.docs || []).map((doc) => ({
      id: doc.id,
      path: doc.path,
      data: doc.data,
    }));
  }
  if (targetScan.userDocPresent && targetScan.userDoc) {
    documentsByCollection.__userRoot__ = [{
      id: targetUid,
      path: `users/${targetUid}`,
      data: targetScan.userDoc.data,
    }];
  }

  const result = writeBackup({
    backupDir,
    runId,
    targetUid,
    documentsByCollection,
    writeEnabled: true,
  });

  const sum = Object.values(result.manifest.collections).reduce((a, b) => a + b, 0);
  if (sum !== result.manifest.totalDocuments) {
    throw new Error('Backup manifest count inconsistency');
  }
  if (result.manifest.runId !== runId || result.manifest.targetUid !== targetUid) {
    throw new Error('Backup manifest identity mismatch');
  }

  // Re-read manifest to confirm readable
  const reloaded = readJson(resolve(result.dir, 'manifest.json'));
  if (reloaded.totalDocuments !== result.manifest.totalDocuments) {
    throw new Error('Backup manifest failed reload validation');
  }

  return result;
}

/**
 * Execute MISSING_ONLY APPLY for a validated plan.
 * SOURCE adapter must remain write-free. TARGET adapter must be write-enabled.
 */
export async function runApplyMissingOnly({
  planPath,
  runId,
  sourceUid,
  targetUid,
  mode = 'missing-only',
  sourceAdapter,
  targetAdapter,
  targetScan,
  backupDir,
  checkpointDir,
  auditDir,
  batchSize = DEFAULT_BATCH_SIZE,
  expectedCreateCount = null,
} = {}) {
  assertNoWriteMethods(sourceAdapter);
  if (!targetAdapter.writeEnabled) {
    throw new Error('APPLY refused: target adapter writeEnabled must be true');
  }

  const { plan, operations, createCount, fieldAddCount } = loadAndValidatePlan(planPath, {
    expectedRunId: runId,
    expectedSourceUid: sourceUid,
    expectedTargetUid: targetUid,
    expectedMode: mode,
  });

  if (expectedCreateCount != null && createCount !== expectedCreateCount) {
    throw new Error(
      `Plan create count mismatch: expected ${expectedCreateCount}, got ${createCount}`,
    );
  }
  if (fieldAddCount !== 0 && mode === 'missing-only' && expectedCreateCount != null) {
    // Approved run had 0 field additions; refuse unexpected field ops under this explicit approval.
    throw new Error(`Approved MISSING_ONLY APPLY expected 0 field additions, got ${fieldAddCount}`);
  }

  // Only CREATE_DOCUMENT for this approved apply (field adds out of approved scope if present)
  const createOps = operations.filter((op) => op.op === 'CREATE_DOCUMENT');

  const startedAt = new Date().toISOString();
  const runDir = resolve(checkpointDir, runId);
  mkdirSync(runDir, { recursive: true });
  const checkpointPath = resolve(runDir, 'checkpoint.json');

  let checkpoint = existsSync(checkpointPath)
    ? readJson(checkpointPath)
    : {
      runId,
      mode,
      sourceUid,
      targetUid,
      plannedOperationCount: createOps.length,
      completedOperationCount: 0,
      skippedOperationCount: 0,
      failedOperationCount: 0,
      lastCompletedBatch: -1,
      createdKeys: [],
      skippedKeys: [],
      skipped: [],
      failed: [],
      status: 'STARTED',
      startedAt,
      updatedAt: startedAt,
      firestoreWrites: 0,
      sourceWrites: 0,
      authWrites: 0,
      storageWrites: 0,
      deletes: 0,
    };

  if (checkpoint.runId !== runId || checkpoint.targetUid !== targetUid) {
    throw new Error('Checkpoint identity mismatch — refusing APPLY');
  }

  // Migrate older checkpoint shape if present.
  checkpoint.createdKeys ||= [];
  checkpoint.skippedKeys ||= [];
  if (Array.isArray(checkpoint.completedKeys) && !checkpoint.createdKeys.length) {
    checkpoint.createdKeys = checkpoint.completedKeys;
  }

  const backup = backupTargetFromScan({
    backupDir,
    runId,
    targetUid,
    targetScan,
  });

  assertApplyPreconditions({
    applyFlag: true,
    backupCompleted: true,
    backupTargetUid: backup.manifest.targetUid,
    backupRunId: backup.manifest.runId,
    runId,
    targetUid,
    planFresh: true,
  });

  checkpoint.status = 'APPLYING';
  checkpoint.backupDir = backup.dir;
  checkpoint.backupTotalDocuments = backup.manifest.totalDocuments;
  checkpoint.updatedAt = new Date().toISOString();
  writeJson(checkpointPath, checkpoint);

  // Index SOURCE docs by collection for O(1) lookup (read-only).
  const sourceIndex = await buildSourceIndex(sourceAdapter, createOps);

  const createdSet = new Set(checkpoint.createdKeys || []);
  const skippedSet = new Set(checkpoint.skippedKeys || []);
  const results = {
    plannedCreates: createOps.length,
    successfulCreates: createdSet.size,
    skippedTargetExists: 0,
    skippedSourceMissing: 0,
    skippedHashMismatch: 0,
    conflicts: 0,
    failures: 0,
    retries: 0,
    firestoreWrites: checkpoint.firestoreWrites || 0,
    ownershipTransformsApplied: 0,
    verifiedSamples: [],
  };

  // Recount skip categories from checkpoint notes on resume.
  for (const item of checkpoint.skipped || []) {
    if (item.reason === 'SKIPPED_TARGET_NOW_EXISTS') results.skippedTargetExists += 1;
    else if (item.reason === 'SKIPPED_SOURCE_MISSING') {
      results.skippedSourceMissing += 1;
      results.conflicts += 1;
    } else if (item.reason === 'SKIPPED_SOURCE_HASH_MISMATCH') {
      results.skippedHashMismatch += 1;
      results.conflicts += 1;
    }
  }

  const batches = chunk(createOps, batchSize);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    for (const op of batch) {
      const key = `${op.collection}/${op.documentId}`;
      if (createdSet.has(key) || skippedSet.has(key)) {
        continue;
      }

      try {
        const outcome = await applyOneCreate({
          op,
          sourceUid,
          targetUid,
          sourceIndex,
          targetAdapter,
        });

        if (outcome.status === 'CREATED') {
          results.successfulCreates += 1;
          results.firestoreWrites += 1;
          results.ownershipTransformsApplied += outcome.ownershipTransforms || 0;
          createdSet.add(key);
          if (results.verifiedSamples.length < 5) {
            results.verifiedSamples.push({
              collection: op.collection,
              documentId: op.documentId,
              targetPath: op.targetPath,
              sourceHashOk: outcome.sourceHashOk,
            });
          }
        } else if (outcome.status === 'SKIPPED_TARGET_NOW_EXISTS') {
          results.skippedTargetExists += 1;
          skippedSet.add(key);
          checkpoint.skipped.push({ key, reason: outcome.status });
        } else if (outcome.status === 'SKIPPED_SOURCE_MISSING') {
          results.skippedSourceMissing += 1;
          results.conflicts += 1;
          skippedSet.add(key);
          checkpoint.skipped.push({ key, reason: outcome.status });
        } else if (outcome.status === 'SKIPPED_SOURCE_HASH_MISMATCH') {
          results.skippedHashMismatch += 1;
          results.conflicts += 1;
          skippedSet.add(key);
          checkpoint.skipped.push({ key, reason: outcome.status });
        } else {
          results.failures += 1;
          checkpoint.failed.push({ key, reason: outcome.status, message: outcome.message });
        }
      } catch (error) {
        const code = error?.code;
        if (code === 6 || code === 'already-exists' || /ALREADY_EXISTS/i.test(String(error?.message || ''))) {
          results.skippedTargetExists += 1;
          skippedSet.add(key);
          checkpoint.skipped.push({ key, reason: 'SKIPPED_TARGET_NOW_EXISTS' });
        } else {
          results.failures += 1;
          checkpoint.failed.push({
            key,
            reason: 'EXCEPTION',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    checkpoint.lastCompletedBatch = batchIndex;
    checkpoint.createdKeys = [...createdSet];
    checkpoint.skippedKeys = [...skippedSet];
    checkpoint.completedOperationCount = createdSet.size + skippedSet.size;
    checkpoint.skippedOperationCount = skippedSet.size;
    checkpoint.failedOperationCount = checkpoint.failed.length;
    checkpoint.firestoreWrites = results.firestoreWrites;
    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.status = batchIndex === batches.length - 1 ? 'APPLY_COMPLETE' : 'APPLYING';
    writeJson(checkpointPath, checkpoint);
  }

  const completedAt = new Date().toISOString();
  const audit = {
    runId,
    mode,
    sourceUid,
    targetUid,
    identityVerification: 'PASS',
    backupStatus: 'PASS',
    backupArtifactPath: backup.dir,
    backupDocumentCount: backup.manifest.totalDocuments,
    plannedOperations: createOps.length,
    createdDocuments: results.successfulCreates,
    skippedDocuments: {
      targetAlreadyExists: results.skippedTargetExists,
      sourceMissing: results.skippedSourceMissing,
      sourceHashMismatch: results.skippedHashMismatch,
    },
    failedOperations: results.failures,
    conflicts: results.conflicts,
    executedWrites: {
      firestore: results.firestoreWrites,
      source: 0,
      auth: 0,
      storage: 0,
      deletes: 0,
    },
    ownershipTransformsApplied: results.ownershipTransformsApplied,
    verifiedSamples: results.verifiedSamples,
    checkpointPath,
    startedAt,
    completedAt,
    status: results.failures === 0 ? 'APPLY_SUCCESS' : 'APPLY_PARTIAL',
    sourceChangedApplied: false,
    targetOnlyDeleted: false,
    warnings: [
      ...(results.skippedTargetExists
        ? [`${results.skippedTargetExists} creates skipped because TARGET already existed`]
        : []),
      ...(results.skippedHashMismatch
        ? [`${results.skippedHashMismatch} creates skipped due to SOURCE hash mismatch`]
        : []),
    ],
    errors: checkpoint.failed.slice(0, 50),
  };

  const auditPath = resolve(auditDir, `apply-audit-${runId}.json`);
  writeJson(auditPath, audit);

  return {
    plan,
    backup,
    checkpointPath,
    auditPath,
    audit,
    results,
  };
}

async function buildSourceIndex(sourceAdapter, createOps) {
  const collections = [...new Set(createOps.map((op) => op.collection).filter((c) => c !== '__userRoot__'))];
  const index = new Map();
  for (const collection of collections) {
    const docs = await sourceAdapter.listDocuments(collection);
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    index.set(collection, byId);
  }
  if (createOps.some((op) => op.collection === '__userRoot__')) {
    const userDoc = await sourceAdapter.getUserDoc();
    index.set('__userRoot__', new Map([[sourceAdapter.uid, userDoc]]));
  }
  return index;
}

async function applyOneCreate({
  op,
  sourceUid,
  targetUid,
  sourceIndex,
  targetAdapter,
}) {
  if (op.collection === '__userRoot__') {
    const existing = await targetAdapter.getUserDoc();
    if (existing) {
      return { status: 'SKIPPED_TARGET_NOW_EXISTS' };
    }
    const sourceDoc = sourceIndex.get('__userRoot__')?.get(sourceUid);
    if (!sourceDoc) return { status: 'SKIPPED_SOURCE_MISSING' };
    const { data, transforms } = transformOwnershipFields(sourceDoc.data, { sourceUid, targetUid });
    if (op.sourceHash) {
      const hash = fingerprintDocument(sourceDoc.data);
      if (hash !== op.sourceHash) {
        return { status: 'SKIPPED_SOURCE_HASH_MISMATCH', sourceHashOk: false };
      }
    }
    await targetAdapter.createUserDoc(data);
    return {
      status: 'CREATED',
      ownershipTransforms: transforms.length,
      sourceHashOk: true,
    };
  }

  const exists = await targetAdapter.documentExists(op.collection, op.documentId);
  if (exists) {
    return { status: 'SKIPPED_TARGET_NOW_EXISTS' };
  }

  const sourceDoc = sourceIndex.get(op.collection)?.get(op.documentId);
  if (!sourceDoc) {
    return { status: 'SKIPPED_SOURCE_MISSING' };
  }

  if (op.sourceHash) {
    const hash = fingerprintDocument(sourceDoc.data);
    if (hash !== op.sourceHash) {
      return { status: 'SKIPPED_SOURCE_HASH_MISMATCH', sourceHashOk: false };
    }
  }

  const { data, transforms } = transformOwnershipFields(sourceDoc.data, { sourceUid, targetUid });
  await targetAdapter.createDocument(op.collection, op.documentId, data);
  return {
    status: 'CREATED',
    ownershipTransforms: transforms.length,
    sourceHashOk: true,
  };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
