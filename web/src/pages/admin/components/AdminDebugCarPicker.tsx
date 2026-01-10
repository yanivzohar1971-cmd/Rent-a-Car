/**
 * Admin Debug Car Picker
 * 
 * AutoComplete picker for selecting a car by plate number / make / model / year.
 * Uses LicensePlateBadge component for plate styling.
 * Auto-fills yardUid if available from car result.
 */

import { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/firebaseClient';
import LicensePlateBadge from '../../../components/common/LicensePlateBadge';
import './AdminDebugCarPicker.css';

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
  selectedCar,
  onValueChange,
  onSelectedCarChange,
  yardUid,
  disabled = false,
}: AdminDebugCarPickerProps) {
  const [suggestions, setSuggestions] = useState<CarSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextOpenRef = useRef(false);

  // Load suggestions when value changes
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!value.trim() || disabled) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const searchFn = httpsCallable<{ q: string; yardUid?: string; limit?: number }, { ok: boolean; results: CarSearchResult[] }>(
          functions,
          'adminDebugSearchCars'
        );
        const result = await searchFn({ 
          q: value.trim(), 
          yardUid: yardUid || undefined,
          limit: 15 
        });
        
        if (result.data.ok && result.data.results) {
          setSuggestions(result.data.results);
          if (!suppressNextOpenRef.current && result.data.results.length > 0 && value.trim().length > 0) {
            setIsOpen(true);
          } else {
            setIsOpen(false);
            suppressNextOpenRef.current = false;
          }
        } else {
          setSuggestions([]);
          setIsOpen(false);
        }
        setHighlightedIndex(-1);
      } catch (error) {
        console.error('AdminDebugCarPicker: error loading suggestions', error);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 300); // Debounce 300ms

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, yardUid, disabled]);

  // Clear selection if text doesn't match selected car
  useEffect(() => {
    if (selectedCar) {
      // Match by plate or title
      const matchesPlate = selectedCar.plateNumber && value === selectedCar.plateNumber;
      const matchesTitle = selectedCar.title && value === selectedCar.title;
      if (!matchesPlate && !matchesTitle) {
        onSelectedCarChange(null);
      }
    }
  }, [value, selectedCar, onSelectedCarChange]);

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
    // Display plate if available, else title
    const displayValue = car.plateNumber || car.title || car.carId;
    onValueChange(displayValue);
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
        <div className="admin-debug-picker-wrapper admin-debug-picker-wrapper-plate">
          <input
            ref={inputRef}
            type="text"
            className="admin-debug-picker-input admin-debug-picker-input-plate"
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder="Enter plate number to search"
            disabled={disabled}
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
          {isLoading && (
            <div className="admin-debug-picker-loading">Loading...</div>
          )}
        </div>
        {selectedCar?.plateNumber && (
          <div className="admin-debug-picker-selected-plate">
            <LicensePlateBadge plate={selectedCar.plateNumber} size="sm" />
          </div>
        )}
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
                  {car.title && (
                    <span className="admin-debug-picker-suggestion-title">{car.title}</span>
                  )}
                  {car.year && (
                    <span className="admin-debug-picker-suggestion-year">{car.year}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
