/**
 * Admin Debug Car Picker
 * 
 * AutoComplete picker for selecting a car by plate number / make / model / year.
 * Uses LicensePlateBadge component for plate styling.
 * Auto-fills yardUid if available from car result.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/firebaseClient';
import LicensePlateBadge from '../../../components/common/LicensePlateBadge';
import type { CarLite } from '../debugDataCache';
import './AdminDebugCarPicker.css';

const CARS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const carsCacheByYard: Record<string, { ts: number; items: CarLite[] }> = {};

interface CarSearchResult {
  carId: string;
  yardUid: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  title?: string;
}

interface AdminDebugCarPickerProps {
  value: string; // Display value (plate or search text)
  selectedCar: CarSearchResult | null;
  onValueChange: (value: string) => void;
  onSelectedCarChange: (car: CarSearchResult | null) => void;
  yardUid?: string; // Optional: if provided, search only this yard's cars
  disabled?: boolean;
}

export default function AdminDebugCarPicker({
  value,
  onValueChange,
  onSelectedCarChange,
  yardUid,
  disabled = false,
}: AdminDebugCarPickerProps) {
  const [suggestions, setSuggestions] = useState<CarSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [carsList, setCarsList] = useState<CarLite[]>([]);
  const [carsLoading, setCarsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const suppressNextOpenRef = useRef(false);

  // Load cars list once per yard (with cache)
  const loadCarsList = useCallback(async (targetYardUid: string | undefined, forceRefresh = false) => {
    if (!targetYardUid) {
      setCarsList([]);
      return;
    }

    // Check cache
    const cache = carsCacheByYard[targetYardUid];
    if (!forceRefresh && cache && (Date.now() - cache.ts < CARS_CACHE_TTL)) {
      setCarsList(cache.items);
      return;
    }

    setCarsLoading(true);
    try {
      const listFn = httpsCallable<{ yardUid: string }, { ok: boolean; results: CarLite[] }>(
        functions,
        'adminDebugListYardCars'
      );
      const result = await listFn({ yardUid: targetYardUid });
      
      if (result.data.ok && result.data.results) {
        const items = result.data.results;
        carsCacheByYard[targetYardUid] = { ts: Date.now(), items };
        setCarsList(items);
      } else {
        setCarsList([]);
      }
    } catch (error) {
      console.error('AdminDebugCarPicker: error loading cars list', error);
      setCarsList([]);
    } finally {
      setCarsLoading(false);
    }
  }, []);

  // Load cars when yardUid changes
  useEffect(() => {
    if (yardUid) {
      loadCarsList(yardUid);
    } else {
      setCarsList([]);
    }
    setSelectedCarId(null);
  }, [yardUid, loadCarsList]);

  // Filter suggestions locally when value changes
  useEffect(() => {
    if (!value.trim() || disabled || !yardUid) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    const queryLower = value.trim().toLowerCase();
    // Normalize digits for plate search (remove spaces, dashes)
    const queryNormalized = queryLower.replace(/[\s\-]/g, '');
    
    const filtered = carsList.filter(car => {
      // Search by plate (normalized)
      if (car.plateNumber) {
        const plateNormalized = car.plateNumber.toLowerCase().replace(/[\s\-]/g, '');
        if (plateNormalized.includes(queryNormalized)) {
          return true;
        }
      }
      // Search by make
      if (car.make && car.make.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by model
      if (car.model && car.model.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by title
      if (car.title && car.title.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by year
      if (car.year && car.year.toString().includes(queryLower)) {
        return true;
      }
      // Search by carId
      if (car.carId.toLowerCase().includes(queryLower)) {
        return true;
      }
      return false;
    }).slice(0, 50); // Limit to 50 for UI performance

    // Convert to CarSearchResult format
    const results: CarSearchResult[] = filtered.map(car => ({
      carId: car.carId,
      yardUid: yardUid,
      plateNumber: car.plateNumber ?? undefined,
      make: car.make ?? undefined,
      model: car.model ?? undefined,
      year: car.year ?? undefined,
      title: car.title ?? undefined,
    }));

    setSuggestions(results);
    if (!suppressNextOpenRef.current && results.length > 0 && value.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      suppressNextOpenRef.current = false;
    }
    setHighlightedIndex(-1);
  }, [value, disabled, yardUid, carsList]);

  // Clear selection if text doesn't match selected car
  useEffect(() => {
    if (selectedCarId) {
      const selectedCar = carsList.find(c => c.carId === selectedCarId);
      if (selectedCar) {
        const displayLabel = `${selectedCar.make ?? ''} ${selectedCar.model ?? ''}`.trim() + (selectedCar.year ? ` (${selectedCar.year})` : '');
        if (value !== displayLabel) {
          setSelectedCarId(null);
          onSelectedCarChange(null);
        }
      }
    }
  }, [value, selectedCarId, carsList, onSelectedCarChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelect = (car: CarSearchResult) => {
    suppressNextOpenRef.current = true;
    setSelectedCarId(car.carId);
    // Display make+model+year (NO plate number - plate shown only in badge)
    const displayLabel = `${car.make ?? ''} ${car.model ?? ''}`.trim() + (car.year ? ` (${car.year})` : '');
    onValueChange(displayLabel || car.carId);
    onSelectedCarChange(car);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && value.trim().length > 0) {
      setIsOpen(true);
    }
  };

  const handleClear = () => {
    onValueChange('');
    onSelectedCarChange(null);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionsRef.current) {
      const item = suggestionsRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="admin-debug-car-picker" ref={containerRef}>
      <label className="admin-debug-picker-label">
        Car
        {!yardUid ? (
          <div className="admin-debug-picker-wrapper admin-debug-picker-wrapper-plate">
            <input
              ref={inputRef}
              type="text"
              className="admin-debug-picker-input admin-debug-picker-input-plate"
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onKeyDown={handleKeyDown}
              placeholder="Select a yard first"
              disabled={true}
              dir="ltr"
            />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div className="admin-debug-picker-wrapper admin-debug-picker-wrapper-plate">
                  <input
                    ref={inputRef}
                    type="text"
                    className="admin-debug-picker-input admin-debug-picker-input-plate"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter plate number or car details to search"
                    disabled={disabled || carsLoading}
                    dir="ltr"
                  />
                  {value && !disabled && (
                    <button
                      type="button"
                      className="admin-debug-picker-clear"
                      onClick={handleClear}
                      aria-label="Clear"
                    >
                      ✕
                    </button>
                  )}
                  {carsLoading && (
                    <div className="admin-debug-picker-loading">Loading...</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => yardUid && loadCarsList(yardUid, true)}
                disabled={carsLoading || !yardUid}
                title="Refresh cars list"
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem 0.5rem',
                  fontSize: '0.875rem',
                  background: carsLoading ? '#ccc' : '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: carsLoading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                ⟳
              </button>
            </div>
            {carsLoading && !carsList.length && (
              <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
                Loading cars...
              </small>
            )}
          </div>
        )}
        {(() => {
          const selectedCar = selectedCarId ? carsList.find(c => c.carId === selectedCarId) : null;
          return selectedCar?.plateNumber ? (
            <div className="admin-debug-picker-selected-plate">
              <LicensePlateBadge plate={selectedCar.plateNumber} size="sm" />
            </div>
          ) : null;
        })()}
      </label>
      {isOpen && suggestions.length > 0 && (
        <ul className="admin-debug-picker-suggestions" ref={suggestionsRef}>
          {suggestions.map((car, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={car.carId}
                className={`admin-debug-picker-suggestion ${isHighlighted ? 'highlighted' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(car);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <div className="admin-debug-picker-suggestion-plate">
                  {car.plateNumber ? (
                    <LicensePlateBadge plate={car.plateNumber} size="sm" />
                  ) : (
                    <span className="admin-debug-picker-suggestion-no-plate">No license plate</span>
                  )}
                </div>
                <div className="admin-debug-picker-suggestion-details">
                  {(() => {
                    const displayLabel = `${car.make ?? ''} ${car.model ?? ''}`.trim() + (car.year ? ` (${car.year})` : '');
                    return displayLabel ? (
                      <span className="admin-debug-picker-suggestion-title">{displayLabel}</span>
                    ) : null;
                  })()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
