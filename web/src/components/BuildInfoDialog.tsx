// NOTE (AI / Cursor):
// This dialog is part of the Build Info Center and must always exist.
// Do NOT remove it or downgrade it to a placeholder.
// You may extend the fields, improve UX, or connect CI/CD data,
// but the dialog must remain functional.
// See web/docs/AI_GLOBAL_RULES.md (Build Info Center section).

import { useEffect } from 'react';
import './BuildInfoDialog.css';
import { BUILD_CHANGELOG, type BuildEntry, type BuildChangeItem } from '../config/buildChangelog';

interface BuildInfoDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Get Hebrew label for change type
 */
function getChangeTypeLabel(type: BuildChangeItem['type']): string {
  const labels: Record<BuildChangeItem['type'], string> = {
    feature: '✨ תכונה חדשה',
    bugfix: '🐛 תיקון באג',
    ui: '🎨 עיצוב',
    infra: '🔧 תשתית',
    other: '📝 אחר',
  };
  return labels[type] || type;
}

/**
 * Render a single build entry card
 */
function BuildCard({ entry, isCurrent }: { entry: BuildEntry; isCurrent?: boolean }) {
  return (
    <div className={`buildinfo-card ${isCurrent ? 'current' : ''}`}>
      <div className="buildinfo-card-header">
        <span className="buildinfo-card-topic">{entry.topic}</span>
        <span className="buildinfo-card-meta">
          {entry.label} | {entry.env}
        </span>
      </div>
      
      <div className="buildinfo-card-timestamp">
        {entry.timestamp}
      </div>
      
      {entry.summary && (
        <p className="buildinfo-card-summary">{entry.summary}</p>
      )}
      
      {entry.changes && entry.changes.length > 0 && (
        <ul className="buildinfo-card-changes">
          {entry.changes.map((change, idx) => (
            <li key={idx} className="buildinfo-change-item">
              <span className="buildinfo-change-type">{getChangeTypeLabel(change.type)}</span>
              <span className="buildinfo-change-title">{change.title}</span>
              {change.description && (
                <span className="buildinfo-change-desc"> – {change.description}</span>
              )}
            </li>
          ))}
        </ul>
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
          <h2 id="buildinfo-title">מידע על גרסאות המערכת</h2>
          <button
            type="button"
            className="buildinfo-close"
            onClick={onClose}
            aria-label="סגירת חלון מידע על גרסה"
          >
            ×
          </button>
        </header>

        {current && (
          <section className="buildinfo-section">
            <h3 className="buildinfo-section-title">הגרסה הנוכחית</h3>
            <BuildCard entry={current} isCurrent />
          </section>
        )}

        {history.length > 0 && (
          <section className="buildinfo-section">
            <h3 className="buildinfo-section-title">היסטוריית גרסאות</h3>
            <div className="buildinfo-history-list">
              {history.map((entry, idx) => (
                <BuildCard key={`${entry.version}-${idx}`} entry={entry} />
              ))}
            </div>
          </section>
        )}

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

