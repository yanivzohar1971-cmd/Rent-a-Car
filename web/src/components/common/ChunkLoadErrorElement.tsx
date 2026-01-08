import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { attemptChunkRetry, isChunkLoadError, hasRetriedChunkLoad } from '../../utils/chunkRetry';

interface ChunkLoadErrorElementProps {
  error?: unknown;
}

/**
 * Error element for chunk load failures
 * Provides one-time auto-retry and friendly error message
 */
export function ChunkLoadErrorElement({ error }: ChunkLoadErrorElementProps) {
  useEffect(() => {
    // Attempt one-time retry on mount if error is chunk load error
    if (error && isChunkLoadError(error) && !hasRetriedChunkLoad()) {
      const retried = attemptChunkRetry(error);
      if (retried) {
        // Reload will happen, component will unmount
        return;
      }
    }
  }, [error]);

  // If we already retried or it's not a chunk error, show error UI
  const alreadyRetried = hasRetriedChunkLoad();
  const isChunkError = error && isChunkLoadError(error);

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
      <p style={{ color: '#666', marginBottom: '24px', maxWidth: '400px' }}>
        {isChunkError && alreadyRetried
          ? 'הדף לא נטען לאחר ניסיון רענון. אם זה ממשיך, נקה cache או נסה חלון פרטי.'
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
          רענן
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
      {/* Show error details in development */}
      {import.meta.env.DEV && error ? (
        <details
          style={{
            marginTop: '24px',
            padding: '12px',
            backgroundColor: '#fff3f3',
            borderRadius: '4px',
            textAlign: 'left',
            direction: 'ltr',
            fontSize: '12px',
            maxWidth: '600px',
            width: '100%',
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>
            Error Details (dev only)
          </summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c33' }}>
            {error instanceof Error ? error.toString() : String(error)}
            {error instanceof Error && error.stack ? (
              <>
                {'\n\n'}
                {error.stack}
              </>
            ) : null}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

