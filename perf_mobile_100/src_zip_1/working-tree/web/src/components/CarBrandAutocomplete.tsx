import { useState, useEffect, useRef } from 'react';
import { searchBrands } from '../catalog/carCatalog';
import type { CatalogBrand } from '../catalog/carCatalog';
import './CarBrandAutocomplete.css';

interface CarBrandAutocompleteProps {
  value: string;
  selectedBrandId: string | null;
  onValueChange: (text: string) => void;
  onBrandSelected: (brand: CatalogBrand | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function CarBrandAutocomplete({
  value,
  selectedBrandId,
  onValueChange,
  onBrandSelected,
  placeholder = 'לדוגמה: טויוטה',
  disabled = false,
}: CarBrandAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<CatalogBrand[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  // Track if user has explicitly interacted with the input (prevents auto-open on mount)
  const hasUserInteracted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load suggestions when value changes (but don't auto-open dropdown)
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!value.trim() || disabled) {
      setSuggestions([]);
      // Only close if we're not focused
      if (!isFocused) {
        setIsOpen(false);
      }
      return;
    }

    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        console.log('BrandAutocomplete: searching', { query: value });
        const results = await searchBrands(value, 10);
        console.log('BrandAutocomplete: got results', {
          query: value,
          resultsCount: results.length
        });
        setSuggestions(results);
        // Only open dropdown if:
        // 1. The input is currently focused
        // 2. The user has explicitly interacted with the input (not just on mount with pre-filled value)
        // This prevents the dropdown from auto-opening when editing an existing car
        if (isFocused && hasUserInteracted.current && results.length > 0) {
          setIsOpen(true);
        }
        setCatalogLoaded(true);
        setCatalogError(null);
      } catch (error) {
        console.error('BrandAutocomplete: error searching brands', error);
        setSuggestions([]);
        setIsOpen(false);
        setCatalogError('שגיאה בטעינת מאגר יצרנים');
        setCatalogLoaded(false);
      } finally {
        setIsLoading(false);
      }
    }, 150); // Debounce 150ms

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, disabled, isFocused]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Mark as user-interacted when they type
    hasUserInteracted.current = true;
    onValueChange(newValue);
    
    // Clear selection if text doesn't match selected brand
    if (selectedBrandId) {
      const selectedBrand = suggestions.find((b) => b.brandId === selectedBrandId);
      if (selectedBrand && newValue !== selectedBrand.brandHe) {
        onBrandSelected(null);
      }
    }
  };

  const handleInputFocus = () => {
    // Mark as user-interacted when they focus
    hasUserInteracted.current = true;
    setIsFocused(true);
    // Open dropdown if we have suggestions (user is now interacting)
    if (suggestions.length > 0 && value.trim()) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay clearing focus to allow click on suggestions to register
    setTimeout(() => {
      setIsFocused(false);
    }, 150);
  };

  const handleSelectBrand = (brand: CatalogBrand) => {
    onValueChange(brand.brandHe);
    onBrandSelected(brand);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onValueChange('');
    onBrandSelected(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && isOpen && suggestions.length > 0) {
      e.preventDefault();
      // Focus first suggestion
      const firstSuggestion = containerRef.current?.querySelector('.suggestion-item') as HTMLElement;
      firstSuggestion?.focus();
    }
  };

  return (
    <div ref={containerRef} className="car-brand-autocomplete">
      <div className="input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
        {value && !disabled && (
          <button
            type="button"
            className="clear-button"
            onClick={handleClear}
            aria-label="נקה"
          >
            ✕
          </button>
        )}
        {isLoading && <span className="loading-indicator">...</span>}
      </div>
      
      {/* Visual indicator if catalog is empty or error */}
      {catalogLoaded && suggestions.length === 0 && value.trim() && !isLoading && (
        <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
          אין תוצאות תואמות
        </div>
      )}
      {catalogError && (
        <div style={{ fontSize: '10px', color: 'red', marginTop: '4px' }}>
          ⚠ {catalogError}
        </div>
      )}
      {!catalogLoaded && !catalogError && value.trim() && suggestions.length === 0 && (
        <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
          טוען מאגר יצרנים...
        </div>
      )}
      
      {isOpen && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((brand) => (
            <div
              key={brand.brandId}
              className="suggestion-item"
              onClick={() => handleSelectBrand(brand)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectBrand(brand);
                }
              }}
              tabIndex={0}
            >
              <span className="suggestion-text">{brand.brandHe}</span>
              <span className="suggestion-text-en">{brand.brandEn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

