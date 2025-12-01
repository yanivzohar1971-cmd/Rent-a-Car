import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AutoCompleteInput from '../components/AutoCompleteInput';
import { searchBrands, searchModels } from '../catalog/carCatalog';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import { getBrands } from '../catalog/carCatalog';
import { GearboxType, FuelType, BodyType, getGearboxTypeLabel, getFuelTypeLabel, getBodyTypeLabel } from '../types/carTypes';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [manufacturer, setManufacturer] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null);
  const [model, setModel] = useState('');
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);
  
  // Basic filters - ranges
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [kmFrom, setKmFrom] = useState('');
  const [kmTo, setKmTo] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  
  // Advanced filters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [handFrom, setHandFrom] = useState('');
  const [handTo, setHandTo] = useState('');
  const [engineCcFrom, setEngineCcFrom] = useState('');
  const [engineCcTo, setEngineCcTo] = useState('');
  const [hpFrom, setHpFrom] = useState('');
  const [hpTo, setHpTo] = useState('');
  const [gearsFrom, setGearsFrom] = useState('');
  const [gearsTo, setGearsTo] = useState('');
  const [selectedGearboxTypes, setSelectedGearboxTypes] = useState<GearboxType[]>([]);
  const [selectedFuelTypes, setSelectedFuelTypes] = useState<FuelType[]>([]);
  const [selectedBodyTypes, setSelectedBodyTypes] = useState<BodyType[]>([]);
  const [acRequired, setAcRequired] = useState<boolean | null>(null);
  const [color, setColor] = useState('');

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
    
    // Basic filters - ranges (only include if set)
    if (yearFrom) params.set('yearFrom', yearFrom);
    if (yearTo) params.set('yearTo', yearTo);
    if (kmFrom) params.set('kmFrom', kmFrom);
    if (kmTo) params.set('kmTo', kmTo);
    if (priceFrom) params.set('priceFrom', priceFrom);
    if (priceTo) params.set('priceTo', priceTo);
    
    // Advanced filters (only include if set)
    if (handFrom) params.set('handFrom', handFrom);
    if (handTo) params.set('handTo', handTo);
    if (engineCcFrom) params.set('engineCcFrom', engineCcFrom);
    if (engineCcTo) params.set('engineCcTo', engineCcTo);
    if (hpFrom) params.set('hpFrom', hpFrom);
    if (hpTo) params.set('hpTo', hpTo);
    if (gearsFrom) params.set('gearsFrom', gearsFrom);
    if (gearsTo) params.set('gearsTo', gearsTo);
    
    if (selectedGearboxTypes.length > 0) {
      params.set('gearboxTypes', selectedGearboxTypes.join(','));
    }
    if (selectedFuelTypes.length > 0) {
      params.set('fuelTypes', selectedFuelTypes.join(','));
    }
    if (selectedBodyTypes.length > 0) {
      params.set('bodyTypes', selectedBodyTypes.join(','));
    }
    
    if (acRequired !== null) {
      params.set('acRequired', String(acRequired));
    }
    if (color.trim()) {
      params.set('color', color.trim());
    }

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
              {/* Basic filters row - year, km, price ranges */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">משנה</label>
                  <select
                    className="form-input"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
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
                  <label className="form-label">עד שנה</label>
                  <select
                    className="form-input"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                  >
                    <option value="">כל השנים</option>
                    {years.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">מק״מ</label>
                  <input
                    type="number"
                    className="form-input"
                    value={kmFrom}
                    onChange={(e) => setKmFrom(e.target.value)}
                    placeholder="מ-"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">עד ק״מ</label>
                  <input
                    type="number"
                    className="form-input"
                    value={kmTo}
                    onChange={(e) => setKmTo(e.target.value)}
                    placeholder="עד"
                    min="0"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ממחיר</label>
                  <input
                    type="number"
                    className="form-input"
                    value={priceFrom}
                    onChange={(e) => setPriceFrom(e.target.value)}
                    placeholder="מ-"
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">עד מחיר</label>
                  <input
                    type="number"
                    className="form-input"
                    value={priceTo}
                    onChange={(e) => setPriceTo(e.target.value)}
                    placeholder="עד"
                    min="0"
                  />
                </div>
              </div>
              
              {/* Advanced search toggle */}
              <div className="advanced-search-toggle-wrapper">
                <button
                  type="button"
                  className="advanced-search-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  aria-expanded={showAdvanced}
                >
                  חיפוש מתקדם
                  <span className="toggle-icon" style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    ▼
                  </span>
                </button>
              </div>
              
              {/* Advanced filters panel */}
              {showAdvanced && (
                <div className="advanced-filters-panel">
                  {/* Numeric range filters */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ממספר יד</label>
                      <input
                        type="number"
                        className="form-input"
                        value={handFrom}
                        onChange={(e) => setHandFrom(e.target.value)}
                        min="1"
                        placeholder="מ-"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">עד מספר יד</label>
                      <input
                        type="number"
                        className="form-input"
                        value={handTo}
                        onChange={(e) => setHandTo(e.target.value)}
                        min="1"
                        placeholder="עד"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">מנפח (סמ״ק)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={engineCcFrom}
                        onChange={(e) => setEngineCcFrom(e.target.value)}
                        min="0"
                        placeholder="מ-"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">עד נפח (סמ״ק)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={engineCcTo}
                        onChange={(e) => setEngineCcTo(e.target.value)}
                        min="0"
                        placeholder="עד"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">מכוח סוס</label>
                      <input
                        type="number"
                        className="form-input"
                        value={hpFrom}
                        onChange={(e) => setHpFrom(e.target.value)}
                        min="0"
                        placeholder="מ-"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">עד כוח סוס</label>
                      <input
                        type="number"
                        className="form-input"
                        value={hpTo}
                        onChange={(e) => setHpTo(e.target.value)}
                        min="0"
                        placeholder="עד"
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">ממספר הילוכים</label>
                      <input
                        type="number"
                        className="form-input"
                        value={gearsFrom}
                        onChange={(e) => setGearsFrom(e.target.value)}
                        min="1"
                        placeholder="מ-"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">עד מספר הילוכים</label>
                      <input
                        type="number"
                        className="form-input"
                        value={gearsTo}
                        onChange={(e) => setGearsTo(e.target.value)}
                        min="1"
                        placeholder="עד"
                      />
                    </div>
                  </div>
                  
                  {/* Categorical filters */}
                  <div className="form-group">
                    <label className="form-label">גיר</label>
                    <div className="filter-chips">
                      {Object.values(GearboxType).map((type) => (
                        <label key={type} className="filter-chip">
                          <input
                            type="checkbox"
                            checked={selectedGearboxTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGearboxTypes([...selectedGearboxTypes, type]);
                              } else {
                                setSelectedGearboxTypes(selectedGearboxTypes.filter(t => t !== type));
                              }
                            }}
                          />
                          <span>{getGearboxTypeLabel(type)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">סוג דלק</label>
                    <div className="filter-chips">
                      {Object.values(FuelType).map((type) => (
                        <label key={type} className="filter-chip">
                          <input
                            type="checkbox"
                            checked={selectedFuelTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFuelTypes([...selectedFuelTypes, type]);
                              } else {
                                setSelectedFuelTypes(selectedFuelTypes.filter(t => t !== type));
                              }
                            }}
                          />
                          <span>{getFuelTypeLabel(type)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">סוג מרכב</label>
                    <div className="filter-chips">
                      {Object.values(BodyType).map((type) => (
                        <label key={type} className="filter-chip">
                          <input
                            type="checkbox"
                            checked={selectedBodyTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBodyTypes([...selectedBodyTypes, type]);
                              } else {
                                setSelectedBodyTypes(selectedBodyTypes.filter(t => t !== type));
                              }
                            }}
                          />
                          <span>{getBodyTypeLabel(type)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">מזגן</label>
                    <select
                      className="form-input"
                      value={acRequired === null ? '' : acRequired ? 'true' : 'false'}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAcRequired(value === '' ? null : value === 'true');
                      }}
                    >
                      <option value="">לא משנה</option>
                      <option value="true">יש מזגן</option>
                      <option value="false">בלי מזגן</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">צבע</label>
                    <input
                      type="text"
                      className="form-input"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="לדוגמה: כסף"
                    />
                  </div>
                </div>
              )}
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
