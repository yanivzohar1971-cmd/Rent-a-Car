/**
 * safeStringify - JSON.stringify with Firestore Timestamp replacer
 * 
 * Converts Firestore Timestamp objects to ISO strings for readable JSON output.
 * 
 * PROBLEM: Firestore Timestamp instances serialize as complex objects:
 * { seconds: 1234567890, nanoseconds: 123456789 }
 * 
 * SOLUTION: Detect Timestamp instances and convert to ISO strings.
 * 
 * USAGE:
 * - Replace JSON.stringify(obj) with safeStringify(obj)
 * - Works in Admin Debug JSON outputs and Car Details JSON viewer
 * 
 * SAFE FOR:
 * - Firestore Timestamp instances (has toDate() method)
 * - Timestamp-like objects { seconds, nanoseconds } (Firestore SDK serialized format)
 * - All other types pass through unchanged
 */

/**
 * Check if value is a Firestore Timestamp instance
 */
function isFirestoreTimestamp(value: any): boolean {
  return value && typeof value === 'object' && typeof value.toDate === 'function';
}

/**
 * Check if value is a Timestamp-like object (Firestore SDK serialized format)
 */
function isTimestampLike(value: any): boolean {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.seconds === 'number' &&
    typeof value.nanoseconds === 'number' &&
    // Optional: check for Firestore type hint
    (value._seconds !== undefined || value.seconds !== undefined)
  );
}

/**
 * Convert Timestamp-like object to ISO string
 */
function timestampLikeToISO(value: { seconds: number; nanoseconds: number }): string {
  const date = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
  return date.toISOString();
}

/**
 * Replacer function for JSON.stringify
 */
function firestoreReplacer(_key: string, value: any): any {
  // Handle Firestore Timestamp instances
  if (isFirestoreTimestamp(value)) {
    try {
      return value.toDate().toISOString();
    } catch (error) {
      console.warn('[safeStringify] Failed to convert Timestamp to ISO:', error);
      return `<Timestamp conversion failed: ${error}>`;
    }
  }

  // Handle Timestamp-like objects (Firestore SDK serialized format)
  if (isTimestampLike(value)) {
    try {
      return timestampLikeToISO(value);
    } catch (error) {
      console.warn('[safeStringify] Failed to convert Timestamp-like object to ISO:', error);
      return `<Timestamp-like conversion failed: ${error}>`;
    }
  }

  // Pass through all other values
  return value;
}

/**
 * Safe JSON.stringify with Firestore Timestamp replacer
 * 
 * @param value - Value to stringify
 * @param space - Indentation (default: 2)
 * @returns JSON string with Timestamps converted to ISO strings
 */
export function safeStringify(value: any, space: number = 2): string {
  try {
    return JSON.stringify(value, firestoreReplacer, space);
  } catch (error) {
    console.error('[safeStringify] Failed to stringify:', error);
    return `<Stringify failed: ${error}>`;
  }
}

/**
 * Safe JSON.stringify for single-line compact output
 */
export function safeStringifyCompact(value: any): string {
  return safeStringify(value, 0);
}
