import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNoWriteMethods } from './adapters.mjs';
import { compareCollection, DIFF, collectionsForMode, MODES } from './compare.mjs';
import { canonicalize, classifyFieldRole, transformOwnershipFields } from './ownership.mjs';
import { OWNERSHIP_FIELD_NAMES } from './schema.mjs';

export const DIFF_CLASS = Object.freeze({
  SHAGRIR_CRITICAL: 'SHAGRIR_CRITICAL',
  BUSINESS_RELEVANT_NOT_SHAGRIR: 'BUSINESS_RELEVANT_NOT_SHAGRIR',
  TARGET_LOCAL: 'TARGET_LOCAL',
  IRRELEVANT: 'IRRELEVANT',
  UNKNOWN: 'UNKNOWN',
});

/** Fields that can materially affect Shagrir exact-match reconciliation / lifecycle. */
export const SHAGRIR_CRITICAL_FIELDS = Object.freeze([
  'supplierOrderNumber',
  'externalContractNumber',
  'supplierId',
  'dateFrom',
  'dateTo',
  'actualReturnDate',
  'status',
  'isClosed',
  'periodTypeDays',
  'periodType',
  'commissionPercentUsed',
  'commissionAmount',
  'commissionPercent',
  'agreedPrice',
  'branchId',
  'agentId',
  'isQuote',
]);

const TIMESTAMPISH = new Set(['createdAt', 'updatedAt', 'lastSyncedAt', 'syncedAt', 'updated_at', 'created_at']);
const SYNC_META = new Set(['syncStatus', 'cloudSynced', 'localDirty', 'pendingSync']);

/**
 * Detect Shagrir supplier from real schema fields (name / commission email / domain).
 * Does not invent IDs.
 */
export function isShagrirSupplier(supplierDoc) {
  const data = supplierDoc?.data || supplierDoc || {};
  const name = String(data.name || '');
  const email = String(data.commissionReportEmail || data.email || '').toLowerCase();
  if (name.includes('שגריר')) return true;
  if (/shagrir/i.test(name)) return true;
  if (email.includes('shagrir.co.il')) return true;
  if (email.includes('@shagrir.')) return true;
  return false;
}

