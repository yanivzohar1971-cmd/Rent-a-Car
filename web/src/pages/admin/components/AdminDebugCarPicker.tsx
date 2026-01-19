/**
 * Admin Debug Car Picker
 * 
 * AutoComplete picker for selecting a car by plate number / make / model / year.
 * Uses LicensePlateBadge component for plate styling.
 * Auto-fills yardUid if available from car result.
 */

import { useState, useEffect, useRef } from 'react';
import LicensePlateBadge from '../../../components/common/LicensePlateBadge';
import './AdminDebugCarPicker.css';

type CarLite = { 
  carId: string; 
  plateNumber?: string | null; 
  make?: string | null; 
  model?: string | null; 
  year?: number | null; 
  title?: string | null;
  source?: 'MASTER' | 'PUBLIC' | 'BOTH';
  isPublished?: boolean;
};

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
  yardUid: string | null;
  carsForSelectedYard: CarLite[];
  carsLoaded?: boolean;
  carsError?: string | null;
  disabled?: boolean;
}

export default function AdminDebugCarPicker({
  value,
  onValueChange,
  onSelectedCarChange,
  yardUid,
  carsForSelectedYard,
  carsLoaded = true,
  carsError = null,
  disabled = false,
}: AdminDebugCarPickerProps) {
  const [suggestions, setSuggestions] = useState<CarSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const suppressNextOpenRef = useRef(false);

  // Clear selectedCarId when yardUid changes
  useEffect(() => {
    setSelectedCarId(null);
  }, [yardUid]);

  // Filter suggestions locally when value changes (NO network calls)
  useEffect(() => {
    if (!value.trim() || disabled || !yardUid || carsForSelectedYard.length === 0) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    const queryLower = value.trim().toLowerCase();
    // Normalize digits for plate search (remove spaces, dashes)
    const queryNormalized = queryLower.replace(/[\s\-]/g, '');
    
    const filtered = carsForSelectedYard.filter(car => {
      // Search by plate (normalized)
      if (car.plateNumber) {
        const plateNormalized = car.plateNumber.toLowerCase().replace(/[\s\-]/g, '');
        if (plateNormalized.includes(queryNormalized)) {
          return true;
        }
      }
      // Search by make
      if (car.make?.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by model
      if (car.model?.toLowerCase().includes(queryLower)) {
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
  }, [value, disabled, yardUid, carsForSelectedYard]);

  // Clear selection if text doesn't match selected car
  useEffect(() => {
    if (selectedCarId) {
      const selectedCar = carsForSelectedYard.find(c => c.carId === selectedCarId);
      if (selectedCar) {
        const displayLabel = `${selectedCar.make ?? ''} ${selectedCar.model ?? ''}`.trim() + (selectedCar.year ? ` (${selectedCar.year})` : '');
        if (value !== displayLabel) {
          setSelectedCarId(null);
          onSelectedCarChange(null);
        }
      }
    }
  }, [value, selectedCarId, carsForSelectedYard, onSelectedCarChange]);

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
            </div>
            {carsError && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#ffebee', border: '1px solid #f44336', borderRadius: '4px', color: '#c62828', fontSize: '0.875rem' }}>
                <strong>Error:</strong> {carsError}
              </div>
            )}
            {!carsLoaded && !carsError && (
              <small style={{ color: '#666', marginTop: '0.25rem', display: 'block', fontSize: '0.75rem' }}>
                Loading cars...
              </small>
            )}
            {carsLoaded && carsForSelectedYard.length === 0 && !carsError && (
              <small style={{ color: '#666', marginTop: '0.25rem', display: 'block', fontSize: '0.75rem' }}>
                No cars found for this yard
              </small>
            )}
          </div>
        )}
        {(() => {
          const selectedCar = selectedCarId ? carsForSelectedYard.find(c => c.carId === selectedCarId) : null;
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(() => {
                      const text = `${car.make ?? ''} ${car.model ?? ''}`.trim() + (car.year ? ` (${car.year})` : '');
                      return text ? <span>{text}</span> : null;
                    })()}
                    {/* Status badges */}
                    <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
                      {(() => {
                        const carLite = carsForSelectedYard.find(c => c.carId === car.carId);
                        if (!carLite) return null;
                        
                        if (carLite.source === 'BOTH') {
                          return (
                            <>
                              <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', backgroundColor: '#4caf50', color: 'white', borderRadius: '3px' }}>📄🌍</span>
                              {carLite.isPublished && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', backgroundColor: '#2196f3', color: 'white', borderRadius: '3px' }}>PUBLISHED</span>
                              )}
                            </>
                          );
                        } else if (carLite.source === 'PUBLIC') {
                          return (
                            <>
                              <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', backgroundColor: '#ff9800', color: 'white', borderRadius: '3px' }}>🌍 PUBLIC-only</span>
                              {carLite.isPublished && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', backgroundColor: '#2196f3', color: 'white', borderRadius: '3px' }}>PUBLISHED</span>
                              )}
                            </>
                          );
                        } else if (carLite.source === 'MASTER') {
                          return (
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', backgroundColor: '#9e9e9e', color: 'white', borderRadius: '3px' }}>📄 MASTER-only</span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
