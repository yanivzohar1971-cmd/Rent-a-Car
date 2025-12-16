import { useState, useRef, useEffect } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import { normalizeRanges } from '../../utils/rangeValidation';
import type { CarFilters } from '../../api/carsApi';
import '../../styles.css';
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
const YEARS = Array.from({ length: CURRENT_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

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

  // Normalize on mount and when values change to ensure from <= to (only when both are defined)
  useEffect(() => {
    if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
      setYearTo(yearFrom);
    }
  }, [yearFrom, yearTo]);

  const handleConfirm = () => {
    // Build temporary filters object for normalization
    const tempFilters: CarFilters = {
      yearFrom,
      yearTo,
    };
    
    // Use clamp mode for interactive dialogs (consistent with local clamp behavior)
    const result = normalizeRanges(tempFilters, { mode: 'clamp' });
    const normalized = result.normalized;
    
    // Extract normalized values
    const from = normalized.yearFrom;
    const to = normalized.yearTo;

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
              <label className="year-input-label" htmlFor="yearFromDialog">מ-</label>
              <label className="sr-only" htmlFor="yearFromDialog">שנת התחלה</label>
              <select
                id="yearFromDialog"
                className="year-select"
                value={yearFrom || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  setYearFrom(value);
                }}
                aria-label="שנת התחלה"
              >
                <option value="">כל השנים</option>
                {YEARS.filter((year) => {
                  const maxYear = yearTo ?? CURRENT_YEAR;
                  return year <= maxYear;
                }).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="year-input-group">
              <label className="year-input-label" htmlFor="yearToDialog">עד</label>
              <label className="sr-only" htmlFor="yearToDialog">שנת סיום</label>
              <select
                id="yearToDialog"
                className="year-select"
                value={yearTo || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                  setYearTo(value);
                }}
                aria-label="שנת סיום"
              >
                <option value="">כל השנים</option>
                {YEARS.filter((year) => {
                  const minYear = yearFrom ?? MIN_YEAR;
                  return year >= minYear;
                }).map((year) => (
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

