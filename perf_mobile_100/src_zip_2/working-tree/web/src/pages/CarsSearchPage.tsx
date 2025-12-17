import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchPublicCars, type PublicCar } from '../api/publicCarsApi';
import type { Car, CarFilters } from '../api/carsApi';
import { fetchActiveCarAds } from '../api/carAdsApi';
import { getCityById, getRegions } from '../catalog/locationCatalog';
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
import { getCarDetailsUrl } from '../utils/carRouting';
import { loadFavoriteCarIds, addFavorite, removeFavorite } from '../api/favoritesApi';
import { ViewModeToggle, type ViewMode } from '../components/cars/ViewModeToggle';
import { FavoritesFilterChips, type FavoritesFilter } from '../components/cars/FavoritesFilterChips';
import { CarListItem } from '../components/cars/CarListItem';
import { FavoriteHeart } from '../components/cars/FavoriteHeart';
import { CarImage } from '../components/cars/CarImage';
import { normalizeRanges } from '../utils/rangeValidation';
import { PROMO_PROOF_MODE } from '../config/flags';
import { getPromotionBadges } from '../utils/promotionLabels';
import './CarsSearchPage.css';

interface CarsSearchPageProps {
  lockedYardId?: string; // When provided, filter to this yard only
}

export default function CarsSearchPage({ lockedYardId }: CarsSearchPageProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuth();
  const { activeYardId } = useYardPublic();
  
  // Use lockedYardId prop or activeYardId from context
  const currentYardId = lockedYardId || activeYardId;
  
  // Memoize searchParams from location.search to ensure stable reference
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  
  // Helper to map PublicCar to Car format (for compatibility with existing mappers)
  const mapPublicCarToCar = (publicCar: PublicCar): Car => {
    return {
      id: publicCar.carId,
      manufacturerHe: publicCar.brand || '',
      modelHe: publicCar.model || '',
      year: publicCar.year || 0,
      price: publicCar.price || 0,
      km: publicCar.mileageKm || 0,
      city: publicCar.city || publicCar.cityNameHe || '',
      mainImageUrl: publicCar.mainImageUrl || undefined,
      imageUrls: publicCar.imageUrls,
      yardUid: publicCar.yardUid,
      regionId: null,
      regionNameHe: null,
      cityId: null,
      cityNameHe: publicCar.cityNameHe || null,
      neighborhoodId: null,
      neighborhoodNameHe: null,
      gearboxType: publicCar.gearType || null,
      fuelType: publicCar.fuelType || null,
      bodyType: publicCar.bodyType || null,
      engineDisplacementCc: null,
      horsepower: null,
      ownershipType: null,
      importType: null,
      previousUse: null,
    };
  };

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
  const [withImagesOnly, setWithImagesOnly] = useState(false);

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
      // Brand filters - support both manufacturerIds array and legacy manufacturer
      manufacturerIds: (() => {
        const manufacturerIdsParam = searchParams.get('manufacturerIds');
        if (manufacturerIdsParam) {
          const ids = manufacturerIdsParam.split(',').map(s => s.trim()).filter(Boolean);
          return ids.length > 0 ? ids : undefined;
        }
        return undefined;
      })(),
      // Legacy single manufacturer field (for backward compatibility)
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

    // Normalize ranges (swap reversed min/max pairs)
    const normalizationResult = normalizeRanges(filters);
    const normalizedFilters = normalizationResult.normalized;

    // Dev-only logging
    if (import.meta.env.DEV) {
      console.log('[CarsSearchPage] Parsed filters from URL:', {
        filters,
        normalizedFilters,
        fixes: normalizationResult.fixes,
        searchParams: Object.fromEntries(searchParams.entries()),
        cityId: normalizedFilters.cityId,
        regionId: normalizedFilters.regionId,
      });
    }

    // If normalization swapped values, update URL to reflect corrected filters
    if (normalizationResult.fixes.length > 0) {
      const correctedUrl = buildSearchUrl(normalizedFilters, '/cars', false);
      navigate(correctedUrl, { replace: true });
      return; // Exit early, let the effect re-run with corrected URL
    }

    setCurrentFilters(normalizedFilters);

    // Resolve cityId to city name for private ads
    const resolveCityNameHe = (regionId?: string, cityId?: string): string | undefined => {
      if (!cityId) return undefined;
      if (regionId) {
        const c = getCityById(regionId, cityId);
        if (c?.labelHe) return c.labelHe;
      }
      for (const r of getRegions()) {
        const c = r.cities.find(x => x.id === cityId);
        if (c?.labelHe) return c.labelHe;
      }
      return undefined;
    };

    // Fetch both sources in parallel
    Promise.all([
      fetchPublicCars(normalizedFilters).then((publicCars) => {
        // Map PublicCar[] to Car[] for compatibility
        return publicCars.map(mapPublicCarToCar);
      }).catch((err) => {
        if (import.meta.env.DEV) {
          console.error('Error fetching public cars:', err);
        }
        // Set error state for visibility but still allow page to render
        setError('שגיאה בטעינת רכבים למכירה. נסה שוב.');
        return [];
      }),
      // Only fetch carAds if not in yard mode (yard mode should only show yard cars)
      currentYardId
        ? Promise.resolve([])
        : fetchActiveCarAds({
            manufacturer: normalizedFilters.manufacturerIds && normalizedFilters.manufacturerIds.length > 0 
              ? normalizedFilters.manufacturerIds[0] 
              : normalizedFilters.manufacturer,
            model: normalizedFilters.model,
            yearFrom: normalizedFilters.yearFrom,
            yearTo: normalizedFilters.yearTo,
            priceFrom: normalizedFilters.priceFrom,
            priceTo: normalizedFilters.priceTo,
            city: resolveCityNameHe(normalizedFilters.regionId, normalizedFilters.cityId) || undefined,
          }).catch((err) => {
            if (import.meta.env.DEV) {
              console.error('Error fetching car ads:', err);
            }
            return [];
          }),
    ])
      .then(async ([carsResult, adsResult]) => {
        // Dev-only logging
        if (import.meta.env.DEV) {
          console.log('[CarsSearchPage] Fetched results:', {
            publicCarsCount: carsResult.length,
            carAdsCount: adsResult.length,
            filters: normalizedFilters,
            cityId: normalizedFilters.cityId,
            regionId: normalizedFilters.regionId,
          });
        }
        
        // Dev-only warning: empty results with no filters may indicate missing projection
        const hasAnyFilters =
          Boolean(normalizedFilters?.manufacturerIds?.length) ||
          Boolean(normalizedFilters?.model) ||
          Boolean(normalizedFilters?.yearFrom || normalizedFilters?.yearTo) ||
          Boolean(normalizedFilters?.priceFrom || normalizedFilters?.priceTo) ||
          Boolean(normalizedFilters?.kmFrom || normalizedFilters?.kmTo) ||
          Boolean(normalizedFilters?.regionId) ||
          Boolean(normalizedFilters?.cityId) ||
          Boolean(normalizedFilters?.bodyTypes?.length) ||
          Boolean(normalizedFilters?.fuelTypes?.length) ||
          Boolean(normalizedFilters?.gearboxTypes?.length);
        
        if (import.meta.env.DEV && !hasAnyFilters && carsResult.length === 0 && adsResult.length === 0) {
          console.warn('[BuyerCars] Empty results with no filters — possible publicCars projection missing/stale (run rebuildPublicCarsForYard).');
        }
        
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
            if (import.meta.env.DEV) {
              console.error('Error loading yard promotions:', err);
            }
            // Non-blocking error
          }
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.error(err);
        }
        setError('אירעה שגיאה בטעינת רכבים');
      })
      .finally(() => setLoading(false));
  }, [location.search, lockedYardId, currentYardId]);

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
        if (import.meta.env.DEV) {
          console.error('Error loading favorites:', error);
        }
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
    const hasPlatinum = item.promotion.platinumUntil && isPromotionActive(item.promotion.platinumUntil);
    const hasBoost = item.promotion.boostUntil && isPromotionActive(item.promotion.boostUntil);
    const hasHighlight = item.promotion.highlightUntil && isPromotionActive(item.promotion.highlightUntil);
    const hasExposurePlus = item.promotion.exposurePlusUntil && isPromotionActive(item.promotion.exposurePlusUntil);
    
    // PLATINUM: highest priority (+1000, must beat all other tiers)
    if (hasPlatinum) {
      score += 1000;
    }
    
    // Promotion Contract: BOOST +300, HIGHLIGHT +200, EXPOSURE_PLUS +100
    if (hasBoost) {
      score += 300;
    }
    if (hasHighlight) {
      score += 200;
    }
    if (hasExposurePlus) {
      score += 100;
    }
    
    // Combo bonus: BOOST + HIGHLIGHT = +50 extra
    if (hasBoost && hasHighlight) {
      score += 50;
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
      if (import.meta.env.DEV) {
        console.error('Error toggling favorite:', error);
      }
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
      
      if (totalPromoScoreA !== totalPromoScoreB) {
        return totalPromoScoreB - totalPromoScoreA; // Higher score first
      }
      
      // Secondary: Price (ascending) - preserve expected browsing
      const priceA = a.price || 0;
      const priceB = b.price || 0;
      return priceA - priceB;
    });
    
    return combined;
  }, [publicCars, carAds, sellerFilter, yardPromotions]);

  // Filter by favorites and images
  const filteredByFavorites = useMemo(() => {
    let filtered = searchResults.filter((car) => {
      const isFav = favoriteCarIds.has(car.id);
      if (favoritesFilter === 'only_favorites') return isFav;
      if (favoritesFilter === 'without_favorites') return !isFav;
      return true;
    });
    
    // Filter by images if enabled
    if (withImagesOnly) {
      filtered = filtered.filter((car) => {
        const hasMainImage = car.mainImageUrl && typeof car.mainImageUrl === 'string' && car.mainImageUrl.trim() !== '';
        const hasImageUrls = Array.isArray(car.imageUrls) && car.imageUrls.length > 0;
        return hasMainImage || hasImageUrls;
      });
    }
    
    return filtered;
  }, [searchResults, favoriteCarIds, favoritesFilter, withImagesOnly]);

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

    // Dev-only logging
    if (import.meta.env.DEV) {
      console.log('[CarsSearchPage] Filter changed:', {
        newFilters,
        mergedFilters,
        previousFilters: currentFilters,
      });
    }

    // Build URL from filters
    const newUrl = buildSearchUrl(mergedFilters, '/cars', false);
    const currentUrl = buildSearchUrl(currentFilters, '/cars', false);
    
    // Prevent redundant refetch if URL hasn't changed
    if (newUrl === currentUrl) {
      if (import.meta.env.DEV) {
        console.log('[CarsSearchPage] Filter change resulted in same URL, skipping navigation');
      }
      return;
    }
    
    navigate(newUrl, { replace: true });
  };

  // Handle reset all filters
  const handleResetAllFilters = () => {
    // Navigate to base URL with no filters (lockedYardId will be preserved via URL params if needed)
    navigate('/cars', { replace: true });
  };

  const hasBasicFilters = (filters: CarFilters): boolean => {
    return !!(
      (filters.manufacturerIds && filters.manufacturerIds.length > 0) ||
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
      if (import.meta.env.DEV) {
        console.error('Error saving search:', err);
      }
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
              <button
                type="button"
                className={`filter-chip ${withImagesOnly ? 'active' : ''}`}
                onClick={() => setWithImagesOnly(!withImagesOnly)}
                style={{
                  padding: '0.5rem 1rem',
                  marginRight: '0.5rem',
                  borderRadius: '1.5rem',
                  border: `1px solid ${withImagesOnly ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: withImagesOnly ? 'var(--color-primary)' : 'transparent',
                  color: withImagesOnly ? 'white' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  fontFamily: 'Heebo, sans-serif',
                  transition: 'all 0.2s',
                }}
              >
                רק עם תמונות
              </button>
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
              {filteredByFavorites.map((item, index) => {
              // Use centralized routing helper
              let carLink = getCarDetailsUrl(item);
              // Add yardId query param if in yard mode
              if (currentYardId) {
                carLink += `?yardId=${currentYardId}`;
              }
                const isFav = favoriteCarIds.has(item.id);
                const isProofMode = PROMO_PROOF_MODE && (userProfile?.isYard || userProfile?.isAdmin);
                const rankIndex = isProofMode ? index + 1 : undefined;
                // Fallback to first imageUrl if mainImageUrl is missing
                const cardSrc = item.mainImageUrl || (item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : undefined);
                
                // Compute promotion states for gallery view
                const isPlatinum = item.promotion?.platinumUntil && isPromotionActive(item.promotion.platinumUntil);
                const isBoosted = item.promotion?.boostUntil && isPromotionActive(item.promotion.boostUntil);
                const isHighlighted = item.promotion?.highlightUntil && isPromotionActive(item.promotion.highlightUntil);
                const isExposurePlus = item.promotion?.exposurePlusUntil && isPromotionActive(item.promotion.exposurePlusUntil);
                
                const cardClassName = [
                  'car-card',
                  'card',
                  isPlatinum ? 'is-platinum' : '',
                  isBoosted ? 'is-boosted' : '',
                  isHighlighted ? 'is-highlighted' : '',
                  isExposurePlus ? 'is-exposure-plus' : '',
                ].filter(Boolean).join(' ');
                
                return (
                  <div key={item.id} className="car-card-wrapper">
                    <Link to={carLink} className={cardClassName}>
                      <div className="car-image">
                        <CarImage 
                          src={cardSrc} 
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
                          <h3 className={`car-title ${isExposurePlus ? 'is-exposure-plus-title' : ''}`}>
                            {item.title}
                          </h3>
                          {/* Proof mode: rank display */}
                          {isProofMode && rankIndex !== undefined && (
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '0.25rem' }}>
                              Rank #{rankIndex} / {filteredByFavorites.length}
                            </div>
                          )}
                          <div className="car-badges">
                            {/* Use contract labels for badges */}
                            {getPromotionBadges(item.promotion, isPromotionActive).map((badge, idx) => {
                              let badgeClass = 'promotion-badge';
                              if (badge === 'PLATINUM') badgeClass += ' platinum';
                              else if (badge === 'מוקפץ') badgeClass += ' boosted';
                              else if (badge === 'מובלט') badgeClass += ' promoted';
                              else if (badge === 'מודעה מודגשת') badgeClass += ' exposure-plus';
                              
                              return (
                                <span key={idx} className={badgeClass}>{badge}</span>
                              );
                            })}
                            {item.yardPromotion && isRecommendedYard(item.yardPromotion) && (
                              <span className="promotion-badge recommended-yard">מגרש מומלץ</span>
                            )}
                            <span className={`seller-type-badge ${item.sellerType === 'YARD' ? 'yard' : 'private'}`}>
                              {item.sellerType === 'YARD' ? 'מגרש' : 'מוכר פרטי'}
                            </span>
                          </div>
                        </div>
                        {item.price && (
                          <p className={`car-price ${isExposurePlus ? 'is-exposure-plus-price' : ''}`}>
                            מחיר: {formatPrice(item.price)} ₪
                          </p>
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
              {filteredByFavorites.map((item, index) => {
                // Use centralized routing helper
                let carLink = getCarDetailsUrl(item);
                if (currentYardId) {
                  carLink += `?yardId=${currentYardId}`;
                }
                const isFav = favoriteCarIds.has(item.id);
                const isProofMode = PROMO_PROOF_MODE && (userProfile?.isYard || userProfile?.isAdmin);
                const rankIndex = isProofMode ? index + 1 : undefined;
                return (
                  <CarListItem
                    key={item.id}
                    car={item}
                    isFavorite={isFav}
                    onToggleFavorite={() => handleToggleFavorite(item.id, isFav)}
                    carLink={carLink}
                    formatPrice={formatPrice}
                    isPromotionActive={isPromotionActive}
                    rankIndex={rankIndex}
                    totalResults={isProofMode ? filteredByFavorites.length : undefined}
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
