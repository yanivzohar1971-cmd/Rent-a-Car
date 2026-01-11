/**
 * Admin Debug Yard Picker
 * 
 * AutoComplete picker for selecting a yard by name (name-only search).
 * Displays yard name in suggestions, shows yardUid in tech details after selection.
 */

import { useState, useEffect, useRef } from 'react';
import './AdminDebugYardPicker.css';

type YardLite = { yardUid: string; name?: string | null; phones?: string[] | null };

interface YardSearchResult {
  yardUid: string;
  yardName: string;
  city?: string;
}

interface AdminDebugYardPickerProps {
  value: string; // Display value (yard name)
  selectedYard: YardSearchResult | null;
  onValueChange: (value: string) => void;
  onSelectedYardChange: (yard: YardSearchResult | null) => void;
  yards: YardLite[];
  yardsLoaded: boolean;
  yardsError: string | null;
  onLoadYards: (force: boolean) => void;
  disabled?: boolean;
}

export default function AdminDebugYardPicker({
  value,
  selectedYard,
  onValueChange,
  onSelectedYardChange,
  yards,
  yardsLoaded,
  yardsError,
  onLoadYards,
  disabled = false,
}: AdminDebugYardPickerProps) {
  const [suggestions, setSuggestions] = useState<YardSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const suppressNextOpenRef = useRef(false);

  // Filter suggestions locally when value changes (NO network calls)
  useEffect(() => {
    if (!value.trim() || disabled || !yardsLoaded) {
      setSuggestions([]);
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    const queryLower = value.trim().toLowerCase();
    const filtered = yards.filter(yard => {
      // Search by name
      if (yard.name?.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by UID
      if (yard.yardUid.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search by phone
      if (yard.phones) {
        for (const phone of yard.phones) {
          if (phone?.toLowerCase().includes(queryLower)) {
            return true;
          }
        }
      }
      return false;
    }).slice(0, 50); // Limit to 50 for UI performance

    // Convert to YardSearchResult format
    const results: YardSearchResult[] = filtered.map(yard => ({
      yardUid: yard.yardUid,
      yardName: yard.name ?? '',
      city: undefined,
    }));

    setSuggestions(results);
    if (!suppressNextOpenRef.current && results.length > 0 && value.trim().length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      suppressNextOpenRef.current = false;
    }
    setHighlightedIndex(-1);
  }, [value, disabled, yards, yardsLoaded]);

  // Clear selection if text doesn't match selected yard
  useEffect(() => {
    if (selectedYard && value !== selectedYard.yardName) {
      onSelectedYardChange(null);
    }
  }, [value, selectedYard, onSelectedYardChange]);

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

  const handleSelect = (yard: YardSearchResult) => {
    suppressNextOpenRef.current = true;
    onValueChange(yard.yardName);
    onSelectedYardChange(yard);
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
    onSelectedYardChange(null);
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
    <div className="admin-debug-yard-picker" ref={containerRef}>
      <label className="admin-debug-picker-label">
        Yard
        {!yardsLoaded ? (
          <div>
            <button
              type="button"
              onClick={() => onLoadYards(false)}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                background: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '0.5rem'
              }}
            >
              Load Yards
            </button>
            {yardsError && (
              <small style={{ color: '#d32f2f', marginTop: '0.25rem', display: 'block' }}>
                {yardsError}
              </small>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <div className="admin-debug-picker-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  className="admin-debug-picker-input"
                  value={value}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onKeyDown={handleKeyDown}
                  placeholder="Select a yard (search by yard name only)"
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
            </div>
            <button
              type="button"
              onClick={() => onLoadYards(true)}
              title="Refresh yards list"
              style={{
                marginTop: '0.5rem',
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                background: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ⟳
            </button>
          </div>
        )}
        {yardsError && yardsLoaded && (
          <small style={{ color: '#d32f2f', marginTop: '0.25rem', display: 'block' }}>
            {yardsError}
          </small>
        )}
      </label>
      {isOpen && suggestions.length > 0 && (
        <ul className="admin-debug-picker-suggestions" ref={suggestionsRef}>
          {suggestions.map((yard, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={yard.yardUid}
                className={`admin-debug-picker-suggestion ${isHighlighted ? 'highlighted' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(yard);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className="admin-debug-picker-suggestion-name">{yard.yardName}</span>
                {yard.city && (
                  <span className="admin-debug-picker-suggestion-city">{yard.city}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
