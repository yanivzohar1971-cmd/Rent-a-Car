import { useState, useRef } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import { GearboxType, getGearboxTypeLabel } from '../../types/carTypes';
import { formatGearboxSummary } from '../../utils/filterSummary';
import './GearboxFilterDialog.css';

export interface GearboxFilterDialogProps {
  selectedGearboxTypes: GearboxType[];
  onConfirm: (types: GearboxType[]) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

// At minimum, support AUTOMATIC and MANUAL; optionally include ROBOTIC and CVT
const AVAILABLE_GEARBOX_TYPES: GearboxType[] = [
  GearboxType.AUTOMATIC,
  GearboxType.MANUAL,
  GearboxType.ROBOTIC,
  GearboxType.CVT,
];

export function GearboxFilterDialog({
  selectedGearboxTypes: initialSelectedGearboxTypes,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: GearboxFilterDialogProps) {
  const [selectedGearboxTypes, setSelectedGearboxTypes] = useState<GearboxType[]>(initialSelectedGearboxTypes);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  const handleGearboxToggle = (type: GearboxType) => {
    setSelectedGearboxTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleConfirm = () => {
    onConfirm(selectedGearboxTypes);
    onClose();
  };

  const handleReset = () => {
    setSelectedGearboxTypes([]);
    onReset();
  };

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog gearbox-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dialog-header">
        <h3 className="filter-dialog-title">בחירת תיבת הילוכים</h3>
        <button type="button" className="filter-dialog-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="filter-dialog-content">
        {/* Selected summary */}
        <div className="filter-selected-summary">
          {formatGearboxSummary(selectedGearboxTypes)}
        </div>
        <div className="gearbox-info-text">
          בחר סוגי תיבות הילוכים
        </div>

        <div className="gearbox-chips-container">
          {/* "הכל" option */}
          <button
            type="button"
            className={`gearbox-chip ${selectedGearboxTypes.length === 0 ? 'selected' : ''}`}
            onClick={() => setSelectedGearboxTypes([])}
          >
            הכל
          </button>
          {AVAILABLE_GEARBOX_TYPES.map((type) => {
            const isSelected = selectedGearboxTypes.includes(type);
            
            return (
              <button
                key={type}
                type="button"
                className={`gearbox-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleGearboxToggle(type)}
              >
                {getGearboxTypeLabel(type)}
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
