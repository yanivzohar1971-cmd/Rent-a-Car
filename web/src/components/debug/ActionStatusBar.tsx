/**
 * Action Status Bar
 * 
 * Unified progress/status indicator for Admin Debug Console actions.
 * Shows current step, progress bar, and final state (Completed/Failed).
 * 
 * Used by:
 * - Scenario Runner
 * - Pipeline / Run Checks topics
 * - Functions/Projection topic
 */


export interface ActionStatusBarProps {
  isRunning: boolean;
  statusText?: string; // e.g. "Running…" / "Completed" / "Failed"
  currentLabel?: string; // e.g. "Scenario: Yard Only" or "Check: MASTER vs PUBLIC Diff"
  currentIndex?: number; // 0-based
  total?: number;
  errorText?: string | null;
  startedAtMs?: number;
  finishedAtMs?: number;
  onCancel?: () => void;
}

export function ActionStatusBar({
  isRunning,
  statusText,
  currentLabel,
  currentIndex,
  total,
  errorText,
  startedAtMs,
  finishedAtMs,
  onCancel,
}: ActionStatusBarProps) {
  // Don't render if not running and no status
  if (!isRunning && !statusText) {
    return null;
  }

  // Calculate progress percentage
  let progressPct = 0;
  if (total && total > 0 && currentIndex !== undefined) {
    progressPct = Math.min(Math.max(((currentIndex + 1) / total) * 100, 0), 100);
  }

  // Format elapsed/duration time
  const formatTime = (ms?: number): string => {
    if (!ms) return '00:00';
    const seconds = Math.floor((Date.now() - ms) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const elapsedTime = startedAtMs ? formatTime(startedAtMs) : null;
  const duration = finishedAtMs && startedAtMs 
    ? formatTime(startedAtMs - (finishedAtMs - startedAtMs)) 
    : null;

  return (
    <div className="run-progress" style={{
      margin: '10px 0',
      padding: '10px 12px',
      border: '1px solid #e6e6e6',
      borderRadius: '10px',
      background: '#fafafa',
    }}>
      <div className="run-progress-top" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <div style={{ flex: 1 }}>
          <div className="run-progress-title" style={{ fontWeight: 600 }}>
            {statusText || (isRunning ? 'Running…' : '')}
          </div>
          {currentLabel && (
            <div className="run-progress-sub" style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
              {currentLabel}
              {currentIndex !== undefined && total !== undefined && total > 0 && (
                <span> ({currentIndex + 1}/{total})</span>
              )}
            </div>
          )}
        </div>
        {onCancel && isRunning && (
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
      
      {/* Progress bar */}
      {total && total > 0 && (
        <div className="run-progress-bar" style={{
          height: '8px',
          background: '#eaeaea',
          borderRadius: '999px',
          overflow: 'hidden',
          marginTop: '10px',
        }}>
          <div
            className="run-progress-bar-fill"
            style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: '999px',
              background: '#2f80ed',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
      
      {/* Time line */}
      {(elapsedTime || duration) && (
        <div className="run-progress-sub" style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
          {isRunning && elapsedTime && `Elapsed: ${elapsedTime}`}
          {!isRunning && duration && `Duration: ${duration}`}
        </div>
      )}
      
      {/* Error text */}
      {errorText && (
        <div className="run-progress-error" style={{
          marginTop: '8px',
          color: '#b00020',
          fontSize: '12px',
        }}>
          {errorText}
        </div>
      )}
    </div>
  );
}
