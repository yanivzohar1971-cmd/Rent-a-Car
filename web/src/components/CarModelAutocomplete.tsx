import { useState, useEffect, useRef } from 'react';
import { searchModels } from '../catalog/carCatalog';
import type { CatalogModel } from '../catalog/carCatalog';
import './CarModelAutocomplete.css';

interface CarModelAutocompleteProps {
  value: string;
  selectedModelId: string | null;
  brandId: string | null;
  onValueChange: (text: string) => void;
  onModelSelected: (model: CatalogModel | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function CarModelAutocomplete({
  value,
  selectedModelId,
  brandId,
  onValueChange,
  onModelSelected,
  placeholder = 'לדוגמה: קורולה',
  disabled = false,
}: CarModelAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<CatalogModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear model when brand changes
  useEffect(() => {
    if (!brandId) {
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [brandId]);

  // Load suggestions when value or brandId changes
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!value.trim() || disabled || !brandId) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchModels(brandId, value, 10);
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch (error) {
        console.error('Error searching models:', error);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 150); // Debounce 150ms

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, brandId, disabled]);

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
    
    // Clear selection if text doesn't match selected model
    if (selectedModelId) {
      const selectedModel = suggestions.find((m) => m.modelId === selectedModelId);
      if (selectedModel && newValue !== selectedModel.modelHe) {
        onModelSelected(null);
      }
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && value.trim() && brandId) {
      setIsOpen(true);
    }
  };

  const handleSelectModel = (model: CatalogModel) => {
    onValueChange(model.modelHe);
    onModelSelected(model);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onValueChange('');
    onModelSelected(null);
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

  if (!brandId) {
    return (
      <input
        type="text"
        className="form-input"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="בחר תחילה יצרן"
        disabled={true}
      />
    );
  }

  return (
    <div ref={containerRef} className="car-model-autocomplete">
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
      {isOpen && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((model) => (
            <div
              key={model.modelId}
              className="suggestion-item"
              onClick={() => handleSelectModel(model)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectModel(model);
                }
              }}
              tabIndex={0}
            >
              <span className="suggestion-text">{model.modelHe}</span>
              <span className="suggestion-text-en">{model.modelEn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

