/**
 * Admin Debug Yard Picker
 * 
 * AutoComplete picker for selecting a yard by name (name-only search).
 * Displays yard name in suggestions, shows yardUid in tech details after selection.
 */

import { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase/firebaseClient';
import './AdminDebugYardPicker.css';

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
  disabled?: boolean;
}

export default function AdminDebugYardPicker({
  value,
  selectedYard,
  onValueChange,
  onSelectedYardChange,
  disabled = false,
}: AdminDebugYardPickerProps) {
  const [suggestions, setSuggestions] = useState<YardSearchResult[]>([]);
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
        const searchFn = httpsCallable<{ q: string; limit?: number }, { ok: boolean; results: YardSearchResult[] }>(
          functions,
          'adminDebugSearchYards'
        );
        const result = await searchFn({ q: value.trim(), limit: 15 });
        
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
        console.error('AdminDebugYardPicker: error loading suggestions', error);
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
  }, [value, disabled]);

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
        מגרש
        <div className="admin-debug-picker-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="admin-debug-picker-input"
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder="אנא בחר מגרש (חיפוש לפי שם מגרש בלבד)"
            disabled={disabled}
            dir="rtl"
          />
          {value && !disabled && (
            <button
              type="button"
              className="admin-debug-picker-clear"
              onClick={handleClear}
              aria-label="נקה"
            >
              ✕
            </button>
          )}
          {isLoading && (
            <div className="admin-debug-picker-loading">טוען...</div>
          )}
        </div>
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
