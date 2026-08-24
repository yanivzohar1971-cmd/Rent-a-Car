import { createHash } from 'node:crypto';
import { OWNERSHIP_FIELD_NAMES, SHAGRIR_IDENTIFIER_FIELDS } from './schema.mjs';

/**
 * Semantic ownership remapping only — never arbitrary substring replace.
 */
export function transformOwnershipValue(value, { sourceUid, targetUid }) {
  if (value === sourceUid) return targetUid;
  return value;
}

export function transformOwnershipFields(data, { sourceUid, targetUid, fieldNames = OWNERSHIP_FIELD_NAMES } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { data, transforms: [] };
  }
  const out = { ...data };
  const transforms = [];
  for (const field of fieldNames) {
    if (!Object.prototype.hasOwnProperty.call(out, field)) continue;
    const before = out[field];
    const after = transformOwnershipValue(before, { sourceUid, targetUid });
    if (after !== before) {
      out[field] = after;
      transforms.push({ field, from: sourceUid, to: targetUid });
    }
  }
  return { data: out, transforms };
}

/**
 * Compare two docs after normalizing SOURCE ownership to TARGET expectation.
 */
export function ownershipNormalizedEquals(sourceData, targetData, { sourceUid, targetUid }) {
  const { data: normalized } = transformOwnershipFields(sourceData || {}, { sourceUid, targetUid });
  return fingerprintDocument(normalized) === fingerprintDocument(targetData || {});
}

export function fingerprintDocument(data) {
  return createHash('sha256').update(stableSerialize(data || {})).digest('hex');
}

/**
 * Canonical serialization that preserves Firestore semantic types.
 * "0028004" (string) must never equal 28004 (number).
 */
export function stableSerialize(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalize(value) {
  if (value === null) return { __t: 'null' };
  if (value === undefined) return { __t: 'undefined' };
  const t = typeof value;
  if (t === 'string') return { __t: 'string', v: value };
  if (t === 'number') return { __t: 'number', v: Object.is(value, -0) ? 0 : value };
  if (t === 'boolean') return { __t: 'boolean', v: value };
  if (t === 'bigint') return { __t: 'bigint', v: value.toString() };
  if (Array.isArray(value)) return { __t: 'array', v: value.map(canonicalize) };

  if (t === 'object') {
    // Firestore Timestamp
    if (typeof value.toDate === 'function' && typeof value.toMillis === 'function') {
      try {
        return { __t: 'timestamp', v: value.toDate().toISOString() };
      } catch {
        return { __t: 'timestamp', v: String(value) };
      }
    }
    if (value._seconds != null && value._nanoseconds != null && value.constructor?.name === 'Timestamp') {
      return { __t: 'timestamp', seconds: value._seconds, nanos: value._nanoseconds };
    }
    // GeoPoint (Admin SDK instance only — do not guess from plain maps)
    if (value.constructor?.name === 'GeoPoint'
      && typeof value.latitude === 'number'
      && typeof value.longitude === 'number') {
      return { __t: 'geopoint', lat: value.latitude, lng: value.longitude };
    }
    // DocumentReference
    if (typeof value.path === 'string' && typeof value.id === 'string'
      && (typeof value.get === 'function' || value.constructor?.name === 'DocumentReference')) {
      return { __t: 'reference', path: value.path };
    }
    // Bytes / Buffer
    if (Buffer.isBuffer(value)) {
      return { __t: 'bytes', v: value.toString('base64') };
    }
    if (value instanceof Uint8Array) {
      return { __t: 'bytes', v: Buffer.from(value).toString('base64') };
    }

    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return { __t: 'map', v: out };
  }

  return { __t: 'unknown', v: String(value) };
}

/**
 * Field roles derived from known application schema — not invented.
 */
export function classifyFieldRole(fieldName) {
  const name = String(fieldName || '');
  if (OWNERSHIP_FIELD_NAMES.includes(name)) return 'OWNERSHIP';
  if (SHAGRIR_IDENTIFIER_FIELDS.includes(name)) return 'SOURCE_AUTHORITATIVE';
  if ([
    'dateFrom', 'dateTo', 'actualReturnDate', 'supplierId', 'branchId', 'agentId',
    'customerId', 'carTypeId', 'periodType', 'status', 'totalAmount', 'commissionAmount',
    'commissionPercent', 'priceListImportFunctionCode', 'commissionReportEmail',
  ].includes(name)) {
    return 'SOURCE_AUTHORITATIVE';
  }
  if (name.startsWith('debug') || name.startsWith('local') || name === 'lastLocalSyncAt') {
    return 'TARGET_LOCAL';
  }
  return 'UNKNOWN';
}

export function valuesSemanticallyEqual(a, b) {
  return fingerprintDocument(a) === fingerprintDocument(b);
}
