import {
  classifyFieldRole,
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

function splitEligibleMissingFields(fields) {
  const eligible = [];
  const blocked = [];
  for (const field of fields) {
    const role = classifyFieldRole(field);
    if (role === 'SOURCE_AUTHORITATIVE' || role === 'OWNERSHIP') eligible.push(field);
    else blocked.push(field);
  }
  return { eligible, blocked };
}

/**
 * Compare one logical collection between source and target inventories.
 * TARGET_ONLY is always reported for metrics; never generates delete ops.
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
        const { eligible, blocked } = splitEligibleMissingFields(missingFields);
        diffs.push({
          type: DIFF.MISSING_FIELD,
          collection,
          documentId: id,
          fields: missingFields,
          eligibleFields: eligible,
          blockedFields: blocked,
          // Never overwrite existing target values; only add missing eligible fields.
          plannedAction: eligible.length ? 'add-missing-fields' : 'skip-unknown-or-local-fields',
          sourcePath: sourceDoc.path,
          targetPath: targetDoc.path,
          sourceHash: fingerprintDocument(sourceDoc.data),
          targetHash: fingerprintDocument(targetDoc.data),
        });
      }
      if (changedFields.length) {
        // Existing target values that differ — report only under MISSING_ONLY.
        diffs.push({
          type: DIFF.SOURCE_CHANGED,
          collection,
          documentId: id,
          fields: changedFields,
          plannedAction: 'skip-missing-only-no-overwrite',
        });
      }
      continue;
    }

    if (mode === MODES.SOURCE_CHANGES) {
      if (missingFields.length) {
        const { eligible, blocked } = splitEligibleMissingFields(missingFields);
        diffs.push({
          type: DIFF.MISSING_FIELD,
          collection,
          documentId: id,
          fields: missingFields,
          eligibleFields: eligible,
          blockedFields: blocked,
        });
      }
      if (changedFields.length) {
        const authoritative = changedFields.filter((f) => classifyFieldRole(f) === 'SOURCE_AUTHORITATIVE');
        const unknown = changedFields.filter((f) => classifyFieldRole(f) === 'UNKNOWN');
        const local = changedFields.filter((f) => classifyFieldRole(f) === 'TARGET_LOCAL');
        diffs.push({
          type: authoritative.length ? DIFF.SOURCE_CHANGED : DIFF.CONFLICT,
          collection,
          documentId: id,
          fields: changedFields,
          authoritativeFields: authoritative,
          unknownFields: unknown,
          targetLocalFields: local,
          plannedAction: authoritative.length && !unknown.length
            ? 'update-source-authoritative'
            : 'report-conflict-no-auto-overwrite',
        });
      }
      continue;
    }

    // FULL_RECONCILE
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

  // Always report TARGET_ONLY for metrics (never delete).
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

/**
 * Build write plan. NEVER emits DELETE operations.
 */
export function planWritesFromDiffs(diffs, { mode = MODES.MISSING_ONLY } = {}) {
  const operations = [];
  for (const diff of diffs) {
    if (diff.type === DIFF.TARGET_ONLY) continue; // never delete
    if (String(diff.op || '').toUpperCase().includes('DELETE')) {
      throw new Error('Delete operations are forbidden');
    }

    if (diff.type === DIFF.MISSING_DOCUMENT) {
      if (mode === MODES.MISSING_ONLY
        || mode === MODES.SOURCE_CHANGES
        || mode === MODES.FULL_RECONCILE) {
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
      continue;
    }

    if (mode === MODES.MISSING_ONLY
      && diff.type === DIFF.MISSING_FIELD
      && Array.isArray(diff.eligibleFields)
      && diff.eligibleFields.length) {
      operations.push({
        op: 'ADD_MISSING_FIELDS',
        collection: diff.collection,
        documentId: diff.documentId,
        fields: diff.eligibleFields,
        sourcePath: diff.sourcePath,
        targetPath: diff.targetPath,
        sourceHash: diff.sourceHash,
        targetPreconditionHash: diff.targetHash,
        // Merge-only: never overwrite existing keys.
        merge: true,
        overwriteExisting: false,
      });
    }
  }

  assertNoDeleteOperations(operations);
  return operations;
}

export function assertNoDeleteOperations(operations) {
  for (const op of operations || []) {
    const name = String(op.op || '').toUpperCase();
    if (name.includes('DELETE') || name.includes('REMOVE') || name === 'DROP') {
      throw new Error(`Forbidden delete operation generated: ${op.op}`);
    }
  }
  return true;
}

export function collectionsForMode() {
  return defaultCopyCollections({ includeWeb: false });
}
