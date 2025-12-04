import { useState } from 'react';
import './PriceFilterDialog.css';

export interface PriceFilterDialogProps {
  priceFrom?: number;
  priceTo?: number;
  onConfirm: (priceFrom?: number, priceTo?: number) => void;
  onReset: () => void;
  onClose: () => void;
}

const MIN_PRICE = 0;
const MAX_PRICE = 3000000; // 3 million NIS

export function PriceFilterDialog({
  priceFrom: initialPriceFrom,
  priceTo: initialPriceTo,
  onConfirm,
  onReset,
  onClose,
}: PriceFilterDialogProps) {
  const [priceFrom, setPriceFrom] = useState<number | undefined>(initialPriceFrom);
  const [priceTo, setPriceTo] = useState<number | undefined>(initialPriceTo);

  const formatPrice = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    return value.toLocaleString('he-IL');
  };

  const parsePrice = (value: string): number | undefined => {
    const cleaned = value.replace(/[^\d]/g, '');
    if (!cleaned) return undefined;
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  const handlePriceFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parsePrice(e.target.value);
    setPriceFrom(parsed);
    // Auto-fix if from > to
    if (parsed !== undefined && priceTo !== undefined && parsed > priceTo) {
      setPriceTo(parsed);
    }
  };

  const handlePriceToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parsePrice(e.target.value);
    setPriceTo(parsed);
    // Auto-fix if to < from
    if (parsed !== undefined && priceFrom !== undefined && parsed < priceFrom) {
      setPriceFrom(parsed);
    }
  };

  const handleSliderFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setPriceFrom(value);
    if (priceTo !== undefined && value > priceTo) {
      setPriceTo(value);
    }
  };

  const handleSliderToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setPriceTo(value);
    if (priceFrom !== undefined && value < priceFrom) {
      setPriceFrom(value);
    }
  };

  const handleConfirm = () => {
    // Validate and normalize
    let from = priceFrom;
    let to = priceTo;

    if (from !== undefined && from < MIN_PRICE) from = MIN_PRICE;
    if (to !== undefined && to > MAX_PRICE) to = MAX_PRICE;
    if (from !== undefined && to !== undefined && from > to) {
      [from, to] = [to, from];
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

  return (
    <div className="filter-dialog-overlay" onClick={onClose}>
      <div className="filter-dialog price-filter-dialog" onClick={(e) => e.stopPropagation()}>
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
                  value={formatPrice(priceFrom)}
                  onChange={handlePriceFromChange}
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
                  value={formatPrice(priceTo)}
                  onChange={handlePriceToChange}
                  placeholder={formatPrice(MAX_PRICE)}
                  dir="ltr"
                />
                <span className="price-currency">₪</span>
              </div>
            </div>
          </div>

          {/* Range slider */}
          <div className="price-slider-container">
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
                value={currentFrom}
                onChange={handleSliderFromChange}
                className="price-slider price-slider-from"
              />
              <input
                type="range"
                min={MIN_PRICE}
                max={MAX_PRICE}
                value={currentTo}
                onChange={handleSliderToChange}
                className="price-slider price-slider-to"
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
    </div>
  );
}

