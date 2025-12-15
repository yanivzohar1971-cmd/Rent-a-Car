/**
 * Promotion Time Utilities
 * 
 * Single source of truth for parsing promotion timestamps.
 * Handles various Firestore timestamp formats reliably.
 */

export type PromotionUntil = unknown;

/**
 * Convert a promotion "until" timestamp to milliseconds since epoch.
 * 
 * Handles multiple formats:
 * - Firestore Timestamp with toMillis() method
 * - Firestore Timestamp with toDate() method
 * - Plain object: { seconds: number, nanoseconds?: number }
 * - Date instance
 * - number (ms if > 10^12, else seconds*1000)
 * - string numeric (parsed then treated as number)
 * 
 * @param until - Promotion until timestamp in any supported format
 * @returns milliseconds since epoch, or null if invalid/unparseable
 */
export function toMillisPromotion(until: PromotionUntil): number | null {
  if (!until) return null;
  
  try {
    // a) Firestore Timestamp-like: has toMillis() -> use it
    if (typeof until === 'object' && until !== null && 'toMillis' in until) {
      const toMillisFn = (until as any).toMillis;
      if (typeof toMillisFn === 'function') {
        return toMillisFn.call(until);
      }
    }
    
    // b) Firestore Timestamp-like: has toDate() -> date.getTime()
    if (typeof until === 'object' && until !== null && 'toDate' in until) {
      const toDateFn = (until as any).toDate;
      if (typeof toDateFn === 'function') {
        const date = toDateFn.call(until);
        if (date instanceof Date) {
          return date.getTime();
        }
      }
    }
    
    // c) Plain object: { seconds: number, nanoseconds?: number }
    if (typeof until === 'object' && until !== null && 'seconds' in until) {
      const seconds = (until as any).seconds;
      if (typeof seconds === 'number') {
        const nanoseconds = (until as any).nanoseconds || 0;
        return seconds * 1000 + Math.floor(nanoseconds / 1e6);
      }
    }
    
    // c2) Plain object: { _seconds: number, _nanoseconds?: number } (Cloud Function serialized format)
    if (typeof until === 'object' && until !== null && '_seconds' in until) {
      const seconds = (until as any)._seconds;
      if (typeof seconds === 'number') {
        const nanoseconds = (until as any)._nanoseconds || 0;
        return seconds * 1000 + Math.floor(nanoseconds / 1e6);
      }
    }
    
    // d) Date instance -> getTime()
    if (until instanceof Date) {
      return until.getTime();
    }
    
    // e) number -> treat as ms if > 10^12 else seconds*1000
    if (typeof until === 'number') {
      // If number is > 10^12, assume it's already in milliseconds
      // Otherwise, assume it's seconds and convert to milliseconds
      return until > 1e12 ? until : until * 1000;
    }
    
    // f) string numeric -> parse then apply same rule as number
    if (typeof until === 'string') {
      const parsed = parseFloat(until);
      if (!isNaN(parsed)) {
        return parsed > 1e12 ? parsed : parsed * 1000;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a promotion is currently active (until timestamp is in the future).
 * 
 * @param until - Promotion until timestamp in any supported format
 * @returns true if promotion is active (until is in the future), false otherwise
 */
export function isPromotionActive(until: PromotionUntil): boolean {
  const untilMs = toMillisPromotion(until);
  if (untilMs === null) return false;
  return untilMs > Date.now();
}
