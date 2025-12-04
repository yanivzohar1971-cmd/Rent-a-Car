import './FilterChip.css';

export interface FilterChipProps {
  label: string;
  isActive?: boolean;
  activeBadgeText?: string;
  onClick: () => void;
}

export function FilterChip({ label, isActive = false, activeBadgeText, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`filter-chip ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="filter-chip-label">{label}</span>
      {activeBadgeText && (
        <span className="filter-chip-badge">{activeBadgeText}</span>
      )}
      <span className="filter-chip-arrow">▼</span>
    </button>
  );
}

