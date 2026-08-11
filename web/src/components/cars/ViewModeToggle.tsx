import './ViewModeToggle.css';

export type ViewMode = 'gallery' | 'list';

export interface ViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle" dir="rtl">
      <button
        type="button"
        className={`view-mode-btn ${viewMode === 'gallery' ? 'active' : ''}`}
        onClick={() => onViewModeChange('gallery')}
        aria-label="תצוגת גלריה"
      >
        <span className="view-mode-icon">⊞</span>
        <span className="view-mode-label">גלריה</span>
      </button>
      <button
        type="button"
        className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
        onClick={() => onViewModeChange('list')}
        aria-label="תצוגת רשימה"
      >
        <span className="view-mode-icon">☰</span>
        <span className="view-mode-label">רשימה</span>
      </button>
    </div>
  );
}

