/**
 * Firestore rejects undefined; always sanitize payloads before writes.
 * 
 * This utility removes undefined values and NaN numbers from objects
 * before writing to Firestore, as Firestore does not accept these values.
 * 
 * Recursively sanitizes nested objects and arrays:
 * - Remove keys/items where value === undefined
 * - Remove keys/items where value is NaN
 * - Arrays: sanitize items recursively, remove undefined/NaN items, keep order
 * - Plain objects: sanitize recursively, removing keys whose sanitized value becomes undefined
 * - Keep null exactly (Firestore supports null)
 * - Keep empty string exactly (but callers can still convert "" -> undefined when desired)
 * - Preserve Firestore Timestamp/Date/File/Blob objects as-is (leaf objects, no recursion)
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): Partial<T> {
  /**
   * Check if an object should be treated as a leaf (not recursed into)
   */
  function isLeafObject(value: any): boolean {
    if (value === null || typeof value !== 'object') {
      return true; // Primitives are leaves
    }
    
    // Firestore Timestamp has toDate() method
    if (typeof value.toDate === 'function') {
      return true;
    }
    
    // Date objects
    if (value instanceof Date) {
      return true;
    }
    
    // File/Blob objects
    if (value instanceof File || value instanceof Blob) {
      return true;
    }
    
    // Check constructor name for Timestamp/Date
    const constructorName = value.constructor?.name;
    if (constructorName === 'Timestamp' || constructorName === 'Date') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Recursively sanitize a value
   */
  function sanitizeValue(value: any): any {
    // Remove undefined
    if (value === undefined) {
      return undefined; // Will be filtered out
    }
    
    // Remove NaN
    if (typeof value === 'number' && Number.isNaN(value)) {
      return undefined; // Will be filtered out
    }
    
    // Preserve null and empty string as-is
    if (value === null || value === '') {
      return value;
    }
    
    // Handle arrays: sanitize items recursively, remove undefined/NaN items, keep order
    if (Array.isArray(value)) {
      const sanitized = value
        .map(sanitizeValue)
        .filter(v => v !== undefined && !(typeof v === 'number' && Number.isNaN(v)));
      // Return empty array if all items were removed, or the sanitized array
      return sanitized;
    }
    
    // Handle plain objects: sanitize recursively
    if (typeof value === 'object' && !isLeafObject(value)) {
      const sanitized = Object.fromEntries(
        Object.entries(value)
          .map(([k, v]) => [k, sanitizeValue(v)])
          .filter(([_, v]) => v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))
      );
      // Return empty object if all keys were removed, or the sanitized object
      return sanitized;
    }
    
    // Leaf value (primitives, Timestamp, Date, File, Blob, etc.) - return as-is
    return value;
  }
  
  // Sanitize top-level object
  return Object.fromEntries(
    Object.entries(obj)
      .map(([k, v]) => [k, sanitizeValue(v)])
      .filter(([_, v]) => v !== undefined && !(typeof v === 'number' && Number.isNaN(v)))
  ) as Partial<T>;
}
