import './FilterChip.css';

export interface FilterChipProps {
  label: string;
  isActive?: boolean;
  activeBadgeText?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function FilterChip({ label, isActive = false, activeBadgeText, onClick, disabled = false }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`filter-chip ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="filter-chip-label">{label}</span>
      {activeBadgeText && (
        <span className="filter-chip-badge">{activeBadgeText}</span>
      )}
      <span className="filter-chip-arrow">▼</span>
    </button>
  );
}

