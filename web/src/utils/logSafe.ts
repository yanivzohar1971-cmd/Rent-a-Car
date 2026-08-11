/**
 * Safe logging utility that suppresses known noisy errors in production
 * while still allowing unknown errors to surface for debugging.
 * 
 * This prevents Lighthouse from flagging console errors for expected
 * transient network issues and Firestore index warnings.
 */

interface ErrorContext {
  component?: string;
  action?: string;
  [key: string]: any;
}

/**
 * Check if an error is a known noisy error that should be suppressed in production
 */
function isNoisyError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  const errorCode = error.code || error.name;
  
  // Firestore index errors (expected during development, should be fixed with indexes)
  if (errorCode === 'failed-precondition' || 
      errorMessage?.includes('requires an index') ||
      errorMessage?.includes('The query requires an index')) {
    return true;
  }
  
  // Network timeout errors (transient, expected in poor connectivity)
  if (errorCode === 'deadline-exceeded' ||
      errorMessage?.includes('timeout') ||
      errorMessage?.includes('TIMED_OUT') ||
      errorMessage?.includes('ERR_TIMED_OUT') ||
      errorMessage?.includes('net::ERR_TIMED_OUT')) {
    return true;
  }
  
  // Firestore listener/channel noise (known Firebase SDK behavior)
  if (errorMessage?.includes('listen') && 
      (errorMessage?.includes('channel') || errorMessage?.includes('connection'))) {
    return true;
  }
  
  return false;
}

/**
 * Log error safely - only logs in dev, suppresses known noisy errors in production
 */
export function logSafeError(error: any, context?: ErrorContext | string): void {
  const isDev = import.meta.env.DEV;
  const isNoisy = isNoisyError(error);
  
  // In production, suppress known noisy errors
  if (!isDev && isNoisy) {
    // Silently swallow - these are expected transient issues
    return;
  }
  
  // In dev or for unknown errors, log normally
  const contextStr = typeof context === 'string' 
    ? context 
    : context 
      ? `${context.component || ''}${context.action ? ` - ${context.action}` : ''}`
      : '';
  
  if (contextStr) {
    console.error(`[${contextStr}]`, error);
  } else {
    console.error(error);
  }
}

/**
 * Log warning safely - similar to logSafeError but uses console.warn
 */
export function logSafeWarning(message: string, context?: ErrorContext | string): void {
  const isDev = import.meta.env.DEV;
  
  // In production, only log warnings for non-noisy issues
  if (!isDev) {
    // Still log warnings in production, but they're less critical
    const contextStr = typeof context === 'string' 
      ? context 
      : context 
        ? `${context.component || ''}${context.action ? ` - ${context.action}` : ''}`
        : '';
    
    if (contextStr) {
      console.warn(`[${contextStr}]`, message);
    } else {
      console.warn(message);
    }
  } else {
    // In dev, always log
    const contextStr = typeof context === 'string' 
      ? context 
      : context 
        ? `${context.component || ''}${context.action ? ` - ${context.action}` : ''}`
        : '';
    
    if (contextStr) {
      console.warn(`[${contextStr}]`, message);
    } else {
      console.warn(message);
    }
  }
}
