import { useState, useRef } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import { normalizeRanges } from '../../utils/rangeValidation';
import type { CarFilters } from '../../api/carsApi';
import { formatKmSummary } from '../../utils/filterSummary';
import { MIN_KM, MAX_KM } from '../../constants/filterLimits';
import './KmFilterDialog.css';

export interface KmFilterDialogProps {
  kmFrom?: number;
  kmTo?: number;
  onConfirm: (kmFrom?: number, kmTo?: number) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

const STEP = 1000;

export function KmFilterDialog({
  kmFrom: initialKmFrom,
  kmTo: initialKmTo,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: KmFilterDialogProps) {
  const [kmFrom, setKmFrom] = useState<number | undefined>(initialKmFrom);
  const [kmTo, setKmTo] = useState<number | undefined>(initialKmTo);
  const [rawFromText, setRawFromText] = useState<string | null>(null);
  const [rawToText, setRawToText] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<'from' | 'to' | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  const formatKm = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    return value.toLocaleString('he-IL');
  };

  const parseKm = (text: string): number | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[,\s]/g, '');
    if (!cleaned || !/^\d+$/.test(cleaned)) return null;
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const handleKmFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setRawFromText(inputValue);
    const parsed = parseKm(inputValue);
    if (parsed !== null) {
      const currentTo = kmTo ?? MAX_KM;
      const clamped = Math.min(parsed, currentTo);
      setKmFrom(clamped);
    }
  };

  const handleKmToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setRawToText(inputValue);
    const parsed = parseKm(inputValue);
    if (parsed !== null) {
      const currentFrom = kmFrom ?? MIN_KM;
      const clamped = Math.max(parsed, currentFrom);
      setKmTo(clamped);
    }
  };

  const handleKmFromBlur = () => {
    setFocusedInput(null);
    const parsed = parseKm(rawFromText ?? '');
    if (parsed !== null) {
      const currentTo = kmTo ?? MAX_KM;
      const clamped = Math.min(parsed, currentTo);
      setKmFrom(clamped);
    } else {
      setKmFrom(kmFrom ?? MIN_KM);
    }
    setRawFromText(null);
  };

  const handleKmToBlur = () => {
    setFocusedInput(null);
    const parsed = parseKm(rawToText ?? '');
    if (parsed !== null) {
      const currentFrom = kmFrom ?? MIN_KM;
      const clamped = Math.max(parsed, currentFrom);
      setKmTo(clamped);
    } else {
      setKmTo(kmTo ?? MAX_KM);
    }
    setRawToText(null);
  };

  const handleSliderFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    const currentTo = kmTo ?? MAX_KM;
    const clamped = Math.min(value, currentTo);
    setKmFrom(clamped);
  };

  const handleSliderToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    const currentFrom = kmFrom ?? MIN_KM;
    const clamped = Math.max(value, currentFrom);
    setKmTo(clamped);
  };

  const handleConfirm = () => {
    // Normalize any raw text inputs on confirm
    if (focusedInput === 'from' && rawFromText !== null) {
      const parsed = parseKm(rawFromText);
      if (parsed !== null) {
        const currentTo = kmTo ?? MAX_KM;
        const clamped = Math.min(parsed, currentTo);
        setKmFrom(clamped);
      }
    }
    if (focusedInput === 'to' && rawToText !== null) {
      const parsed = parseKm(rawToText ?? '');
      if (parsed !== null) {
        const currentFrom = kmFrom ?? MIN_KM;
        const clamped = Math.max(parsed, currentFrom);
        setKmTo(clamped);
      }
    }

    // Build temporary filters object for normalization
    let from = kmFrom;
    let to = kmTo;

    // Apply min/max bounds
    if (from !== undefined && from < MIN_KM) from = MIN_KM;
    if (to !== undefined && to > MAX_KM) to = MAX_KM;

    const tempFilters: CarFilters = {
      kmFrom: from,
      kmTo: to,
    };
    
    // Use clamp mode for interactive dialogs
    const result = normalizeRanges(tempFilters, { mode: 'clamp' });
    const normalized = result.normalized;
    
    // Extract normalized values
    from = normalized.kmFrom;
    to = normalized.kmTo;

    onConfirm(from, to);
    onClose();
  };

  const handleReset = () => {
    setKmFrom(undefined);
    setKmTo(undefined);
    onReset();
  };

  const currentFrom = kmFrom ?? MIN_KM;
  const currentTo = kmTo ?? MAX_KM;
  
  // Determine which slider should be on top for z-index
  const fromOnTop = currentFrom > (MAX_KM * 0.6) || currentFrom >= currentTo - STEP;

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog km-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dialog-header">
        <h3 className="filter-dialog-title">טווח ק״מ</h3>
        <button type="button" className="filter-dialog-close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="filter-dialog-content">
        {/* Selected summary */}
        <div className="filter-selected-summary">
          {formatKmSummary(kmFrom, kmTo)}
        </div>
        <div className="km-info-text">
          ניתן לבחור טווח קילומטראז׳
        </div>

        {/* KM inputs */}
        <div className="km-inputs-row">
          <div className="km-input-group">
            <label className="km-input-label">מ-</label>
            <div className="km-input-wrapper">
              <input
                type="text"
                className="km-input"
                value={focusedInput === 'from' && rawFromText !== null ? rawFromText : formatKm(kmFrom)}
                onChange={handleKmFromChange}
                onFocus={() => {
                  setFocusedInput('from');
                  setRawFromText(formatKm(kmFrom));
                }}
                onBlur={handleKmFromBlur}
                placeholder="0"
                dir="ltr"
              />
              <span className="km-unit">ק״מ</span>
            </div>
          </div>
          <div className="km-input-group">
            <label className="km-input-label">עד</label>
            <div className="km-input-wrapper">
              <input
                type="text"
                className="km-input"
                value={focusedInput === 'to' && rawToText !== null ? rawToText : formatKm(kmTo)}
                onChange={handleKmToChange}
                onFocus={() => {
                  setFocusedInput('to');
                  setRawToText(formatKm(kmTo));
                }}
                onBlur={handleKmToBlur}
                placeholder={formatKm(MAX_KM)}
                dir="ltr"
              />
              <span className="km-unit">ק״מ</span>
            </div>
          </div>
        </div>

        {/* Range slider */}
        <div className="km-slider-container" dir="ltr">
          <div className="km-slider-track">
            <div
              className="km-slider-range"
              style={{
                left: `${(currentFrom / MAX_KM) * 100}%`,
                width: `${((currentTo - currentFrom) / MAX_KM) * 100}%`,
              }}
            />
            <input
              type="range"
              min={MIN_KM}
              max={MAX_KM}
              step={STEP}
              value={currentFrom}
              onChange={handleSliderFromChange}
              className={`km-slider km-slider-from ${fromOnTop ? 'km-slider-top' : 'km-slider-bottom'}`}
            />
            <input
              type="range"
              min={MIN_KM}
              max={MAX_KM}
              step={STEP}
              value={currentTo}
              onChange={handleSliderToChange}
              className={`km-slider km-slider-to ${fromOnTop ? 'km-slider-bottom' : 'km-slider-top'}`}
            />
          </div>
          <div className="km-slider-labels">
            <span>{formatKm(MIN_KM)} ק״מ</span>
            <span>{formatKm(MAX_KM)} ק״מ</span>
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
