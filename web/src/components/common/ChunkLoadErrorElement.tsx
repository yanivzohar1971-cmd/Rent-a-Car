import { useEffect, useMemo } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { attemptChunkRetry, isChunkLoadError, hasRetriedChunkLoad } from '../../utils/chunkRetry';

interface ChunkLoadErrorElementProps {
  error?: unknown;
}

/**
 * Error element for chunk load failures
 * Provides one-time auto-retry and friendly error message
 * Shows technical details in a collapsible section (prod + dev)
 */
export function ChunkLoadErrorElement({ error: propError }: ChunkLoadErrorElementProps) {
  // Get error from route if not provided as prop
  const routeError = useRouteError();
  const error = propError ?? routeError;

  // Generate correlation ID for tracking
  const correlationId = useMemo(
    () => Math.random().toString(36).substring(2, 15),
    []
  );

  useEffect(() => {
    // Log error details for debugging
    const errorDetails = {
      correlationId,
      url: window.location.href,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      isChunkLoadError: error ? isChunkLoadError(error) : false,
    };
    console.error('[ChunkLoadErrorElement] Route error:', errorDetails);

    // Attempt one-time retry on mount if error is chunk load error
    if (error && isChunkLoadError(error) && !hasRetriedChunkLoad()) {
      const retried = attemptChunkRetry(error);
      if (retried) {
        // Reload will happen, component will unmount
        return;
      }
    }
  }, [error, correlationId]);

  // If we already retried or it's not a chunk error, show error UI
  const alreadyRetried = hasRetriedChunkLoad();
  const isChunkError = Boolean(error && isChunkLoadError(error));

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Heebo, Arial, sans-serif',
        direction: 'rtl',
        textAlign: 'center',
      }}
    >
      <h2 style={{ color: '#d32f2f', marginBottom: '16px' }}>
        תקלה בטעינת הדף
      </h2>
      {isChunkError && (
        <p style={{ color: '#f57c00', marginBottom: '12px', fontWeight: 500 }}>
          ייתכן שזו גרסת קאש ישנה. נסה רענון.
        </p>
      )}
      <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
        {isChunkError && alreadyRetried
          ? 'הדף לא נטען לאחר ניסיון רענון. אם זה ממשיך, נקה cache או נסה חלון פרטי.'
          : isChunkError
          ? 'עדכון חדש זמין או בעיית טעינה. לחץ לרענון.'
          : 'אירעה שגיאה בטעינת הדף. אנא נסה לרענן את הדף.'}
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          🔄 רענן עכשיו
        </button>
        <button
          onClick={() => {
            // Hard reload: clear cache and reload
            if ('caches' in window) {
              caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
              });
            }
            // Clear localStorage cache-related keys
            try {
              const keysToRemove: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (
                  key.includes('cache') || 
                  key.includes('chunk') || 
                  key.includes('app-shell') ||
                  key.includes('sw-cache')
                )) {
                  keysToRemove.push(key);
                }
              }
              keysToRemove.forEach(key => localStorage.removeItem(key));
              sessionStorage.clear();
            } catch (e) {
              // Ignore storage errors
            }
            // Force reload bypassing cache
            window.location.reload();
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#f57c00',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          🧹 נקה קאש ורענן
        </button>
        <Link
          to="/"
          style={{
            padding: '10px 20px',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          חזרה לדף הראשי
        </Link>
      </div>
      {/* Show error details in collapsible section (available in prod for debugging) */}
      {error ? (
        <details
          style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#fafafa',
            borderRadius: '4px',
            textAlign: 'left',
            direction: 'ltr',
            fontSize: '12px',
            maxWidth: '600px',
            width: '100%',
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px', direction: 'rtl', textAlign: 'right' }}>
            פרטים טכניים
          </summary>
          <div style={{ marginTop: '12px' }}>
            <p style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
              Correlation ID: <code style={{ backgroundColor: '#eee', padding: '2px 6px', borderRadius: '3px' }}>{correlationId}</code>
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c33', backgroundColor: '#fff3f3', padding: '12px', borderRadius: '4px', marginTop: '8px' }}>
              {error instanceof Error ? error.toString() : String(error)}
              {error instanceof Error && error.stack ? (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              ) : null}
              {'\n\n'}
              Location: {window.location.href}
              {'\n'}
              Timestamp: {new Date().toISOString()}
            </pre>
          </div>
        </details>
      ) : null}
    </div>
  );
}

