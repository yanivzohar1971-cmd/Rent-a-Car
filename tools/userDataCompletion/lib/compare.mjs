import {
  fingerprintDocument,
  ownershipNormalizedEquals,
  transformOwnershipFields,
} from './ownership.mjs';
import { classifyCollection, defaultCopyCollections } from './schema.mjs';

export const DIFF = Object.freeze({
  IDENTICAL: 'IDENTICAL',
  MISSING_DOCUMENT: 'MISSING_DOCUMENT',
  MISSING_FIELD: 'MISSING_FIELD',
  SOURCE_CHANGED: 'SOURCE_CHANGED',
  TARGET_ONLY: 'TARGET_ONLY',
  CONFLICT: 'CONFLICT',
  UNKNOWN_SCOPE: 'UNKNOWN_SCOPE',
  EXCLUDED_SHARED_GLOBAL: 'EXCLUDED_SHARED_GLOBAL',
});

export const MODES = Object.freeze({
  MISSING_ONLY: 'missing-only',
  SOURCE_CHANGES: 'source-changes',
  FULL_RECONCILE: 'full-reconcile',
});

function mapById(docs) {
  const map = new Map();
  for (const doc of docs) map.set(doc.id, doc);
  return map;
}

function fieldDiff(sourceData, targetData, { sourceUid, targetUid }) {
  const { data: normalized } = transformOwnershipFields(sourceData || {}, { sourceUid, targetUid });
  const missingFields = [];
  const changedFields = [];
  const sourceKeys = Object.keys(normalized || {});
  const targetKeys = new Set(Object.keys(targetData || {}));
  for (const key of sourceKeys) {
    if (!targetKeys.has(key)) {
      missingFields.push(key);
      continue;
    }
    if (fingerprintDocument({ [key]: normalized[key] }) !== fingerprintDocument({ [key]: targetData[key] })) {
      changedFields.push(key);
    }
  }
  return { missingFields, changedFields };
}

/**
 * Compare one logical collection between source and target inventories.
 */
export function compareCollection({
  collection,
  sourceDocs,
  targetDocs,
  sourceUid,
  targetUid,
  mode = MODES.MISSING_ONLY,
}) {
  const scope = classifyCollection(collection);
  if (scope === 'SHARED_GLOBAL') {
    return {
      collection,
      scope,
      diffs: [{
        type: DIFF.EXCLUDED_SHARED_GLOBAL,
        collection,
        documentId: null,
      }],
      counts: emptyCounts(),
    };
  }
  if (scope === 'UNKNOWN') {
    return {
      collection,
      scope,
      diffs: [{
        type: DIFF.UNKNOWN_SCOPE,
        collection,
        documentId: null,
      }],
      counts: emptyCounts(),
    };
  }

  const sourceMap = mapById(sourceDocs || []);
  const targetMap = mapById(targetDocs || []);
  const diffs = [];

  for (const [id, sourceDoc] of sourceMap.entries()) {
    const targetDoc = targetMap.get(id);
    if (!targetDoc) {
      diffs.push({
        type: DIFF.MISSING_DOCUMENT,
        collection,
        documentId: id,
        sourcePath: sourceDoc.path,
        targetPath: `users/${targetUid}/${collection}/${id}`,
        sourceHash: fingerprintDocument(sourceDoc.data),
        ownershipTransforms: transformOwnershipFields(sourceDoc.data, { sourceUid, targetUid }).transforms,
      });
      continue;
    }

    if (ownershipNormalizedEquals(sourceDoc.data, targetDoc.data, { sourceUid, targetUid })) {
      diffs.push({
        type: DIFF.IDENTICAL,
        collection,
        documentId: id,
        sourceHash: fingerprintDocument(sourceDoc.data),
        targetHash: fingerprintDocument(targetDoc.data),
      });
      continue;
    }

    const { missingFields, changedFields } = fieldDiff(sourceDoc.data, targetDoc.data, {
      sourceUid,
      targetUid,
    });

    if (mode === MODES.MISSING_ONLY) {
      if (missingFields.length) {
        diffs.push({
          type: DIFF.MISSING_FIELD,
          collection,
          documentId: id,
          fields: missingFields,
          // MISSING_ONLY never overwrites existing target values.
          plannedAction: 'skip-existing-doc',
        });
      } else {
        // Doc exists with overlapping fields that differ — not written in MISSING_ONLY.
        diffs.push({
          type: DIFF.SOURCE_CHANGED,
          collection,
          documentId: id,
          fields: changedFields,
          plannedAction: 'skip-missing-only',
        });
      }
      continue;
    }

    if (missingFields.length && !changedFields.length) {
      diffs.push({
        type: DIFF.MISSING_FIELD,
        collection,
        documentId: id,
        fields: missingFields,
      });
    } else if (changedFields.length) {
      diffs.push({
        type: DIFF.SOURCE_CHANGED,
        collection,
        documentId: id,
        fields: changedFields,
        missingFields,
      });
    } else {
      diffs.push({
        type: DIFF.CONFLICT,
        collection,
        documentId: id,
        reason: 'non-equivalent-after-ownership-normalize',
      });
    }
  }

  if (mode === MODES.FULL_RECONCILE || mode === MODES.SOURCE_CHANGES) {
    for (const [id, targetDoc] of targetMap.entries()) {
      if (sourceMap.has(id)) continue;
      diffs.push({
        type: DIFF.TARGET_ONLY,
        collection,
        documentId: id,
        targetPath: targetDoc.path,
        plannedAction: 'report-only-no-delete',
      });
    }
  }

  return {
    collection,
    scope,
    diffs,
    counts: countDiffs(diffs),
  };
}

