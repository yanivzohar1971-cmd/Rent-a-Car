import { useState } from 'react';
import { BodyType } from '../../types/carTypes';
import { FuelType, getFuelTypeLabel } from '../../types/carTypes';
import './CarTypeFilterDialog.css';

export interface CarTypeFilterDialogProps {
  selectedBodyTypes: BodyType[];
  selectedFuelTypes: FuelType[];
  onConfirm: (bodyTypes: BodyType[], fuelTypes: FuelType[]) => void;
  onReset: () => void;
  onClose: () => void;
}

const POPULAR_FUEL_TYPES: FuelType[] = [
  FuelType.HYBRID,
  FuelType.ELECTRIC,
];

// Simplified mapping for grid display
// Note: Using SUV for multiple categories as per Yad2 style
const BODY_TYPE_GRID: Array<{ type: BodyType; label: string; icon: string; key: string }> = [
  { type: BodyType.HATCHBACK, label: 'קטנים', icon: '🚗', key: 'hatchback' },
  { type: BodyType.SEDAN, label: 'משפחתיים', icon: '🚙', key: 'sedan' },
  { type: BodyType.SUV, label: 'מנהלים', icon: '🚗', key: 'suv-managers' },
  { type: BodyType.COUPE, label: 'ספורט', icon: '🏎️', key: 'coupe' },
  { type: BodyType.PICKUP, label: 'טנדרים', icon: '🚚', key: 'pickup' },
  { type: BodyType.SUV, label: 'ג\'יפים', icon: '🚙', key: 'suv-jeeps' },
  { type: BodyType.VAN, label: 'מיניוואנים / 7+', icon: '🚐', key: 'van' },
  { type: BodyType.WAGON, label: 'מסחריות', icon: '🚛', key: 'wagon' },
  { type: BodyType.SUV, label: 'קרוסאובר', icon: '🚗', key: 'suv-crossover' },
];

export function CarTypeFilterDialog({
  selectedBodyTypes: initialBodyTypes,
  selectedFuelTypes: initialFuelTypes,
  onConfirm,
  onReset,
  onClose,
}: CarTypeFilterDialogProps) {
  const [selectedBodyTypes, setSelectedBodyTypes] = useState<BodyType[]>(initialBodyTypes);
  const [selectedFuelTypes, setSelectedFuelTypes] = useState<FuelType[]>(initialFuelTypes);

  const handleBodyTypeToggle = (type: BodyType) => {
    if (selectedBodyTypes.includes(type)) {
      setSelectedBodyTypes(selectedBodyTypes.filter((t) => t !== type));
    } else {
      setSelectedBodyTypes([...selectedBodyTypes, type]);
    }
  };

  const handleFuelTypeToggle = (type: FuelType) => {
    if (selectedFuelTypes.includes(type)) {
      setSelectedFuelTypes(selectedFuelTypes.filter((t) => t !== type));
    } else {
      setSelectedFuelTypes([...selectedFuelTypes, type]);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedBodyTypes, selectedFuelTypes);
    onClose();
  };

  const handleReset = () => {
    setSelectedBodyTypes([]);
    setSelectedFuelTypes([]);
    onReset();
  };

  return (
    <div className="filter-dialog-overlay" onClick={onClose}>
      <div className="filter-dialog car-type-filter-dialog" onClick={(e) => e.stopPropagation()}>
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
              const isSelected = selectedBodyTypes.includes(item.type);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`body-type-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleBodyTypeToggle(item.type)}
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
    </div>
  );
}

