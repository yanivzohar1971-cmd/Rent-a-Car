import { useState, useEffect, useRef } from 'react';
import './AutoCompleteInput.css';

export interface AutoCompleteInputProps<T> {
  label: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  selectedItem: T | null;
  onSelectedItemChange: (item: T | null) => void;
  getItemLabel: (item: T) => string;
  loadSuggestions: (query: string) => Promise<T[]> | T[];
  disabled?: boolean;
}

/**
 * Generic autocomplete input component for public search page
 * Supports keyboard navigation and mouse selection
 */
export default function AutoCompleteInput<T>({
  label,
  placeholder,
  value,
  onValueChange,
  selectedItem,
  onSelectedItemChange,
  getItemLabel,
  loadSuggestions,
  disabled = false,
}: AutoCompleteInputProps<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLUListElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const results = await loadSuggestions(value);
        setSuggestions(results);
        setIsOpen(results.length > 0 && value.trim().length > 0);
        setHighlightedIndex(-1);
      } catch (error) {
        console.error('AutoCompleteInput: error loading suggestions', error);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 200); // Debounce 200ms

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled]); // loadSuggestions is intentionally omitted to avoid re-running on every render

  // Clear selection if text doesn't match selected item
  useEffect(() => {
    if (selectedItem && value !== getItemLabel(selectedItem)) {
      onSelectedItemChange(null);
    }
  }, [value, selectedItem, getItemLabel, onSelectedItemChange]);

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

  const handleSelect = (item: T) => {
    const label = getItemLabel(item);
    onValueChange(label);
    onSelectedItemChange(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onValueChange(newValue);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && value.trim().length > 0) {
      setIsOpen(true);
    }
  };

  const handleClear = () => {
    onValueChange('');
    onSelectedItemChange(null);
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
    <div className="autocomplete-input-container" ref={containerRef}>
      <label className="form-label">{label}</label>
      <div className="autocomplete-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="form-input autocomplete-input"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
        {value && !disabled && (
          <button
            type="button"
            className="autocomplete-clear-btn"
            onClick={handleClear}
            aria-label="נקה"
          >
            ✕
          </button>
        )}
        {isLoading && (
          <div className="autocomplete-loading">טוען...</div>
        )}
      </div>
      {isOpen && suggestions.length > 0 && (
        <ul className="autocomplete-suggestions" ref={suggestionsRef}>
          {suggestions.map((item, index) => {
            const label = getItemLabel(item);
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={index}
                className={`autocomplete-suggestion ${isHighlighted ? 'highlighted' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

