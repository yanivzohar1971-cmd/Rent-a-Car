import { createHash } from 'node:crypto';
import { OWNERSHIP_FIELD_NAMES } from './schema.mjs';

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
  return stableSerialize(normalized) === stableSerialize(targetData || {});
}

export function fingerprintDocument(data) {
  return createHash('sha256').update(stableSerialize(data || {})).digest('hex');
}

export function stableSerialize(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  // Firestore Timestamp-like
  if (typeof value.toDate === 'function') {
    try {
      return { __ts: value.toDate().toISOString() };
    } catch {
      return String(value);
    }
  }
  if (value._seconds != null && value._nanoseconds != null) {
    return { __tsSeconds: value._seconds, __tsNanos: value._nanoseconds };
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeys(value[key]);
  }
  return out;
}

export function classifyFieldRole(fieldName) {
  if (OWNERSHIP_FIELD_NAMES.includes(fieldName)) return 'OWNERSHIP';
  return 'UNKNOWN';
}
