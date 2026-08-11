import { useState, useEffect, useRef } from 'react';
import { getBrands, searchBrands, type CatalogBrand } from '../../catalog/carCatalog';
import { useClickOutside } from '../../utils/useClickOutside';
import './BrandFilterDialog.css';

export type FilterDisplayMode = 'modal' | 'popover';

export interface BrandFilterDialogProps {
  selectedBrands: string[]; // Array of brand names (manufacturer field)
  onConfirm: (brands: string[]) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode; // 'modal' (default) or 'popover'
}

const MAX_SELECTED_BRANDS = 4;

export function BrandFilterDialog({
  selectedBrands,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: BrandFilterDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [allBrands, setAllBrands] = useState<CatalogBrand[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<CatalogBrand[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedBrands);
  const [loading, setLoading] = useState(true);
  const [showMaxLimitMessage, setShowMaxLimitMessage] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync selected brands when prop changes (e.g., when dialog reopens)
  useEffect(() => {
    setSelected(selectedBrands);
  }, [selectedBrands]);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  // Load all brands on mount
  useEffect(() => {
    async function loadBrands() {
      try {
        setLoading(true);
        const brands = await getBrands();
        setAllBrands(brands);
        setFilteredBrands(brands);
      } catch (error) {
        console.error('Error loading brands:', error);
      } finally {
        setLoading(false);
      }
    }
    loadBrands();
  }, []);

  // Filter brands based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBrands(allBrands);
      return;
    }

    async function performSearch() {
      try {
        const results = await searchBrands(searchQuery, 50);
        setFilteredBrands(results);
      } catch (error) {
        console.error('Error searching brands:', error);
        setFilteredBrands([]);
      }
    }

    performSearch();
  }, [searchQuery, allBrands]);

  const handleBrandToggle = (brandHe: string) => {
    if (selected.includes(brandHe)) {
      // Deselect
      setSelected(selected.filter((b) => b !== brandHe));
      setShowMaxLimitMessage(false);
    } else {
      // Select (check limit)
      if (selected.length >= MAX_SELECTED_BRANDS) {
        setShowMaxLimitMessage(true);
        setTimeout(() => setShowMaxLimitMessage(false), 3000);
        return;
      }
      setSelected([...selected, brandHe]);
    }
  };

  const handleConfirm = () => {
    onConfirm(selected);
    onClose();
  };

  const handleReset = () => {
    setSelected([]);
    onReset();
  };

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog brand-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="filter-dialog-header">
          <h3 className="filter-dialog-title">בחירת יצרן</h3>
          <button type="button" className="filter-dialog-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="filter-dialog-content">
          {/* Search input */}
          <div className="brand-search-section">
            <input
              type="text"
              className="brand-search-input"
              placeholder="יצרן"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              dir="rtl"
            />
          </div>

          {/* Info text */}
          <div className="brand-info-text">
            ניתן לבחור עד {MAX_SELECTED_BRANDS} יצרנים
          </div>

          {/* Max limit message */}
          {showMaxLimitMessage && (
            <div className="brand-limit-message">
              ניתן לבחור עד {MAX_SELECTED_BRANDS} יצרנים בלבד
            </div>
          )}

          {/* Brands list */}
          <div className="brands-list">
            {loading ? (
              <div className="brands-loading">טוען יצרנים...</div>
            ) : filteredBrands.length === 0 ? (
              <div className="brands-empty">לא נמצאו יצרנים</div>
            ) : (
              filteredBrands.map((brand) => {
                const isSelected = selected.includes(brand.brandHe);
                return (
                  <button
                    key={brand.brandId}
                    type="button"
                    className={`brand-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleBrandToggle(brand.brandHe)}
                  >
                    <div className="brand-item-content">
                      {/* Logo placeholder - can be enhanced later with actual logos */}
                      <div className="brand-logo-placeholder">
                        {brand.brandHe.charAt(0)}
                      </div>
                      <span className="brand-name">{brand.brandHe}</span>
                    </div>
                    {isSelected && <span className="brand-check">✓</span>}
                  </button>
                );
              })
            )}
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
  );

  if (mode === 'popover') {
    return content;
  }

  return (
    <div className="filter-dialog-overlay" onClick={onClose}>
      {content}
    </div>
  );
}

