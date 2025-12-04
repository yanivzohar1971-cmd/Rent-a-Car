import { useState, useRef, useEffect } from 'react';
import { BodyType } from '../../types/carTypes';
import { FuelType, getFuelTypeLabel } from '../../types/carTypes';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import './CarTypeFilterDialog.css';

export interface CarTypeFilterDialogProps {
  selectedBodyTypes: BodyType[];
  selectedFuelTypes: FuelType[];
  onConfirm: (bodyTypes: BodyType[], fuelTypes: FuelType[]) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

const POPULAR_FUEL_TYPES: FuelType[] = [
  FuelType.HYBRID,
  FuelType.ELECTRIC,
];

// Simplified mapping for grid display
// Each option has a unique key for selection tracking, but maps to BodyType for filtering
type CarTypeOption = {
  id: string; // Unique identifier for selection (used instead of BodyType to avoid conflicts)
  type: BodyType; // Actual BodyType for filtering
  label: string;
  icon: string;
};

const BODY_TYPE_GRID: CarTypeOption[] = [
  { id: 'hatchback', type: BodyType.HATCHBACK, label: 'קטנים', icon: '🚗' },
  { id: 'sedan', type: BodyType.SEDAN, label: 'משפחתיים', icon: '🚙' },
  { id: 'suv-managers', type: BodyType.SUV, label: 'מנהלים', icon: '🚗' },
  { id: 'coupe', type: BodyType.COUPE, label: 'ספורט', icon: '🏎️' },
  { id: 'pickup', type: BodyType.PICKUP, label: 'טנדרים', icon: '🚚' },
  { id: 'suv-jeeps', type: BodyType.SUV, label: 'ג\'יפים', icon: '🚙' },
  { id: 'van', type: BodyType.VAN, label: 'מיניוואנים / 7+', icon: '🚐' },
  { id: 'wagon', type: BodyType.WAGON, label: 'מסחריות', icon: '🚛' },
  { id: 'suv-crossover', type: BodyType.SUV, label: 'קרוסאובר', icon: '🚗' },
];

export function CarTypeFilterDialog({
  selectedBodyTypes: initialBodyTypes,
  selectedFuelTypes: initialFuelTypes,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: CarTypeFilterDialogProps) {
  // Map initial body types to selected option IDs
  // Note: For SUV types, we can't distinguish which specific variant was selected
  // from just the BodyType array, so we don't pre-select any SUV variants
  const getInitialSelectedIds = (): string[] => {
    const selectedIds: string[] = [];
    BODY_TYPE_GRID.forEach(option => {
      // For non-SUV types, if the BodyType is in initialBodyTypes, select this option
      if (option.type !== BodyType.SUV && initialBodyTypes.includes(option.type)) {
        selectedIds.push(option.id);
      }
      // For SUV types, we don't pre-select (user must explicitly choose)
      // This ensures each SUV variant can be selected independently
    });
    return selectedIds;
  };

  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(getInitialSelectedIds());
  const [selectedFuelTypes, setSelectedFuelTypes] = useState<FuelType[]>(initialFuelTypes);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  // Sync selectedTypeIds when initialBodyTypes changes (e.g., when dialog reopens)
  useEffect(() => {
    setSelectedTypeIds(getInitialSelectedIds());
  }, [initialBodyTypes]);

  const handleBodyTypeToggle = (optionId: string) => {
    setSelectedTypeIds(prev => {
      if (prev.includes(optionId)) {
        return prev.filter(id => id !== optionId);
      } else {
        return [...prev, optionId];
      }
    });
  };

  const handleFuelTypeToggle = (type: FuelType) => {
    if (selectedFuelTypes.includes(type)) {
      setSelectedFuelTypes(selectedFuelTypes.filter((t) => t !== type));
    } else {
      setSelectedFuelTypes([...selectedFuelTypes, type]);
    }
  };

  const handleConfirm = () => {
    // Convert selected option IDs back to BodyType array
    const selectedBodyTypes: BodyType[] = [];
    const uniqueBodyTypes = new Set<BodyType>();
    
    selectedTypeIds.forEach(id => {
      const option = BODY_TYPE_GRID.find(opt => opt.id === id);
      if (option && !uniqueBodyTypes.has(option.type)) {
        uniqueBodyTypes.add(option.type);
        selectedBodyTypes.push(option.type);
      }
    });

    onConfirm(selectedBodyTypes, selectedFuelTypes);
    onClose();
  };

  const handleReset = () => {
    setSelectedTypeIds([]);
    setSelectedFuelTypes([]);
    onReset();
  };

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog car-type-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="filter-dialog-header">
          <h3 className="filter-dialog-title">סוג רכב</h3>
          <button type="button" className="filter-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="filter-dialog-content">
          <div className="car-type-info-text">
            בחירת סוג הרכב היא לא חובה
          </div>

          {/* Body types grid */}
          <div className="body-types-grid">
            {BODY_TYPE_GRID.map((item) => {
              const isSelected = selectedTypeIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`body-type-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleBodyTypeToggle(item.id)}
                >
                  <div className="body-type-icon">{item.icon}</div>
                  <div className="body-type-label">{item.label}</div>
                </button>
              );
            })}
          </div>

          {/* Popular filters */}
          <div className="popular-filters-section">
            <div className="popular-filters-label">סינונים פופולריים</div>
            <div className="popular-filters-tags">
              {POPULAR_FUEL_TYPES.map((fuelType) => {
                const isSelected = selectedFuelTypes.includes(fuelType);
                return (
                  <button
                    key={fuelType}
                    type="button"
                    className={`popular-filter-tag ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleFuelTypeToggle(fuelType)}
                  >
                    {getFuelTypeLabel(fuelType)}
                  </button>
                );
              })}
            </div>
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

