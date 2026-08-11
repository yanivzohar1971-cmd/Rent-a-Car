/**
 * Chunk Load Error Retry Utility
 * 
 * Handles "Failed to fetch dynamically imported module" errors
 * that occur when:
 * - HTML is cached but assets changed after deploy
 * - Service worker cache mismatch
 * - Network issues during chunk load
 * 
 * Provides one-time safe retry to reload the page.
 */

const CHUNK_RETRY_KEY = 'chunk_retry_done';

/**
 * Check if an error is a chunk load error
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = String(error);
  
  // Common chunk load error patterns
  const chunkErrorPatterns = [
    'Failed to fetch dynamically imported module',
    'Loading chunk',
    'ChunkLoadError',
    'Loading CSS chunk',
    'Failed to fetch',
    'Importing a module script failed',
  ];
  
  return chunkErrorPatterns.some(pattern => 
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );
}

/**
 * Check if we've already retried in this session
 */
export function hasRetriedChunkLoad(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RETRY_KEY) === '1';
  } catch {
    // sessionStorage not available (e.g., private browsing)
    return false;
  }
}

/**
 * Mark that we've retried chunk load in this session
 */
export function markChunkRetryDone(): void {
  try {
    sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
  } catch {
    // sessionStorage not available - ignore
  }
}

/**
 * Attempt one-time safe retry for chunk load errors
 * Returns true if retry was attempted, false otherwise
 */
export function attemptChunkRetry(error: unknown): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }
  
  if (hasRetriedChunkLoad()) {
    // Already retried - don't retry again to avoid infinite loop
    return false;
  }
  
  // Mark retry as done before reloading
  markChunkRetryDone();
  
  // Log correlation info for debugging
  console.error('[chunkRetry] ChunkLoadError detected', {
    href: window.location.href,
    base: import.meta.env.BASE_URL || '/',
    origin: window.location.origin,
  });
  
  // Reload the page to fetch fresh index.html and assets
  console.warn('[chunkRetry] Chunk load error detected, reloading page once...');
  window.location.reload();
  
  return true;
}

