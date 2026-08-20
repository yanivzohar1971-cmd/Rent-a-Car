import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Target backup helper. Writes only when explicitly invoked (future APPLY).
 * DRY RUN must never call writeBackup.
 */
export function buildBackupManifest({
  runId,
  targetUid,
  scan,
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    runId,
    targetUid,
    createdAt,
    kind: 'TARGET_USER_SCOPED_BACKUP',
    totalDocuments: scan?.totalDocuments || 0,
    collections: scan?.byCollection || {},
    nestedDocuments: scan?.nestedDocuments || 0,
  };
}

export function writeBackup({
  backupDir,
  runId,
  targetUid,
  documentsByCollection,
  writeEnabled = false,
} = {}) {
  if (!writeEnabled) {
    throw new Error('Backup write refused: writeEnabled=false (DRY RUN safety)');
  }
  if (!runId || !targetUid) throw new Error('runId and targetUid required for backup');
  const dir = resolve(backupDir, `${runId}-${targetUid}`);
  mkdirSync(dir, { recursive: true });
  const manifest = {
    runId,
    targetUid,
    createdAt: new Date().toISOString(),
    collections: {},
  };
  let total = 0;
  for (const [collection, docs] of Object.entries(documentsByCollection || {})) {
    const safeDocs = (docs || []).map((doc) => ({
      id: doc.id,
      path: doc.path,
      data: doc.data,
    }));
    writeFileSync(resolve(dir, `${collection}.json`), `${JSON.stringify(safeDocs, null, 2)}\n`, 'utf8');
    manifest.collections[collection] = safeDocs.length;
    total += safeDocs.length;
  }
  manifest.totalDocuments = total;
  writeFileSync(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { dir, manifest };
}
