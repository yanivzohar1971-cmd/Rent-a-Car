import { useState, useRef } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import { formatColorSummary } from '../../utils/filterSummary';
import './ColorFilterDialog.css';

export interface ColorFilterDialogProps {
  selectedColor?: string;
  onConfirm: (color?: string) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

interface ColorOption {
  value: string;
  label: string;
  hex: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  { value: 'כחול', label: 'כחול', hex: '#1E88E5' },
  { value: 'ירוק', label: 'ירוק', hex: '#43A047' },
  { value: 'חום', label: 'חום', hex: '#8D6E63' },
  { value: 'ורוד', label: 'ורוד', hex: '#E91E63' },
  { value: 'אפור', label: 'אפור', hex: '#757575' },
  { value: 'אדום', label: 'אדום', hex: '#E53935' },
  { value: 'שחור', label: 'שחור', hex: '#212121' },
  { value: 'צהוב', label: 'צהוב', hex: '#FDD835' },
  { value: 'סגול', label: 'סגול', hex: '#9C27B0' },
  { value: 'לבן', label: 'לבן', hex: '#FFFFFF' },
  { value: 'כתום', label: 'כתום', hex: '#FF9800' },
  { value: 'כסף', label: 'כסף', hex: '#C0C0C0' },
];

export function ColorFilterDialog({
  selectedColor: initialSelectedColor,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: ColorFilterDialogProps) {
  const [selectedColor, setSelectedColor] = useState<string | undefined>(initialSelectedColor);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  const handleColorClick = (colorValue: string) => {
    if (colorValue === '') {
      // "הכל" option - clear selection
      setSelectedColor(undefined);
    } else if (selectedColor === colorValue) {
      // Deselect if clicking the same color
      setSelectedColor(undefined);
    } else {
      setSelectedColor(colorValue);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedColor);
    onClose();
  };

  const handleReset = () => {
    setSelectedColor(undefined);
    onReset();
  };

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog color-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dialog-header">
        <h3 className="filter-dialog-title">בחירת צבע</h3>
        <button type="button" className="filter-dialog-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="filter-dialog-content">
        {/* Selected summary */}
        <div className="filter-selected-summary">
          {formatColorSummary(selectedColor)}
        </div>
        <div className="color-info-text">
          בחר צבע רכב
        </div>

        <div className="color-grid">
          {/* "הכל" option */}
          <button
            type="button"
            className={`color-option color-option-all ${!selectedColor ? 'selected' : ''}`}
            onClick={() => handleColorClick('')}
            aria-label="הכל"
          >
            {!selectedColor && (
              <span className="color-checkmark">✓</span>
            )}
            <span className="color-label">הכל</span>
          </button>
          {COLOR_OPTIONS.map((color) => {
            const isSelected = selectedColor === color.value;
            const isWhite = color.value === 'לבן';
            
            return (
              <button
                key={color.value}
                type="button"
                className={`color-option ${isSelected ? 'selected' : ''} ${isWhite ? 'is-white' : ''}`}
                onClick={() => handleColorClick(color.value)}
                style={{
                  backgroundColor: color.hex,
                }}
                aria-label={color.label}
              >
                {isSelected && (
                  <span className="color-checkmark">✓</span>
                )}
                <span className="color-label">{color.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={handleReset}>
          איפוס
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          אישור
        </button>
      </div>
    </div>
  );

  if (mode === 'popover') {
    return content;
  }

  return (
    <div className="filter-dialog-overlay" onClick={onClose}>
      {content}
    </div>
  );
}