export function describeFirestoreType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return Number.isInteger(value) ? 'number:int' : 'number:float';
  if (t === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'array';
  if (t === 'object') {
    if (typeof value.toDate === 'function' && typeof value.toMillis === 'function') return 'timestamp';
    if (value.constructor?.name === 'Timestamp') return 'timestamp';
    if (value.constructor?.name === 'GeoPoint') return 'geopoint';
    if (typeof value.path === 'string' && typeof value.id === 'string'
      && (typeof value.get === 'function' || value.constructor?.name === 'DocumentReference')) {
      return 'reference';
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return 'bytes';
    return 'map';
  }
  return t;
}

/** Sanitized value summary — no PII payloads. */
export function sanitizeValueSummary(value) {
  const type = describeFirestoreType(value);
  if (type === 'null' || type === 'undefined') {
    return { type, present: false, blank: false, leadingZero: false, hash8: null, length: 0 };
  }
  if (type === 'string') {
    const s = value;
    return {
      type,
      present: true,
      blank: s.length === 0,
      leadingZero: s.length > 1 && s.startsWith('0') && /^0\d+$/.test(s),
      length: s.length,
      hash8: createHash('sha256').update(s).digest('hex').slice(0, 8),
    };
  }
  if (type.startsWith('number')) {
    return {
      type,
      present: true,
      blank: false,
      leadingZero: false,
      length: null,
      hash8: createHash('sha256').update(String(value)).digest('hex').slice(0, 8),
    };
  }
  if (type === 'boolean') {
    return { type, present: true, blank: false, leadingZero: false, value: value, hash8: null, length: null };
  }
  const canon = JSON.stringify(canonicalize(value));
  return {
    type,
    present: true,
    blank: false,
    leadingZero: false,
    length: canon.length,
    hash8: createHash('sha256').update(canon).digest('hex').slice(0, 8),
  };
}

export function classifyChangedFields(fields, { collection, isShagrirDoc = false } = {}) {
  const list = [...(fields || [])];
  if (!list.length) return DIFF_CLASS.UNKNOWN;

  const ownershipOnly = list.every((f) => OWNERSHIP_FIELD_NAMES.includes(f));
  if (ownershipOnly) return DIFF_CLASS.IRRELEVANT;

  const allLocal = list.every((f) => {
    const role = classifyFieldRole(f);
    return role === 'TARGET_LOCAL' || TIMESTAMPISH.has(f) || SYNC_META.has(f);
  });
  if (allLocal) return DIFF_CLASS.TARGET_LOCAL;

  const criticalHit = list.some((f) => SHAGRIR_CRITICAL_FIELDS.includes(f));
  // Only Shagrir-linked docs are SHAGRIR_CRITICAL; other suppliers are business-relevant.
  if (criticalHit && isShagrirDoc) {
    return DIFF_CLASS.SHAGRIR_CRITICAL;
  }

  // Non-critical business fields on reservations/suppliers still business-relevant
  if (['reservations', 'suppliers', 'branches', 'agents', 'carSales', 'carSaleCommissionPayments'].includes(collection)) {
    const onlyTimestamps = list.every((f) => TIMESTAMPISH.has(f) || SYNC_META.has(f));
    if (onlyTimestamps) return DIFF_CLASS.IRRELEVANT;
    if (criticalHit) return DIFF_CLASS.BUSINESS_RELEVANT_NOT_SHAGRIR;
    return DIFF_CLASS.BUSINESS_RELEVANT_NOT_SHAGRIR;
  }

  if (['customers', 'cardStubs', 'requests', 'carTypes'].includes(collection)) {
    const onlyTimestamps = list.every((f) => TIMESTAMPISH.has(f) || SYNC_META.has(f));
    if (onlyTimestamps) return DIFF_CLASS.IRRELEVANT;
    return DIFF_CLASS.BUSINESS_RELEVANT_NOT_SHAGRIR;
  }

  if (list.every((f) => classifyFieldRole(f) === 'UNKNOWN' || TIMESTAMPISH.has(f))) {
    return DIFF_CLASS.UNKNOWN;
  }
  return DIFF_CLASS.UNKNOWN;
}

function fieldDiffDetails(sourceData, targetData, { sourceUid, targetUid }) {
  const { data: normalized } = transformOwnershipFields(sourceData || {}, { sourceUid, targetUid });
  const fields = [];
  const keys = new Set([
    ...Object.keys(normalized || {}),
    ...Object.keys(targetData || {}),
  ]);
  for (const key of keys) {
    const s = normalized?.[key];
    const t = targetData?.[key];
    const sPresent = Object.prototype.hasOwnProperty.call(normalized || {}, key);
    const tPresent = Object.prototype.hasOwnProperty.call(targetData || {}, key);
    if (!sPresent && !tPresent) continue;
    const sHash = sPresent ? JSON.stringify(canonicalize(s)) : null;
    const tHash = tPresent ? JSON.stringify(canonicalize(t)) : null;
    if (sHash === tHash) continue;
    fields.push({
      field: key,
      role: classifyFieldRole(key),
      ownershipRelated: OWNERSHIP_FIELD_NAMES.includes(key),
      shagrirCriticalField: SHAGRIR_CRITICAL_FIELDS.includes(key),
      source: sanitizeValueSummary(sPresent ? s : undefined),
      target: sanitizeValueSummary(tPresent ? t : undefined),
      sourcePresent: sPresent,
      targetPresent: tPresent,
    });
  }
  return fields;
}

export function analyzeIdentifierQuality(reservations) {
  const stats = {
    total: reservations.length,
    uniqueSupplierOrderNumber: 0,
    duplicateSupplierOrderNumberValues: 0,
    ambiguousDuplicateReservationCount: 0,
    nullCount: 0,
    blankCount: 0,
    stringCount: 0,
    numericCount: 0,
    otherTypeCount: 0,
    leadingZeroCount: 0,
    samples: [],
  };
  const byExact = new Map(); // key = type|serialized
  for (const doc of reservations) {
    const v = doc.data?.supplierOrderNumber;
    if (v == null) {
      stats.nullCount += 1;
      continue;
    }
    const type = describeFirestoreType(v);
    if (type === 'string') {
      stats.stringCount += 1;
      if (v.length === 0) stats.blankCount += 1;
      if (v.length > 1 && v.startsWith('0') && /^0\d+$/.test(v)) {
        stats.leadingZeroCount += 1;
        if (stats.samples.length < 3) {
          stats.samples.push({
            kind: 'leading-zero-string',
            length: v.length,
            hash8: createHash('sha256').update(v).digest('hex').slice(0, 8),
          });
        }
      }
    } else if (type.startsWith('number')) {
      stats.numericCount += 1;
      if (stats.samples.length < 3) {
        stats.samples.push({ kind: 'numeric-identifier', type });
      }
    } else {
      stats.otherTypeCount += 1;
    }
    const key = `${type}|${JSON.stringify(canonicalize(v))}`;
    if (!byExact.has(key)) byExact.set(key, []);
    byExact.get(key).push(doc.id);
  }
  let unique = 0;
  let dupValues = 0;
  let ambiguousRes = 0;
  for (const [, ids] of byExact) {
    if (ids.length === 1) unique += 1;
    else {
      dupValues += 1;
      ambiguousRes += ids.length;
    }
  }
  stats.uniqueSupplierOrderNumber = unique;
  stats.duplicateSupplierOrderNumberValues = dupValues;
  stats.ambiguousDuplicateReservationCount = ambiguousRes;
  return stats;
}

export function buildShagrirCoverage(reservations, shagrirSupplierIds) {
  const ids = new Set(shagrirSupplierIds.map(String));
  const shagrir = reservations.filter((doc) => ids.has(String(doc.data?.supplierId)));
  const coverage = {
    reservationsTotal: shagrir.length,
    withSupplierOrder: 0,
    withoutSupplierOrder: 0,
    withExternalContract: 0,
    withBoth: 0,
    withNeither: 0,
  };
  for (const doc of shagrir) {
    const so = doc.data?.supplierOrderNumber;
    const ec = doc.data?.externalContractNumber;
    const hasSo = so != null && !(typeof so === 'string' && so.length === 0);
    const hasEc = ec != null && !(typeof ec === 'string' && ec.length === 0);
    if (hasSo) coverage.withSupplierOrder += 1;
    else coverage.withoutSupplierOrder += 1;
    if (hasEc) coverage.withExternalContract += 1;
    if (hasSo && hasEc) coverage.withBoth += 1;
    if (!hasSo && !hasEc) coverage.withNeither += 1;
  }
  return { shagrirReservations: shagrir, coverage };
}

function reservationFieldDiffCounts(changedReservationAnalyses) {
  const counts = {
    totalChangedReservations: changedReservationAnalyses.length,
    supplierOrderNumber: 0,
    externalContractNumber: 0,
    supplierId: 0,
    dateFrom: 0,
    dateTo: 0,
    actualReturnDate: 0,
    statusOrClosed: 0,
    rentalPeriodType: 0,
    commissionRelated: 0,
    branchId: 0,
    agentId: 0,
    otherShagrirCritical: 0,
  };
  for (const item of changedReservationAnalyses) {
    const fields = new Set(item.differingFields.map((f) => f.field));
    if (fields.has('supplierOrderNumber')) counts.supplierOrderNumber += 1;
    if (fields.has('externalContractNumber')) counts.externalContractNumber += 1;
    if (fields.has('supplierId')) counts.supplierId += 1;
    if (fields.has('dateFrom')) counts.dateFrom += 1;
    if (fields.has('dateTo')) counts.dateTo += 1;
    if (fields.has('actualReturnDate')) counts.actualReturnDate += 1;
    if (fields.has('status') || fields.has('isClosed')) counts.statusOrClosed += 1;
    if (fields.has('periodTypeDays') || fields.has('periodType')) counts.rentalPeriodType += 1;
    if (fields.has('commissionPercentUsed') || fields.has('commissionAmount') || fields.has('commissionPercent')) {
      counts.commissionRelated += 1;
    }
    if (fields.has('branchId')) counts.branchId += 1;
    if (fields.has('agentId')) counts.agentId += 1;
    const other = [...fields].filter((f) => SHAGRIR_CRITICAL_FIELDS.includes(f)
      && ![
        'supplierOrderNumber', 'externalContractNumber', 'supplierId', 'dateFrom', 'dateTo',
        'actualReturnDate', 'status', 'isClosed', 'periodTypeDays', 'periodType',
        'commissionPercentUsed', 'commissionAmount', 'commissionPercent', 'branchId', 'agentId',
      ].includes(f));
    if (other.length) counts.otherShagrirCritical += 1;
  }
  return counts;
}

/**
 * Strictly read-only difference / Shagrir readiness analysis.
 */
export async function runAnalyzeDifferences({
  sourceAdapter,
  targetAdapter,
  sourceUid,
  targetUid,
  identity,
  scanUserTree,
  artifactDir,
} = {}) {
  assertNoWriteMethods(sourceAdapter);
  assertNoWriteMethods(targetAdapter);
  if (targetAdapter.writeEnabled) {
    throw new Error('analyze-differences refuses write-enabled target adapter');
  }

  const collections = collectionsForMode();
  const sourceScan = await scanUserTree(sourceAdapter, { collections });
  const targetScan = await scanUserTree(targetAdapter, { collections });

  const sourceChanged = [];
  const targetOnly = [];
  const byCollectionChanged = {};
  const byCollectionTargetOnly = {};
  const classCounts = {
    SHAGRIR_CRITICAL: 0,
    BUSINESS_RELEVANT_NOT_SHAGRIR: 0,
    TARGET_LOCAL: 0,
    IRRELEVANT: 0,
    UNKNOWN: 0,
  };

  for (const collection of collections) {
    const result = compareCollection({
      collection,
      sourceDocs: sourceScan.byCollection[collection]?.docs || [],
      targetDocs: targetScan.byCollection[collection]?.docs || [],
      sourceUid,
      targetUid,
      mode: MODES.FULL_RECONCILE,
    });

    const sourceMap = new Map((sourceScan.byCollection[collection]?.docs || []).map((d) => [d.id, d]));
    const targetMap = new Map((targetScan.byCollection[collection]?.docs || []).map((d) => [d.id, d]));

    for (const diff of result.diffs) {
      if (diff.type === DIFF.SOURCE_CHANGED || diff.type === DIFF.CONFLICT || diff.type === DIFF.MISSING_FIELD) {
        // Use full-reconcile changed docs; also catch field-level via ownershipNormalized mismatch path.
      }
      if (diff.type === DIFF.TARGET_ONLY) {
        const doc = targetMap.get(diff.documentId);
        const entry = {
          collection,
          documentId: diff.documentId,
          domain: collection,
        };
        targetOnly.push(entry);
        byCollectionTargetOnly[collection] = (byCollectionTargetOnly[collection] || 0) + 1;
        continue;
      }
    }

    // Detect SOURCE_CHANGED the same way MISSING_ONLY metrics did: not ownership-equal.
    for (const [id, sourceDoc] of sourceMap) {
      const targetDoc = targetMap.get(id);
      if (!targetDoc) continue;
      const { data: normalized } = transformOwnershipFields(sourceDoc.data, { sourceUid, targetUid });
      const equal = JSON.stringify(canonicalize(normalized)) === JSON.stringify(canonicalize(targetDoc.data));
      if (equal) continue;

      const differingFields = fieldDiffDetails(sourceDoc.data, targetDoc.data, { sourceUid, targetUid });
      const fieldNames = differingFields.map((f) => f.field);
      const supplierId = sourceDoc.data?.supplierId ?? targetDoc.data?.supplierId;
      const classification = classifyChangedFields(fieldNames, {
        collection,
        isShagrirDoc: false, // refined after supplier map
      });
      const record = {
        collection,
        documentId: id,
        domain: collection,
        differingFields,
        fieldNames,
        classification, // may refine
        supplierId: supplierId != null ? String(supplierId) : null,
        reviewRequiredBeforeShagrirTest: false,
      };
      sourceChanged.push(record);
      byCollectionChanged[collection] = (byCollectionChanged[collection] || 0) + 1;
    }
  }

  // Identify Shagrir suppliers from SOURCE (authoritative client data).
  const sourceSuppliers = sourceScan.byCollection.suppliers?.docs || [];
  const targetSuppliers = targetScan.byCollection.suppliers?.docs || [];
  const shagrirSuppliers = sourceSuppliers.filter(isShagrirSupplier).map((doc) => ({
    documentId: doc.id,
    businessId: doc.data?.id != null ? String(doc.data.id) : doc.id,
    displayName: String(doc.data?.name || '').includes('שגריר') ? 'שגריר' : 'Shagrir-matched',
    hasCommissionEmail: Boolean(doc.data?.commissionReportEmail),
    linkField: 'reservations.supplierId -> suppliers.id/documentId',
  }));
  const shagrirIds = shagrirSuppliers.map((s) => String(s.documentId));

  // Refine classifications with Shagrir supplier knowledge.
  for (const record of sourceChanged) {
    const isShagrirRes = record.collection === 'reservations'
      && record.supplierId
      && shagrirIds.includes(String(record.supplierId));
    const isShagrirSupplierDoc = record.collection === 'suppliers'
      && shagrirIds.includes(String(record.documentId));

    let classification = classifyChangedFields(record.fieldNames, {
      collection: record.collection,
      isShagrirDoc: isShagrirRes || isShagrirSupplierDoc,
    });

    // If reservation is Shagrir and any critical field differs → SHAGRIR_CRITICAL
    if (isShagrirRes && record.fieldNames.some((f) => SHAGRIR_CRITICAL_FIELDS.includes(f))) {
      classification = DIFF_CLASS.SHAGRIR_CRITICAL;
    }
    // Timestamp-only on Shagrir reservation is IRRELEVANT for matching
    if (isShagrirRes && record.fieldNames.every((f) => TIMESTAMPISH.has(f) || SYNC_META.has(f))) {
      classification = DIFF_CLASS.IRRELEVANT;
    }

    record.classification = classification;
    record.isShagrirRelated = Boolean(isShagrirRes || isShagrirSupplierDoc);
    record.canAffectShagrirReconciliation = classification === DIFF_CLASS.SHAGRIR_CRITICAL;
    record.canAffectCommissionCalculation = record.fieldNames.some((f) => [
      'commissionPercentUsed', 'commissionAmount', 'commissionPercent', 'agreedPrice',
      'dateFrom', 'dateTo', 'actualReturnDate', 'periodTypeDays',
    ].includes(f));
    record.canAffectReservationEligibility = record.fieldNames.some((f) => [
      'status', 'isClosed', 'isQuote', 'dateFrom', 'dateTo', 'actualReturnDate',
    ].includes(f));
    record.reviewRequiredBeforeShagrirTest = classification === DIFF_CLASS.SHAGRIR_CRITICAL;
    classCounts[classification] += 1;
  }

  const sourceReservations = sourceScan.byCollection.reservations?.docs || [];
  const targetReservations = targetScan.byCollection.reservations?.docs || [];
  const sourceShagrir = buildShagrirCoverage(sourceReservations, shagrirIds);
  const targetShagrir = buildShagrirCoverage(targetReservations, shagrirIds);

  const changedReservations = sourceChanged.filter((r) => r.collection === 'reservations');
  const reservationDiffCounts = reservationFieldDiffCounts(changedReservations);

  // TARGET_ONLY contamination
  const targetOnlyDetailed = [];
  let targetOnlyReservations = 0;
  let targetOnlyShagrirReservations = 0;
  let targetOnlySuppliers = 0;
  let targetOnlyCommission = 0;
  let contaminationRisk = false;
  const sourceShagrirOrderKeys = new Set();
  for (const doc of sourceShagrir.shagrirReservations) {
    const so = doc.data?.supplierOrderNumber;
    if (so != null && !(typeof so === 'string' && so.length === 0)) {
      sourceShagrirOrderKeys.add(`${describeFirestoreType(so)}|${JSON.stringify(canonicalize(so))}`);
    }
    const ec = doc.data?.externalContractNumber;
    if (ec != null && !(typeof ec === 'string' && ec.length === 0)) {
      sourceShagrirOrderKeys.add(`ec:${describeFirestoreType(ec)}|${JSON.stringify(canonicalize(ec))}`);
    }
  }

  const targetOnlyOverlap = [];
  for (const item of targetOnly) {
    const docs = targetScan.byCollection[item.collection]?.docs || [];
    const doc = docs.find((d) => d.id === item.documentId);
    const detail = {
      collection: item.collection,
      documentId: item.documentId,
      isReservation: item.collection === 'reservations',
      isSupplier: item.collection === 'suppliers',
      isCommissionRelated: item.collection === 'carSaleCommissionPayments'
        || item.collection === 'commissionRules'
        || item.collection === 'payments',
      isShagrirReservation: false,
      hasSupplierOrderNumber: false,
      hasExternalContractNumber: false,
      identifierOverlapWithSourceShagrir: false,
      contaminationRisk: false,
    };
    if (item.collection === 'reservations' && doc) {
      targetOnlyReservations += 1;
      const sid = String(doc.data?.supplierId ?? '');
      detail.isShagrirReservation = shagrirIds.includes(sid);
      const so = doc.data?.supplierOrderNumber;
      const ec = doc.data?.externalContractNumber;
      detail.hasSupplierOrderNumber = so != null && !(typeof so === 'string' && so.length === 0);
      detail.hasExternalContractNumber = ec != null && !(typeof ec === 'string' && ec.length === 0);
      if (detail.isShagrirReservation) {
        targetOnlyShagrirReservations += 1;
        if (detail.hasSupplierOrderNumber) {
          const key = `${describeFirestoreType(so)}|${JSON.stringify(canonicalize(so))}`;
          if (sourceShagrirOrderKeys.has(key)) {
            detail.identifierOverlapWithSourceShagrir = true;
            detail.contaminationRisk = true;
            contaminationRisk = true;
            targetOnlyOverlap.push({
              documentId: item.documentId,
              field: 'supplierOrderNumber',
              type: describeFirestoreType(so),
              hash8: sanitizeValueSummary(so).hash8,
            });
          }
        }
        if (detail.hasExternalContractNumber) {
          const key = `ec:${describeFirestoreType(ec)}|${JSON.stringify(canonicalize(ec))}`;
          if (sourceShagrirOrderKeys.has(key)) {
            detail.identifierOverlapWithSourceShagrir = true;
            detail.contaminationRisk = true;
            contaminationRisk = true;
            targetOnlyOverlap.push({
              documentId: item.documentId,
              field: 'externalContractNumber',
              type: describeFirestoreType(ec),
              hash8: sanitizeValueSummary(ec).hash8,
            });
          }
        }
        // Even without overlap, a TARGET_ONLY Shagrir reservation with an identifier
        // could false-match a report row that SOURCE does not have — flag as risk.
        if (detail.hasSupplierOrderNumber || detail.hasExternalContractNumber) {
          detail.contaminationRisk = true;
          contaminationRisk = true;
        }
      }
    }
    if (item.collection === 'suppliers') targetOnlySuppliers += 1;
    if (detail.isCommissionRelated) targetOnlyCommission += 1;
    targetOnlyDetailed.push(detail);
  }

  const identifierQuality = {
    source: analyzeIdentifierQuality(sourceShagrir.shagrirReservations),
    target: analyzeIdentifierQuality(targetShagrir.shagrirReservations),
  };

  const criticalRecords = sourceChanged
    .filter((r) => r.classification === DIFF_CLASS.SHAGRIR_CRITICAL)
    .map((r) => ({
      collection: r.collection,
      documentId: r.documentId,
      isShagrirRelated: r.isShagrirRelated,
      fields: r.differingFields.map((f) => ({
        field: f.field,
        source: f.source,
        target: f.target,
        role: f.role,
      })),
      why: 'Differing Shagrir-critical field(s) on a record that can affect exact-match reconciliation or rental lifecycle.',
    }));

  let readiness = 'YES';
  const blockers = [];
  if (criticalRecords.length > 0 || contaminationRisk) {
    readiness = 'NO_REVIEW_REQUIRED';
    for (const c of criticalRecords) {
      blockers.push({
        documentId: c.documentId,
        collection: c.collection,
        fields: c.fields.map((f) => f.field),
      });
    }
    if (contaminationRisk) {
      blockers.push({
        kind: 'TARGET_ONLY_SHAGRIR_CONTAMINATION',
        overlaps: targetOnlyOverlap,
        targetOnlyShagrirReservations,
      });
    }
  } else if (sourceChanged.length > 0 || targetOnly.length > 0) {
    readiness = 'YES_WITH_NON_BLOCKING_DIFFERENCES';
  }

  const report = {
    kind: 'SHAGRIR_READINESS_ANALYSIS',
    readOnly: true,
    firestoreWrites: 0,
    authWrites: 0,
    storageWrites: 0,
    deletes: 0,
    sourceChangedApplied: false,
    targetOnlyDeleted: false,
    shagrirReconciliationExecuted: false,
    identity,
    sourceUid,
    targetUid,
    totals: {
      sourceDocuments: sourceScan.totalDocuments,
      targetDocuments: targetScan.totalDocuments,
      sourceChanged: sourceChanged.length,
      targetOnly: targetOnly.length,
    },
    sourceChanged: {
      total: sourceChanged.length,
      byCollection: byCollectionChanged,
      byClassification: classCounts,
      records: sourceChanged.map((r) => ({
        collection: r.collection,
        documentId: r.documentId,
        classification: r.classification,
        fieldNames: r.fieldNames,
        isShagrirRelated: r.isShagrirRelated,
        canAffectShagrirReconciliation: r.canAffectShagrirReconciliation,
        canAffectCommissionCalculation: r.canAffectCommissionCalculation,
        canAffectReservationEligibility: r.canAffectReservationEligibility,
        reviewRequiredBeforeShagrirTest: r.reviewRequiredBeforeShagrirTest,
        differingFields: r.differingFields,
      })),
      shagrirCritical: criticalRecords,
      reservationDiffCounts,
    },
    targetOnly: {
      total: targetOnly.length,
      byCollection: byCollectionTargetOnly,
      reservationCount: targetOnlyReservations,
      shagrirReservationCount: targetOnlyShagrirReservations,
      supplierRelatedCount: targetOnlySuppliers,
      commissionRelatedCount: targetOnlyCommission,
      canContaminateMatching: contaminationRisk,
      overlaps: targetOnlyOverlap,
      records: targetOnlyDetailed,
    },
    shagrirSupplier: {
      suppliers: shagrirSuppliers,
      howLinked: 'Reservation.supplierId equals Supplier document id under users/{uid}/suppliers/{id}',
      source: sourceShagrir.coverage,
      target: targetShagrir.coverage,
    },
    identifierQuality,
    readiness,
    blockers,
    notes: [
      'Identifier comparisons in this analysis are exact (no trim/case/leading-zero/normalize).',
      'Application matching uses RawCommissionReportRow.normalizeId at runtime; this report does not apply that normalization.',
      'MISSING_ONLY left SOURCE_CHANGED TARGET values untouched by design.',
    ],
  };

  let artifactPath = null;
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true });
    artifactPath = resolve(artifactDir, `shagrir-readiness-${Date.now()}.json`);
    writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    report.artifactPath = artifactPath;
  }

  return report;
}
