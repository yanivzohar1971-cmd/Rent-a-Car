import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AutoCompleteInput from '../components/AutoCompleteInput';
import { searchBrands, searchModels } from '../catalog/carCatalog';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import { getBrands } from '../catalog/carCatalog';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [manufacturer, setManufacturer] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null);
  const [model, setModel] = useState('');
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);
  const [minYear, setMinYear] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Preload catalog on mount
  useEffect(() => {
    getBrands().catch((err) => {
      console.error('Failed to preload car catalog:', err);
    });
  }, []);

  // Clear model when brand changes
  useEffect(() => {
    if (!selectedBrand) {
      setModel('');
      setSelectedModel(null);
    }
  }, [selectedBrand]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const params = new URLSearchParams();
    // Use selected brand/model if available, otherwise fall back to typed text
    const manufacturerValue = selectedBrand?.brandHe ?? manufacturer.trim();
    const modelValue = selectedModel?.modelHe ?? model.trim();
    
    if (manufacturerValue) params.set('manufacturer', manufacturerValue);
    if (modelValue) params.set('model', modelValue);
    if (minYear) params.set('minYear', String(minYear));
    if (maxPrice) params.set('maxPrice', String(maxPrice));

    navigate(`/cars?${params.toString()}`);
  };

  const handleBrandSelect = (brand: CatalogBrand | null) => {
    setSelectedBrand(brand);
    if (brand) {
      setManufacturer(brand.brandHe);
    }
  };

  const handleModelSelect = (model: CatalogModel | null) => {
    setSelectedModel(model);
    if (model) {
      setModel(model.modelHe);
    }
  };

  // Memoize load functions to avoid recreating on every render
  const loadBrandSuggestions = useCallback(async (query: string) => {
    return await searchBrands(query, 10);
  }, []);

  const loadModelSuggestions = useCallback(async (query: string) => {
    if (!selectedBrand) return [];
    return await searchModels(selectedBrand.brandId, query, 10);
  }, [selectedBrand]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">מחפשים את הרכב הבא שלכם?</h1>
          <p className="hero-subtitle">
            CarExpert מחבר אתכם למגרשים וסוכנים אמיתיים, עם תהליך שקוף ופשוט.
          </p>
          <div className="hero-illustration"></div>
        </div>
        
        <div className="search-card-container">
          <div className="search-card card">
            <h2 className="search-title">חפש רכב</h2>
            <form onSubmit={handleSearch} className="search-form">
              <div className="form-row">
                <div className="form-group">
                  <AutoCompleteInput<CatalogBrand>
                    label="יצרן"
                    placeholder="לדוגמה: טויוטה"
                    value={manufacturer}
                    onValueChange={setManufacturer}
                    selectedItem={selectedBrand}
                    onSelectedItemChange={handleBrandSelect}
                    getItemLabel={(brand) => brand.brandHe}
                    loadSuggestions={loadBrandSuggestions}
                  />
                </div>
                <div className="form-group">
                  <AutoCompleteInput<CatalogModel>
                    label="דגם"
                    placeholder="לדוגמה: קורולה"
                    value={model}
                    onValueChange={setModel}
                    selectedItem={selectedModel}
                    onSelectedItemChange={handleModelSelect}
                    getItemLabel={(model) => model.modelHe}
                    loadSuggestions={loadModelSuggestions}
                    disabled={!selectedBrand}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">שנה מינימלית</label>
                  <select
                    className="form-input"
                    value={minYear}
                    onChange={(e) => setMinYear(e.target.value)}
                  >
                    <option value="">כל השנים</option>
                    {years.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">מחיר מקסימלי</label>
                  <input
                    type="number"
                    className="form-input"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="לדוגמה: 90000"
                    min="0"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary search-button">
                חיפוש רכב
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
