import { useState, useRef } from 'react';
import { useClickOutside } from '../../utils/useClickOutside';
import type { FilterDisplayMode } from './BrandFilterDialog';
import './PriceFilterDialog.css';

export interface PriceFilterDialogProps {
  priceFrom?: number;
  priceTo?: number;
  onConfirm: (priceFrom?: number, priceTo?: number) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

const MIN_PRICE = 0;
const MAX_PRICE = 3000000; // 3 million NIS

export function PriceFilterDialog({
  priceFrom: initialPriceFrom,
  priceTo: initialPriceTo,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: PriceFilterDialogProps) {
  const [priceFrom, setPriceFrom] = useState<number | undefined>(initialPriceFrom);
  const [priceTo, setPriceTo] = useState<number | undefined>(initialPriceTo);
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

  const formatPrice = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    return value.toLocaleString('he-IL');
  };

  const parsePrice = (text: string): number | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[,\s]/g, '');
    if (!cleaned || !/^\d+$/.test(cleaned)) return null;
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const handlePriceFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setRawFromText(inputValue);
    const parsed = parsePrice(inputValue);
    if (parsed !== null) {
      const currentTo = priceTo ?? MAX_PRICE;
      const clamped = Math.min(parsed, currentTo);
      setPriceFrom(clamped);
    }
    // If null, keep raw text for user to continue typing, don't update numeric state
  };

  const handlePriceToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setRawToText(inputValue);
    const parsed = parsePrice(inputValue);
    if (parsed !== null) {
      const currentFrom = priceFrom ?? MIN_PRICE;
      const clamped = Math.max(parsed, currentFrom);
      setPriceTo(clamped);
    }
    // If null, keep raw text for user to continue typing, don't update numeric state
  };

  const handlePriceFromBlur = () => {
    setFocusedInput(null);
    const parsed = parsePrice(rawFromText ?? '');
    if (parsed !== null) {
      const currentTo = priceTo ?? MAX_PRICE;
      const clamped = Math.min(parsed, currentTo);
      setPriceFrom(clamped);
    } else {
      // On blur with invalid/empty, fallback to current slider value
      setPriceFrom(priceFrom ?? MIN_PRICE);
    }
    setRawFromText(null);
  };

  const handlePriceToBlur = () => {
    setFocusedInput(null);
    const parsed = parsePrice(rawToText ?? '');
    if (parsed !== null) {
      const currentFrom = priceFrom ?? MIN_PRICE;
      const clamped = Math.max(parsed, currentFrom);
      setPriceTo(clamped);
    } else {
      // On blur with invalid/empty, fallback to current slider value
      setPriceTo(priceTo ?? MAX_PRICE);
    }
    setRawToText(null);
  };

  const handleSliderFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    const currentTo = priceTo ?? MAX_PRICE;
    const clamped = Math.min(value, currentTo);
    setPriceFrom(clamped);
  };

  const handleSliderToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    const currentFrom = priceFrom ?? MIN_PRICE;
    const clamped = Math.max(value, currentFrom);
    setPriceTo(clamped);
  };

  const handleConfirm = () => {
    // Normalize any raw text inputs on confirm
    if (focusedInput === 'from' && rawFromText !== null) {
      const parsed = parsePrice(rawFromText);
      if (parsed !== null) {
        const currentTo = priceTo ?? MAX_PRICE;
        const clamped = Math.min(parsed, currentTo);
        setPriceFrom(clamped);
      }
    }
    if (focusedInput === 'to' && rawToText !== null) {
      const parsed = parsePrice(rawToText);
      if (parsed !== null) {
        const currentFrom = priceFrom ?? MIN_PRICE;
        const clamped = Math.max(parsed, currentFrom);
        setPriceTo(clamped);
      }
    }

    // Validate and normalize
    let from = priceFrom;
    let to = priceTo;

    if (from !== undefined && from < MIN_PRICE) from = MIN_PRICE;
    if (to !== undefined && to > MAX_PRICE) to = MAX_PRICE;
    if (from !== undefined && to !== undefined && from > to) {
      to = from; // Do NOT swap, clamp to ensure from <= to
    }

    onConfirm(from, to);
    onClose();
  };

  const handleReset = () => {
    setPriceFrom(undefined);
    setPriceTo(undefined);
    onReset();
  };

  const currentFrom = priceFrom ?? MIN_PRICE;
  const currentTo = priceTo ?? MAX_PRICE;
  
  // Determine which slider should be on top for z-index
  const STEP = 1000;
  const fromOnTop = currentFrom > (MAX_PRICE * 0.6) || currentFrom >= currentTo - STEP;

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog price-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="filter-dialog-header">
          <h3 className="filter-dialog-title">טווח מחיר</h3>
          <button type="button" className="filter-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="filter-dialog-content">
          <div className="price-info-text">
            ניתן לבחור טווח מחיר
          </div>

          {/* Price inputs */}
          <div className="price-inputs-row">
            <div className="price-input-group">
              <label className="price-input-label">מ-</label>
              <div className="price-input-wrapper">
                <input
                  type="text"
                  className="price-input"
                  value={focusedInput === 'from' && rawFromText !== null ? rawFromText : formatPrice(priceFrom)}
                  onChange={handlePriceFromChange}
                  onFocus={() => {
                    setFocusedInput('from');
                    setRawFromText(formatPrice(priceFrom));
                  }}
                  onBlur={handlePriceFromBlur}
                  placeholder="0"
                  dir="ltr"
                />
                <span className="price-currency">₪</span>
              </div>
            </div>
            <div className="price-input-group">
              <label className="price-input-label">עד</label>
              <div className="price-input-wrapper">
                <input
                  type="text"
                  className="price-input"
                  value={focusedInput === 'to' && rawToText !== null ? rawToText : formatPrice(priceTo)}
                  onChange={handlePriceToChange}
                  onFocus={() => {
                    setFocusedInput('to');
                    setRawToText(formatPrice(priceTo));
                  }}
                  onBlur={handlePriceToBlur}
                  placeholder={formatPrice(MAX_PRICE)}
                  dir="ltr"
                />
                <span className="price-currency">₪</span>
              </div>
            </div>
          </div>

          {/* Range slider */}
          <div className="price-slider-container" dir="ltr">
            <div className="price-slider-track">
              <div
                className="price-slider-range"
                style={{
                  left: `${(currentFrom / MAX_PRICE) * 100}%`,
                  width: `${((currentTo - currentFrom) / MAX_PRICE) * 100}%`,
                }}
              />
              <input
                type="range"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={1000}
                value={currentFrom}
                onChange={handleSliderFromChange}
                className={`price-slider price-slider-from ${fromOnTop ? 'price-slider-top' : 'price-slider-bottom'}`}
              />
              <input
                type="range"
                min={MIN_PRICE}
                max={MAX_PRICE}
                step={1000}
                value={currentTo}
                onChange={handleSliderToChange}
                className={`price-slider price-slider-to ${fromOnTop ? 'price-slider-bottom' : 'price-slider-top'}`}
              />
            </div>
            <div className="price-slider-labels">
              <span>{formatPrice(MIN_PRICE)} ₪</span>
              <span>{formatPrice(MAX_PRICE)} ₪</span>
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