function emptyCounts() {
  return {
    IDENTICAL: 0,
    MISSING_DOCUMENT: 0,
    MISSING_FIELD: 0,
    SOURCE_CHANGED: 0,
    TARGET_ONLY: 0,
    CONFLICT: 0,
    UNKNOWN_SCOPE: 0,
    EXCLUDED_SHARED_GLOBAL: 0,
  };
}

export function countDiffs(diffs) {
  const counts = emptyCounts();
  for (const diff of diffs) {
    if (counts[diff.type] != null) counts[diff.type] += 1;
  }
  return counts;
}

export function mergeCounts(list) {
  const out = emptyCounts();
  for (const counts of list) {
    for (const key of Object.keys(out)) {
      out[key] += counts[key] || 0;
    }
  }
  return out;
}

export function planWritesFromDiffs(diffs, { mode = MODES.MISSING_ONLY } = {}) {
  const operations = [];
  for (const diff of diffs) {
    if (mode === MODES.MISSING_ONLY && diff.type === DIFF.MISSING_DOCUMENT) {
      operations.push({
        op: 'CREATE_DOCUMENT',
        collection: diff.collection,
        documentId: diff.documentId,
        sourcePath: diff.sourcePath,
        targetPath: diff.targetPath,
        sourceHash: diff.sourceHash,
        ownershipTransforms: diff.ownershipTransforms || [],
      });
    }
    // SOURCE_CHANGES / FULL_RECONCILE field updates are planned but APPLY is out of scope now.
    if ((mode === MODES.SOURCE_CHANGES || mode === MODES.FULL_RECONCILE)
      && (diff.type === DIFF.MISSING_DOCUMENT)) {
      operations.push({
        op: 'CREATE_DOCUMENT',
        collection: diff.collection,
        documentId: diff.documentId,
        sourcePath: diff.sourcePath,
        targetPath: diff.targetPath,
        sourceHash: diff.sourceHash,
        ownershipTransforms: diff.ownershipTransforms || [],
      });
    }
  }
  return operations;
}

export function collectionsForMode() {
  return defaultCopyCollections({ includeWeb: false });
}
