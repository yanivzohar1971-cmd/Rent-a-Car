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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load suggestions when value changes
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!value.trim() || disabled) {
      setSuggestions([]);
      setIsOpen(false);
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
        setIsOpen(results.length > 0);
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
  }, [value, disabled]);

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
    if (suggestions.length > 0 && value.trim()) {
      setIsOpen(true);
    }
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
      {/* DEBUG: Component mounted indicator */}
      <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '4px' }}>
        YardCarEditPage: Brand autocomplete mounted
      </div>
      
      <div className="input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="form-input"
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

