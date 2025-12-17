// NOTE (AI / Cursor):
// This dialog is part of the Build Info Center and must always exist.
// Do NOT remove it or downgrade it to a placeholder.
// You may extend the fields, improve UX, or connect CI/CD data,
// but the dialog must remain functional.
// See web/docs/AI_GLOBAL_RULES.md (Build Info Center section).

import { useEffect } from 'react';
import './BuildInfoDialog.css';
import { BUILD_CHANGELOG, type BuildEntry } from '../config/buildChangelog';

interface BuildInfoDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Render a single build entry card
 */
function BuildCard({ entry, isCurrent }: { entry: BuildEntry; isCurrent?: boolean }) {
  if (isCurrent) {
    // Current version card
    return (
      <div className="build-info-current-card">
        <div className="build-info-current-header">
          <span className="build-info-current-topic">{entry.topic}</span>
          <span className="build-info-current-meta">
            {entry.label} | {entry.env}
          </span>
        </div>
        
        <div className="build-info-current-timestamp">
          {entry.timestamp}
        </div>
        
        {entry.summary && (
          <p className="build-info-current-summary">{entry.summary}</p>
        )}
        
        {entry.changes && entry.changes.length > 0 && (
          <div className="build-info-current-topics">
            {entry.changes.map((change, idx) => (
              <div key={idx} className="build-info-topic-card">
                <div className="build-info-topic-title">{change.title}</div>
                {change.description && (
                  <div className="build-info-topic-body">{change.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // History card
  return (
    <div className="build-info-history-card">
      <div className="build-info-history-header">
        <div className="build-info-history-title">{entry.topic}</div>
        <div className="build-info-history-meta">
          {entry.label} | {entry.env} | {entry.timestamp}
        </div>
      </div>
      
      {entry.summary && (
        <p className="build-info-history-summary">{entry.summary}</p>
      )}
      
      {entry.changes && entry.changes.length > 0 && (
        <div className="build-info-history-topics">
          {entry.changes.map((change, idx) => (
            <div key={idx} className="build-info-topic-card">
              <div className="build-info-topic-title">{change.title}</div>
              {change.description && (
                <div className="build-info-topic-body">{change.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Build Info Dialog Component
 * Displays current build and version history in a modal dialog
 */
export function BuildInfoDialog({ open, onClose }: BuildInfoDialogProps) {
  // Handle ESC key to close dialog
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const [current, ...history] = BUILD_CHANGELOG;

  return (
    <div className="buildinfo-backdrop" onClick={onClose}>
      <div
        className="buildinfo-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buildinfo-title"
      >
        <header className="buildinfo-header">
          <h2 id="buildinfo-title" className="build-info-dialog-title">מידע על גרסאות המערכת</h2>
          <button
            type="button"
            className="buildinfo-close"
            onClick={onClose}
            aria-label="סגירת חלון מידע על גרסה"
          >
            ×
          </button>
        </header>

        <div className="build-info-content">
          {current && (
            <section className="buildinfo-section">
              <h3 className="buildinfo-section-title">הגרסה הנוכחית</h3>
              <BuildCard entry={current} isCurrent />
            </section>
          )}

          {history.length > 0 && (
            <section className="buildinfo-section">
              <h3 className="buildinfo-section-title">היסטוריית גרסאות</h3>
              <div className="buildinfo-history-list build-info-scroll">
                {history.map((entry, idx) => (
                  <BuildCard key={`${entry.version}-${idx}`} entry={entry} />
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="buildinfo-footer">
          <p className="buildinfo-footer-note">
            הגרסאות מסודרות מהחדשה לישנה. לעדכונים נוספים עקבו אחר ההודעות במערכת.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default BuildInfoDialog;

