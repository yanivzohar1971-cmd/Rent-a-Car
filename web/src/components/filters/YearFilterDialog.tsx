import { useState, useRef } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import './YearFilterDialog.css';

export interface YearFilterDialogProps {
  yearFrom?: number;
  yearTo?: number;
  onConfirm: (yearFrom?: number, yearTo?: number) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1990;
const YEARS = Array.from({ length: CURRENT_YEAR - MIN_YEAR + 1 }, (_, i) => CURRENT_YEAR - i);

export function YearFilterDialog({
  yearFrom: initialYearFrom,
  yearTo: initialYearTo,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: YearFilterDialogProps) {
  const [yearFrom, setYearFrom] = useState<number | undefined>(initialYearFrom);
  const [yearTo, setYearTo] = useState<number | undefined>(initialYearTo);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  const handleConfirm = () => {
    // Validate and normalize
    let from = yearFrom;
    let to = yearTo;

    if (from !== undefined && to !== undefined && from > to) {
      [from, to] = [to, from];
    }

    onConfirm(from, to);
    onClose();
  };

  const handleReset = () => {
    setYearFrom(undefined);
    setYearTo(undefined);
    onReset();
  };

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog year-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="filter-dialog-header">
          <h3 className="filter-dialog-title">טווח שנים</h3>
          <button type="button" className="filter-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="filter-dialog-content">
          <div className="year-info-text">
            ניתן לבחור טווח שנים
          </div>

          {/* Year dropdowns */}
          <div className="year-inputs-row">
            <div className="year-input-group">
              <label className="year-input-label">מ-</label>
              <select
                className="year-select"
                value={yearFrom || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  setYearFrom(value);
                  if (value !== undefined && yearTo !== undefined && value > yearTo) {
                    setYearTo(value);
                  }
                }}
              >
                <option value="">כל השנים</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="year-input-group">
              <label className="year-input-label">עד</label>
              <select
                className="year-select"
                value={yearTo || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  setYearTo(value);
                  if (value !== undefined && yearFrom !== undefined && value < yearFrom) {
                    setYearFrom(value);
                  }
                }}
              >
                <option value="">כל השנים</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
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

