import { useState, useEffect, useRef } from 'react';
import { searchModels, getBrands, type CatalogModel, type CatalogBrand } from '../../catalog/carCatalog';
import { useClickOutside } from '../../utils/useClickOutside';
import './BrandFilterDialog.css'; // Reuse styles

export type FilterDisplayMode = 'modal' | 'popover';

export interface ModelFilterDialogProps {
  selectedBrands: string[]; // Array of brand names (manufacturer field)
  selectedModel?: string; // Currently selected model (Hebrew name)
  onConfirm: (model: string) => void;
  onReset: () => void;
  onClose: () => void;
  mode?: FilterDisplayMode;
}

export function ModelFilterDialog({
  selectedBrands,
  selectedModel,
  onConfirm,
  onReset,
  onClose,
  mode = 'modal',
}: ModelFilterDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredModels, setFilteredModels] = useState<CatalogModel[]>([]);
  const [selected, setSelected] = useState<string>(selectedModel || '');
  const [loading, setLoading] = useState(false);
  const [allBrands, setAllBrands] = useState<CatalogBrand[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load brands to map brandHe to brandId
  useEffect(() => {
    async function loadBrands() {
      try {
        const brands = await getBrands();
        setAllBrands(brands);
      } catch (error) {
        console.error('Error loading brands:', error);
      }
    }
    loadBrands();
  }, []);

  // Sync selected model when prop changes
  useEffect(() => {
    setSelected(selectedModel || '');
  }, [selectedModel]);

  // Click outside handler for popover mode
  useClickOutside(popoverRef, () => {
    if (mode === 'popover') {
      onClose();
    }
  });

  // Search models when query or brands change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredModels([]);
      return;
    }

    // Require exactly one brand selected
    if (selectedBrands.length === 0) {
      setFilteredModels([]);
      return;
    }

    if (selectedBrands.length > 1) {
      // Multiple brands - show message
      setFilteredModels([]);
      return;
    }

    async function performSearch() {
      try {
        setLoading(true);
        // Convert brandHe to brandId
        const brandHe = selectedBrands[0];
        const brand = allBrands.find(b => b.brandHe === brandHe);
        if (!brand) {
          setFilteredModels([]);
          return;
        }
        const results = await searchModels(brand.brandId, searchQuery, 50);
        setFilteredModels(results);
      } catch (error) {
        console.error('Error searching models:', error);
        setFilteredModels([]);
      } finally {
        setLoading(false);
      }
    }

    performSearch();
  }, [searchQuery, selectedBrands, allBrands]);

  const handleModelSelect = (modelHe: string) => {
    setSelected(modelHe);
  };

  const handleConfirm = () => {
    if (selected) {
      onConfirm(selected);
      onClose();
    }
  };

  const handleReset = () => {
    setSelected('');
    onReset();
  };

  const canSearch = selectedBrands.length === 1;
  const showMultiBrandMessage = selectedBrands.length > 1;
  const showNoBrandMessage = selectedBrands.length === 0;

  const content = (
    <div 
      ref={popoverRef}
      className={`filter-dialog brand-filter-dialog ${mode === 'popover' ? 'filter-popover' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="filter-dialog-header">
        <h3 className="filter-dialog-title">בחירת דגם</h3>
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
            placeholder="דגם"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={!canSearch}
            dir="rtl"
          />
        </div>

        {/* Info messages */}
        {showNoBrandMessage && (
          <div className="brand-info-text" style={{ color: '#666', fontStyle: 'italic' }}>
            בחר יצרן קודם
          </div>
        )}

        {showMultiBrandMessage && (
          <div className="brand-info-text" style={{ color: '#666', fontStyle: 'italic' }}>
            בחר יצרן אחד כדי לסנן לפי דגם
          </div>
        )}

        {canSearch && !showNoBrandMessage && !showMultiBrandMessage && (
          <div className="brand-info-text">
            חיפוש דגמים עבור: {selectedBrands[0]}
          </div>
        )}

        {/* Models list */}
        <div className="brands-list">
          {loading ? (
            <div className="brands-loading">טוען דגמים...</div>
          ) : !canSearch ? (
            <div className="brands-empty">בחר יצרן כדי לחפש דגמים</div>
          ) : filteredModels.length === 0 && searchQuery.trim() ? (
            <div className="brands-empty">לא נמצאו דגמים</div>
          ) : (
            filteredModels.map((model) => {
              const isSelected = selected === model.modelHe;
              return (
                <button
                  key={model.modelId}
                  type="button"
                  className={`brand-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleModelSelect(model.modelHe)}
                >
                  <div className="brand-item-content">
                    <span className="brand-name">{model.modelHe}</span>
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
        <button 
          type="button" 
          className="btn btn-primary" 
          onClick={handleConfirm}
          disabled={!selected || !canSearch}
        >
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
