import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AutoCompleteInput from '../components/AutoCompleteInput';
import { searchBrands, searchModels, getBrands } from '../catalog/carCatalog';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import { getRegions, getCitiesByRegion } from '../catalog/locationCatalog';
import { GearboxType, FuelType, BodyType, getGearboxTypeLabel, getFuelTypeLabel, getBodyTypeLabel } from '../types/carTypes';
import type { CarFilters } from '../api/carsApi';
import { 
  buildSearchUrl, 
  saveRecentSearch, 
  loadRecentSearches, 
  countActiveAdvancedFilters,
  type SavedSearch 
} from '../utils/searchUtils';
import RentalCompanyLogosSection from '../components/public/RentalCompanyLogosSection';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [manufacturer, setManufacturer] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<CatalogBrand | null>(null);
  const [model, setModel] = useState('');
  const [selectedModel, setSelectedModel] = useState<CatalogModel | null>(null);
  
  // Location filters
  const [regionId, setRegionId] = useState<string>('');
  const [cityId, setCityId] = useState<string>('');
  
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
  
  // Recent searches state
  const [recentSearches, setRecentSearches] = useState<SavedSearch[]>([]);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  // Build current filters object from state
  const buildCurrentFilters = useCallback((): CarFilters => {
    const manufacturerValue = selectedBrand?.brandHe ?? manufacturer.trim();
    const modelValue = selectedModel?.modelHe ?? model.trim();
    
    return {
      manufacturer: manufacturerValue || undefined,
      model: modelValue || undefined,
      yearFrom: yearFrom ? parseInt(yearFrom, 10) : undefined,
      yearTo: yearTo ? parseInt(yearTo, 10) : undefined,
      kmFrom: kmFrom ? parseInt(kmFrom, 10) : undefined,
      kmTo: kmTo ? parseInt(kmTo, 10) : undefined,
      priceFrom: priceFrom ? parseInt(priceFrom, 10) : undefined,
      priceTo: priceTo ? parseInt(priceTo, 10) : undefined,
      handFrom: handFrom ? parseInt(handFrom, 10) : undefined,
      handTo: handTo ? parseInt(handTo, 10) : undefined,
      engineCcFrom: engineCcFrom ? parseInt(engineCcFrom, 10) : undefined,
      engineCcTo: engineCcTo ? parseInt(engineCcTo, 10) : undefined,
      hpFrom: hpFrom ? parseInt(hpFrom, 10) : undefined,
      hpTo: hpTo ? parseInt(hpTo, 10) : undefined,
      gearsFrom: gearsFrom ? parseInt(gearsFrom, 10) : undefined,
      gearsTo: gearsTo ? parseInt(gearsTo, 10) : undefined,
      gearboxTypes: selectedGearboxTypes.length > 0 ? selectedGearboxTypes : undefined,
      fuelTypes: selectedFuelTypes.length > 0 ? selectedFuelTypes : undefined,
      bodyTypes: selectedBodyTypes.length > 0 ? selectedBodyTypes : undefined,
      acRequired: acRequired,
      color: color.trim() || undefined,
      regionId: regionId || undefined,
      cityId: cityId || undefined,
    };
  }, [
    manufacturer, selectedBrand, model, selectedModel,
    yearFrom, yearTo, kmFrom, kmTo, priceFrom, priceTo,
    handFrom, handTo, engineCcFrom, engineCcTo, hpFrom, hpTo, gearsFrom, gearsTo,
    selectedGearboxTypes, selectedFuelTypes, selectedBodyTypes, acRequired, color,
    regionId, cityId
  ]);

  // Count active advanced filters
  const activeAdvancedCount = useMemo(() => {
    return countActiveAdvancedFilters(buildCurrentFilters());
  }, [buildCurrentFilters]);

  // Preload catalog on mount
  useEffect(() => {
    getBrands().catch((err) => {
      if (import.meta.env.DEV) {
        console.error('Failed to preload car catalog:', err);
      }
    });
  }, []);

  // Clear model when brand changes
  useEffect(() => {
    if (!selectedBrand) {
      setModel('');
      setSelectedModel(null);
    }
  }, [selectedBrand]);

  // Clear city when region changes
  useEffect(() => {
    if (!regionId) {
      setCityId('');
    }
  }, [regionId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const filters = buildCurrentFilters();
    const url = buildSearchUrl(filters, '/cars', false);
    
    // Dev-only logging
    if (import.meta.env.DEV) {
      console.log('[HomePage] Search submitted:', {
        filters,
        url,
        cityId: filters.cityId,
        regionId: filters.regionId,
        manufacturer: filters.manufacturer,
        model: filters.model,
      });
    }
    
    // Save to recent searches
    saveRecentSearch(filters);
    setRecentSearches(loadRecentSearches());
    
    // Navigate to search results
    navigate(url);
  };

  // Apply saved search to form
  const applySavedSearch = useCallback(async (savedSearch: SavedSearch) => {
    const filters = savedSearch.filters;
    
    // Try to match manufacturer from catalog
    if (filters.manufacturer) {
      setManufacturer(filters.manufacturer);
      try {
        const brands = await getBrands();
        const matchedBrand = brands.find(
          b => b.brandHe.toLowerCase() === filters.manufacturer!.toLowerCase()
        );
        if (matchedBrand) {
          setSelectedBrand(matchedBrand);
          // Try to match model if brand was found
          if (filters.model && matchedBrand) {
            try {
              const models = await searchModels(matchedBrand.brandId, filters.model, 10);
              const matchedModel = models.find(
                m => m.modelHe.toLowerCase() === filters.model!.toLowerCase()
              );
              if (matchedModel) {
                setSelectedModel(matchedModel);
                setModel(matchedModel.modelHe);
              } else {
                setModel(filters.model);
              }
            } catch {
              setModel(filters.model);
            }
          } else if (filters.model) {
            setModel(filters.model);
          }
        }
      } catch {
        // If catalog loading fails, just set the text
        // Autocomplete will handle matching when user types
      }
    } else if (filters.model) {
      setModel(filters.model);
    }
    
    // Set location filters
    setRegionId(filters.regionId || '');
    setCityId(filters.cityId || '');
    
    // Set basic filters
    setYearFrom(filters.yearFrom?.toString() || '');
    setYearTo(filters.yearTo?.toString() || '');
    setKmFrom(filters.kmFrom?.toString() || '');
    setKmTo(filters.kmTo?.toString() || '');
    setPriceFrom(filters.priceFrom?.toString() || '');
    setPriceTo(filters.priceTo?.toString() || '');
    
    // Set advanced filters
    setHandFrom(filters.handFrom?.toString() || '');
    setHandTo(filters.handTo?.toString() || '');
    setEngineCcFrom(filters.engineCcFrom?.toString() || '');
    setEngineCcTo(filters.engineCcTo?.toString() || '');
    setHpFrom(filters.hpFrom?.toString() || '');
    setHpTo(filters.hpTo?.toString() || '');
    setGearsFrom(filters.gearsFrom?.toString() || '');
    setGearsTo(filters.gearsTo?.toString() || '');
    
    setSelectedGearboxTypes(filters.gearboxTypes || []);
    setSelectedFuelTypes(filters.fuelTypes || []);
    setSelectedBodyTypes(filters.bodyTypes || []);
    setAcRequired(filters.acRequired ?? null);
    setColor(filters.color || '');
    
    // Open advanced panel if any advanced filters are set
    if (countActiveAdvancedFilters(filters) > 0) {
      setShowAdvanced(true);
    }
    
    // Close recent searches dropdown
    setShowRecentSearches(false);
    
    // Navigate to search
    const url = buildSearchUrl(filters, '/cars', false);
    navigate(url);
  }, [navigate]);

  // Handle share search
  const handleShareSearch = useCallback(async () => {
    const filters = buildCurrentFilters();
    const url = buildSearchUrl(filters, '/cars', true); // Full URL for sharing
    
    try {
      // Try Web Share API first (mobile)
      if (navigator.share) {
        await navigator.share({
          title: 'חיפוש רכב ב-CarExperts',
          url: url,
        });
        return;
      }
      
      // Fallback to clipboard
      await navigator.clipboard.writeText(url);
      setToastMessage('קישור לחיפוש הועתק ללוח');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error: any) {
      // User cancelled share or clipboard failed
      if (error.name !== 'AbortError') {
        if (import.meta.env.DEV) {
          console.warn('Failed to share/copy URL:', error);
        }
        // Fallback: show URL for manual copy
        setToastMessage(`העתק את הקישור: ${url}`);
        setTimeout(() => setToastMessage(null), 5000);
      }
    }
  }, [buildCurrentFilters]);

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
              
              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div className="recent-searches-wrapper">
                  <button
                    type="button"
                    className="recent-searches-toggle"
                    onClick={() => setShowRecentSearches(!showRecentSearches)}
                    aria-expanded={showRecentSearches}
                  >
                    חיפושים אחרונים
                    <span className="toggle-icon" style={{ transform: showRecentSearches ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      ▼
                    </span>
                  </button>
                  {showRecentSearches && (
                    <div className="recent-searches-panel">
                      {recentSearches.map((search) => (
                        <button
                          key={search.id}
                          type="button"
                          className="recent-search-item"
                          onClick={() => applySavedSearch(search)}
                        >
                          <span className="recent-search-label">{search.label}</span>
                          <span className="recent-search-time">
                            {new Date(search.timestamp).toLocaleDateString('he-IL', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Advanced search toggle with badge */}
              <div className="advanced-search-toggle-wrapper">
                <button
                  type="button"
                  className="advanced-search-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  aria-expanded={showAdvanced}
                >
                  חיפוש מתקדם
                  {activeAdvancedCount > 0 && (
                    <span className="advanced-filters-badge">{activeAdvancedCount}</span>
                  )}
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
                  
                  {/* Location filters - moved to advanced */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">אזור</label>
                      <select
                        className="form-input"
                        value={regionId}
                        onChange={(e) => {
                          setRegionId(e.target.value);
                          // Reset city when region changes
                          if (e.target.value !== regionId) {
                            setCityId('');
                          }
                        }}
                      >
                        <option value="">כל הארץ</option>
                        {getRegions().map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.labelHe}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">עיר</label>
                      <select
                        className="form-input"
                        value={cityId}
                        onChange={(e) => setCityId(e.target.value)}
                        disabled={!regionId}
                      >
                        <option value="">
                          {regionId ? 'כל הערים' : 'בחר אזור קודם'}
                        </option>
                        {regionId && getCitiesByRegion(regionId).map((city) => (
                          <option key={city.id} value={city.id}>
                            {city.labelHe}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="search-actions-row">
                <button type="submit" className="btn btn-primary search-button">
                  חיפוש רכב
                </button>
                <button
                  type="button"
                  className="btn btn-secondary share-button"
                  onClick={handleShareSearch}
                  title="שתף חיפוש"
                >
                  📤 שתף חיפוש
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Rental Companies Logos Section */}
      <RentalCompanyLogosSection />
      
      {/* Toast notification */}
      {toastMessage && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
