/**
 * Run Progress Header Component
 * 
 * Unified progress indicator for admin debug runners.
 * Shows current step, progress bar, elapsed time, and error state.
 */

interface RunProgressHeaderProps {
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

export default function RunProgressHeader({
  isRunning,
  statusText,
  currentLabel,
  currentIndex = 0,
  total = 0,
  errorText,
  startedAtMs = 0,
  finishedAtMs = 0,
  onCancel,
}: RunProgressHeaderProps) {
  // Don't render if not running and no status text
  if (!isRunning && !statusText) {
    return null;
  }

  // Calculate progress percentage
  let progressPct = 0;
  if (total > 0 && currentIndex >= 0) {
    progressPct = Math.min(Math.max(((currentIndex + 1) / total) * 100, 0), 100);
  } else if (isRunning && total === 0) {
    // Indeterminate mode
    progressPct = 0;
  } else if (!isRunning && finishedAtMs > 0) {
    progressPct = 100;
  }

  // Calculate elapsed time
  const now = Date.now();
  const elapsedMs = isRunning && startedAtMs > 0
    ? now - startedAtMs
    : finishedAtMs > 0 && startedAtMs > 0
    ? finishedAtMs - startedAtMs
    : 0;

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayStatus = statusText || (isRunning ? 'Running…' : '');
  const displayLabel = currentLabel || '';
  const displayIndex = total > 0 && currentIndex >= 0 ? `${currentIndex + 1}/${total}` : '';

  return (
    <div className="run-progress">
      <div className="run-progress-top">
        <div className="run-progress-left">
          <span className={`run-progress-status ${isRunning ? 'running' : statusText === 'Completed' ? 'completed' : statusText === 'Failed' ? 'failed' : ''}`}>
            {displayStatus}
          </span>
          {displayLabel && (
            <span className="run-progress-title">
              {displayLabel}
              {displayIndex && ` (${displayIndex})`}
            </span>
          )}
        </div>
        {onCancel && isRunning && (
          <button
            className="debug-btn debug-btn-small"
            onClick={onCancel}
            style={{ minWidth: 'auto', padding: '4px 12px' }}
          >
            Cancel
          </button>
        )}
      </div>

      {total > 0 && (
        <div className="run-progress-bar">
          <div
            className="run-progress-bar-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      <div className="run-progress-sub">
        {isRunning && elapsedMs > 0 && (
          <span>Elapsed: {formatDuration(elapsedMs)}</span>
        )}
        {!isRunning && finishedAtMs > 0 && elapsedMs > 0 && (
          <span>Duration: {formatDuration(elapsedMs)}</span>
        )}
      </div>

      {errorText && (
        <div className="run-progress-error">
          <strong>Error:</strong> {errorText}
        </div>
      )}
    </div>
  );
}
