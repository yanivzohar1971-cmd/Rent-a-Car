import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { fetchCarsWithFallback, type Car, type CarFilters } from '../api/carsApi';
import { fetchActiveCarAds } from '../api/carAdsApi';
import { mapPublicCarToResultItem, mapCarAdToResultItem } from '../utils/searchResultMappers';
import { GearboxType, FuelType, BodyType } from '../types/carTypes';
import { useAuth } from '../context/AuthContext';
import { useYardPublic } from '../context/YardPublicContext';
import { createSavedSearch, generateSearchLabel } from '../api/savedSearchesApi';
import { getDefaultPersona } from '../types/Roles';
import type { Timestamp } from 'firebase/firestore';
import { fetchYardPromotionStates, getYardPromotionScore, isRecommendedYard } from '../utils/yardPromotionHelpers';
import type { YardPromotionState } from '../types/Promotion';
import { CarSearchFilterBar } from '../components/filters/CarSearchFilterBar';
import { buildSearchUrl } from '../utils/searchUtils';
import { loadFavoriteCarIds, addFavorite, removeFavorite } from '../api/favoritesApi';
import { ViewModeToggle, type ViewMode } from '../components/cars/ViewModeToggle';
import { FavoritesFilterChips, type FavoritesFilter } from '../components/cars/FavoritesFilterChips';
import { CarListItem } from '../components/cars/CarListItem';
import { FavoriteHeart } from '../components/cars/FavoriteHeart';
import { CarImage } from '../components/cars/CarImage';
import './CarsSearchPage.css';

interface CarsSearchPageProps {
  lockedYardId?: string; // When provided, filter to this yard only
}

export default function CarsSearchPage({ lockedYardId }: CarsSearchPageProps = {}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  
  // Use lockedYardId prop or activeYardId from context
  const currentYardId = lockedYardId || activeYardId;
  
  const [publicCars, setPublicCars] = useState<Car[]>([]);
  const [carAds, setCarAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [currentFilters, setCurrentFilters] = useState<CarFilters>({});
  const [sellerFilter, setSellerFilter] = useState<'all' | 'yard' | 'private'>('all');
  const [yardPromotions, setYardPromotions] = useState<Map<string, YardPromotionState | null>>(new Map());
  
  // View mode and favorites state
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [favoritesFilter, setFavoritesFilter] = useState<FavoritesFilter>('all');
  const [favoriteCarIds, setFavoriteCarIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Helper function to parse number from string
    const parseNumber = (value: string | null): number | undefined => {
      if (!value) return undefined;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? undefined : parsed;
    };

    // Helper function to parse array from comma-separated string
    const parseArray = <T extends string>(value: string | null, enumValues: readonly T[]): T[] | undefined => {
      if (!value) return undefined;
      const parts = value.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return undefined;
      return parts.filter(p => enumValues.includes(p as T)) as T[];
    };

    // Build filters object from URL params
    const filters: CarFilters = {
      // Existing fields (backward compatibility)
      manufacturer: searchParams.get('manufacturer') || undefined,
      model: searchParams.get('model') || undefined,
      minYear: parseNumber(searchParams.get('minYear')),
      maxPrice: parseNumber(searchParams.get('maxPrice')),

      // Basic filters - ranges
      yearFrom: parseNumber(searchParams.get('yearFrom')),
      yearTo: parseNumber(searchParams.get('yearTo')),
      kmFrom: parseNumber(searchParams.get('kmFrom')),
      kmTo: parseNumber(searchParams.get('kmTo')),
      priceFrom: parseNumber(searchParams.get('priceFrom')),
      priceTo: parseNumber(searchParams.get('priceTo')),

      // Advanced filters - numeric ranges
      handFrom: parseNumber(searchParams.get('handFrom')),
      handTo: parseNumber(searchParams.get('handTo')),
      engineCcFrom: parseNumber(searchParams.get('engineCcFrom')),
      engineCcTo: parseNumber(searchParams.get('engineCcTo')),
      hpFrom: parseNumber(searchParams.get('hpFrom')),
      hpTo: parseNumber(searchParams.get('hpTo')),
      gearsFrom: parseNumber(searchParams.get('gearsFrom')),
      gearsTo: parseNumber(searchParams.get('gearsTo')),

      // Advanced filters - categorical
      gearboxTypes: parseArray(searchParams.get('gearboxTypes'), Object.values(GearboxType)),
      fuelTypes: parseArray(searchParams.get('fuelTypes'), Object.values(FuelType)),
      bodyTypes: parseArray(searchParams.get('bodyTypes'), Object.values(BodyType)),
      
      // AC filter
      acRequired: (() => {
        const value = searchParams.get('acRequired');
        if (value === null) return undefined;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
      })(),

      // Color filter
      color: searchParams.get('color') || undefined,

      // Location filters
      regionId: searchParams.get('regionId') || undefined,
      cityId: searchParams.get('cityId') || undefined,

      // Yard filter (if locked)
      lockedYardId: lockedYardId,
    };

    setCurrentFilters(filters);

    // Fetch both sources in parallel
    Promise.all([
      fetchCarsWithFallback(filters).catch((err) => {
        console.error('Error fetching public cars:', err);
        return [];
      }),
      // Only fetch carAds if not in yard mode (yard mode should only show yard cars)
      currentYardId
        ? Promise.resolve([])
        : fetchActiveCarAds({
            manufacturer: filters.manufacturer,
            model: filters.model,
            yearFrom: filters.yearFrom,
            yearTo: filters.yearTo,
            priceFrom: filters.priceFrom,
            priceTo: filters.priceTo,
            city: filters.cityId || undefined,
          }).catch((err) => {
            console.error('Error fetching car ads:', err);
            return [];
          }),
    ])
      .then(async ([carsResult, adsResult]) => {
        setPublicCars(carsResult);
        setCarAds(adsResult);
        
        // Load yard promotions for yard cars
        const yardUids = new Set<string>();
        carsResult.forEach(car => {
          if (car.yardUid) {
            yardUids.add(car.yardUid);
          }
        });
        
        if (yardUids.size > 0) {
          try {
            const promotions = await fetchYardPromotionStates(Array.from(yardUids));
            setYardPromotions(promotions);
          } catch (err) {
            console.error('Error loading yard promotions:', err);
            // Non-blocking error
          }
        }
      })
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת רכבים');
      })
      .finally(() => setLoading(false));
  }, [searchParams, lockedYardId, currentYardId]);

  // Load favorites when user is authenticated
  useEffect(() => {
    if (!firebaseUser) {
      setFavoriteCarIds(new Set());
      return;
    }

    async function loadFavorites() {
      try {
        const favorites = await loadFavoriteCarIds();
        setFavoriteCarIds(favorites);
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    }

    loadFavorites();
  }, [firebaseUser]);

  // Promotion badge helpers (defined before useMemo)
  const isPromotionActive = (until: Timestamp | undefined): boolean => {
    if (!until) return false;
    try {
      const date = until.toDate();
      return date > new Date();
    } catch {
      return false;
    }
  };

  const getPromotionScore = (item: { promotion?: any }): number => {
    if (!item.promotion) return 0;
    let score = 0;
    if (item.promotion.boostUntil && isPromotionActive(item.promotion.boostUntil)) {
      score += 10; // Small boost for boosted ads
    }
    if (item.promotion.highlightUntil && isPromotionActive(item.promotion.highlightUntil)) {
      score += 5; // Small boost for highlighted ads
    }
    return score;
  };

  // Toggle favorite handler
  const handleToggleFavorite = async (carId: string, isCurrentlyFavorite: boolean) => {
    if (!firebaseUser) {
      alert('יש להתחבר כדי לשמור במועדפים');
      navigate('/account');
      return;
    }

    // Optimistic update
    const newFavorites = new Set(favoriteCarIds);
    if (isCurrentlyFavorite) {
      newFavorites.delete(carId);
    } else {
      newFavorites.add(carId);
    }
    setFavoriteCarIds(newFavorites);

    try {
      if (isCurrentlyFavorite) {
        await removeFavorite(carId);
      } else {
        await addFavorite(carId);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Revert on error
      setFavoriteCarIds(new Set(favoriteCarIds));
      alert('אירעה שגיאה. נסה שוב בעוד רגע.');
    }
  };

  // Merge and filter results
  const searchResults = useMemo(() => {
    // Map both sources to unified result items
    const publicCarResults = publicCars.map(mapPublicCarToResultItem);
    const carAdResults = carAds.map(mapCarAdToResultItem);
    
    // Combine
    let combined = [...publicCarResults, ...carAdResults];
    
    // Add yard promotion state to results
    combined = combined.map(item => {
      if (item.sellerType === 'YARD' && item.yardUid) {
        const yardPromo = yardPromotions.get(item.yardUid);
        return { ...item, yardPromotion: yardPromo || undefined };
      }
      return item;
    });
    
    // Apply seller type filter
    if (sellerFilter === 'yard') {
      combined = combined.filter((item) => item.sellerType === 'YARD');
    } else if (sellerFilter === 'private') {
      combined = combined.filter((item) => item.sellerType === 'PRIVATE');
    }
    // 'all' shows everything, no filtering needed
    
    // Sort with promotion boost (promoted ads get small boost but don't override relevance)
    combined.sort((a, b) => {
      const carPromoScoreA = getPromotionScore(a);
      const carPromoScoreB = getPromotionScore(b);
      
      // Get yard promotion scores
      const yardPromoScoreA = getYardPromotionScore(a.yardPromotion);
      const yardPromoScoreB = getYardPromotionScore(b.yardPromotion);
      
      // Combined promotion score
      const totalPromoScoreA = carPromoScoreA + yardPromoScoreA;
      const totalPromoScoreB = carPromoScoreB + yardPromoScoreB;
      
      // Primary sort by price (ascending) - existing relevance logic
      // Then add promotion boost as tie-breaker
      const priceA = a.price || 0;
      const priceB = b.price || 0;
      if (priceA !== priceB) {
        return priceA - priceB;
      }
      // Same price? Promoted ads come first
      return totalPromoScoreB - totalPromoScoreA;
    });
    
    return combined;
  }, [publicCars, carAds, sellerFilter, yardPromotions]);

  // Filter by favorites
  const filteredByFavorites = useMemo(() => {
    return searchResults.filter((car) => {
      const isFav = favoriteCarIds.has(car.id);
      if (favoritesFilter === 'only_favorites') return isFav;
      if (favoritesFilter === 'without_favorites') return !isFav;
      return true;
    });
  }, [searchResults, favoriteCarIds, favoritesFilter]);

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  // Handle filter changes from filter bar
  const handleFiltersChange = (newFilters: CarFilters) => {
    // Merge with existing filters (preserve lockedYardId)
    const mergedFilters: CarFilters = {
      ...newFilters,
      lockedYardId: lockedYardId,
    };

    // Build URL from filters
    const newUrl = buildSearchUrl(mergedFilters, '/cars', false);
    navigate(newUrl, { replace: true });
  };

  // Handle reset all filters
  const handleResetAllFilters = () => {
    // Navigate to base URL with no filters (lockedYardId will be preserved via URL params if needed)
    navigate('/cars', { replace: true });
  };

  const hasBasicFilters = (filters: CarFilters): boolean => {
    return !!(
      filters.manufacturer ||
      filters.model ||
      filters.yearFrom ||
      filters.yearTo ||
      filters.priceFrom ||
      filters.priceTo
    );
  };

  const handleSaveSearchClick = () => {
    if (!firebaseUser) {
      alert('נדרשת התחברות לשמירת חיפוש');
      navigate('/account');
      return;
    }

    const persona = getDefaultPersona(userProfile);
    if (!persona || persona === 'YARD') {
      alert('שמירת חיפושים זמינה רק למשתמשים שאינם מגרש');
      return;
    }

    if (!hasBasicFilters(currentFilters)) {
      alert('אי אפשר לשמור חיפוש ללא סינון בסיסי (למשל יצרן או דגם).');
      return;
    }

    const defaultLabel = generateSearchLabel(currentFilters);
    setSaveLabel(defaultLabel);
    setShowSaveDialog(true);
  };

  const handleSaveSearchConfirm = async () => {
    if (!firebaseUser || !saveLabel.trim()) return;

    const persona = getDefaultPersona(userProfile);
    if (!persona || persona === 'YARD') return;

    setIsSavingSearch(true);
    try {
      await createSavedSearch(firebaseUser.uid, {
        filters: currentFilters,
        label: saveLabel.trim(),
        role: persona,
        type: 'CAR_FOR_SALE',
      });
      setShowSaveDialog(false);
      setSaveLabel('');
      alert('החיפוש נשמר. נעדכן אותך כשתהיה התאמה חדשה.');
    } catch (err: any) {
      console.error('Error saving search:', err);
      alert('שגיאה בשמירת החיפוש');
    } finally {
      setIsSavingSearch(false);
    }
  };

  if (loading) {
    return (
      <div className="cars-search-page">
        <h1 className="page-title">רכבים שנמצאו</h1>
        <div className="card">
          <p className="text-center">טוען רכבים...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cars-search-page">
        <h1 className="page-title">רכבים שנמצאו</h1>
        <div className="card">
          <p className="text-center" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'block', textAlign: 'center' }}>
            חזור לחיפוש
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cars-search-page">
      <h1 className="page-title">רכבים שנמצאו</h1>
      
      {/* Filter Bar */}
      <CarSearchFilterBar
        filters={currentFilters}
        onChange={handleFiltersChange}
        onResetAll={handleResetAllFilters}
      />
      
      {/* Seller Type Filter - only show if not in yard mode */}
      {!currentYardId && (
        <div className="seller-filter-section">
          <label className="seller-filter-label">סוג מוכר:</label>
          <div className="seller-filter-buttons">
            <button
              type="button"
              className={`seller-filter-btn ${sellerFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSellerFilter('all')}
            >
              הכל
            </button>
            <button
              type="button"
              className={`seller-filter-btn ${sellerFilter === 'yard' ? 'active' : ''}`}
              onClick={() => setSellerFilter('yard')}
            >
              מגרשים בלבד
            </button>
            <button
              type="button"
              className={`seller-filter-btn ${sellerFilter === 'private' ? 'active' : ''}`}
              onClick={() => setSellerFilter('private')}
            >
              מוכרים פרטיים בלבד
            </button>
          </div>
        </div>
      )}

      {searchResults.length === 0 ? (
        <div className="no-results card">
          <p>לא נמצאו רכבים התואמים לחיפוש שלך.</p>
          <Link to="/" className="btn btn-primary">
            חזור לחיפוש
          </Link>
        </div>
      ) : (
        <>
          <div className="results-header">
            <div className="results-header-left">
              <p className="results-count">נמצאו {filteredByFavorites.length} רכבים מתאימים</p>
              <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              <FavoritesFilterChips filter={favoritesFilter} onFilterChange={setFavoritesFilter} />
            </div>
            {firebaseUser && getDefaultPersona(userProfile) !== 'YARD' && (
              <button
                type="button"
                className="btn btn-secondary save-search-btn"
                onClick={handleSaveSearchClick}
                disabled={!hasBasicFilters(currentFilters)}
              >
                שמור חיפוש
              </button>
            )}
          </div>
          {viewMode === 'gallery' ? (
            <div className="cars-grid">
              {filteredByFavorites.map((item) => {
              // Route based on item type:
              // - YARD cars (PUBLIC_CAR) → /cars/:id (CarDetailsPage)
              // - Private seller ads (CAR_AD) → /car/:id (PublicCarPage)
              let carLink: string;
              if (item.sellerType === 'YARD' || item.source === 'PUBLIC_CAR') {
                // Yard/public car → use /cars/:id route
                carLink = `/cars/${item.id}`;
                // Add yardId query param if in yard mode
                if (currentYardId) {
                  carLink += `?yardId=${currentYardId}`;
                }
              } else {
                // Private seller ad → use /car/:id route
                carLink = `/car/${item.id}`;
                // Add yardId query param if in yard mode (for context)
                if (currentYardId) {
                  carLink += `?yardId=${currentYardId}`;
                }
              }
                const isFav = favoriteCarIds.has(item.id);
                return (
                  <div key={item.id} className="car-card-wrapper">
                    <Link to={carLink} className="car-card card">
                      <div className="car-image">
                        <CarImage 
                          src={item.mainImageUrl} 
                          alt={item.title} 
                        />
                        <div className="car-card-heart">
                          <FavoriteHeart
                            isFavorite={isFav}
                            onToggle={() => handleToggleFavorite(item.id, isFav)}
                            disabled={!firebaseUser}
                          />
                        </div>
                      </div>
                      <div className="car-info">
                        <div className="car-header-row">
                          <h3 className="car-title">{item.title}</h3>
                          <div className="car-badges">
                            {item.promotion?.highlightUntil && isPromotionActive(item.promotion.highlightUntil) && (
                              <span className="promotion-badge promoted">מודעה מקודמת</span>
                            )}
                            {item.promotion?.boostUntil && isPromotionActive(item.promotion.boostUntil) && (
                              <span className="promotion-badge boosted">מוקפץ</span>
                            )}
                            {item.yardPromotion && isRecommendedYard(item.yardPromotion) && (
                              <span className="promotion-badge recommended-yard">מגרש מומלץ</span>
                            )}
                            <span className={`seller-type-badge ${item.sellerType === 'YARD' ? 'yard' : 'private'}`}>
                              {item.sellerType === 'YARD' ? 'מגרש' : 'מוכר פרטי'}
                            </span>
                          </div>
                        </div>
                        {item.price && (
                          <p className="car-price">מחיר: {formatPrice(item.price)} ₪</p>
                        )}
                        {item.mileageKm !== undefined && (
                          <p className="car-km">ק״מ: {item.mileageKm.toLocaleString('he-IL')}</p>
                        )}
                        {item.city && (
                          <p className="car-location">מיקום: {item.city}</p>
                        )}
                        <div className="car-view-button-wrapper">
                          <span className="car-view-text">לצפייה בפרטים</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="cars-list">
              {filteredByFavorites.map((item) => {
                let carLink: string;
                if (item.sellerType === 'YARD' || item.source === 'PUBLIC_CAR') {
                  carLink = `/cars/${item.id}`;
                  if (currentYardId) {
                    carLink += `?yardId=${currentYardId}`;
                  }
                } else {
                  carLink = `/car/${item.id}`;
                  if (currentYardId) {
                    carLink += `?yardId=${currentYardId}`;
                  }
                }
                const isFav = favoriteCarIds.has(item.id);
                return (
                  <CarListItem
                    key={item.id}
                    car={item}
                    isFavorite={isFav}
                    onToggleFavorite={() => handleToggleFavorite(item.id, isFav)}
                    carLink={carLink}
                    formatPrice={formatPrice}
                    isPromotionActive={isPromotionActive}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Save Search Dialog */}
      {showSaveDialog && (
        <div className="save-search-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-search-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>שמור חיפוש</h3>
            <p className="dialog-subtitle">החיפוש יישמר ותקבל התראות על רכבים חדשים שמתאימים</p>
            <label className="dialog-label">
              שם החיפוש:
              <input
                type="text"
                className="dialog-input"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="לדוגמה: טויוטה קורולה עד 2017"
                dir="rtl"
                autoFocus
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveLabel('');
                }}
                disabled={isSavingSearch}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveSearchConfirm}
                disabled={isSavingSearch || !saveLabel.trim()}
              >
                {isSavingSearch ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
