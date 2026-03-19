import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  syncVehicleReliable,
  getCkanSyncRequestUrl,
  startGovSyncJob,
  type GovSyncMode,
  type SyncVehicleReliableResult,
} from '../api/govSyncApi';
import {
  fetchYardCarsForUser,
  type YardCar,
  type YardFleetSortField,
  type CarPublicationStatus,
  type ImageFilterMode,
} from '../api/yardFleetApi';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import { rebuildPublicCarsForYard } from '../api/publicCarsApi';
import { collection, query, where, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import YardCarPromotionDialog from '../components/YardCarPromotionDialog';
import YardCarImagesDialog from '../components/yard/YardCarImagesDialog';
import CarImageGallery from '../components/cars/CarImageGallery';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { markYardCarSold } from '../api/yardSoldApi';
import { updateCarPublicationStatus } from '../api/yardPublishApi';
import YardPageHeader from '../components/yard/YardPageHeader';
import GovSyncProgress from '../components/yard/GovSyncProgress';
import { isPromotionActive } from '../utils/promotionTime';
import { compareCarsByMakeModel } from '../utils/carSorting';
import { normalizeYardSearchText } from '../utils/yardSearchNormalizer';
import LicensePlateBadge from '../components/common/LicensePlateBadge';
import './YardFleetPage.css';

/** Diagnostic result for GOV DEBUGGER (reliable sync: CKAN primary). Copyable as JSON. */
interface GovDebugResult {
  request: { url: string; origin: string; plateDigits: string; carId: string };
  token: { hasToken: boolean; tokenLength: number };
  source: SyncVehicleReliableResult['source'];
  ok: boolean;
  reason?: string;
  error?: string;
  mapped?: SyncVehicleReliableResult['mapped'];
  raw?: unknown;
}

export default function YardFleetPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCars, setAllCars] = useState<YardCar[]>([]);
  
  // Promotion dialog state
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [selectedCarForPromotion, setSelectedCarForPromotion] = useState<YardCar | null>(null);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCar, setPreviewCar] = useState<YardCar | null>(null);
  const [previewImageUrls, setPreviewImageUrls] = useState<string[]>([]);
  const [previewMainImageUrl, setPreviewMainImageUrl] = useState<string | undefined>();
  const [loadingPreviewImages, setLoadingPreviewImages] = useState(false);
  
  // Images dialog state
  const [showImagesDialog, setShowImagesDialog] = useState(false);
  const [selectedCarForImages, setSelectedCarForImages] = useState<YardCar | null>(null);
  
  // Sold confirmation dialog state
  const [showSoldDialog, setShowSoldDialog] = useState(false);
  const [selectedCarForSold, setSelectedCarForSold] = useState<YardCar | null>(null);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  
  // PublicCars backfill state
  const [isRepairingPublicCars, setIsRepairingPublicCars] = useState(false);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);
  const hasCheckedBackfill = useRef(false);
  const didRunInSessionRef = useRef(false);
  const hasRunOnceThisMountRef = useRef(false); // Guard: prevent running multiple times in same mount
  const carsLoadedOnceRef = useRef(false); // Track if cars have been loaded at least once
  
  // Filters and sort
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarPublicationStatus | 'ALL'>('ALL');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');
  const [imageFilter, setImageFilter] = useState<ImageFilterMode>('all');
  const [promotionFilter, setPromotionFilter] = useState<boolean>(false); // רק מקודמים
  const [importFilter, setImportFilter] = useState<'IN_IMPORT' | 'REMOVED_FROM_IMPORT' | 'ALL'>('IN_IMPORT'); // יבוא filter
  const [sortField, setSortField] = useState<YardFleetSortField>('makeModel');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Bulk sell state for removed cars
  const [isBulkSelling, setIsBulkSelling] = useState(false);
  const [bulkSellProgress, setBulkSellProgress] = useState<{ current: number; total: number } | null>(null);

  // Gov sync (משרד התחבורה): active job id, per-row sync state
  const [govSyncJobId, setGovSyncJobId] = useState<string | null>(null);
  const [govSyncRowId, setGovSyncRowId] = useState<string | null>(null);
  const [govSyncRowFeedback, setGovSyncRowFeedback] = useState<'ok' | 'fail' | null>(null);

  // GOV DEBUGGER (admin-only, localStorage toggle). When ON, per-row DEBUGGER button runs CORS/OPTIONS/POST diagnostics.
  const enableAdminGovDebugger =
    typeof localStorage !== 'undefined' && localStorage.getItem('admin.govDebugger') === '1';
  const [showGovDebugDialog, setShowGovDebugDialog] = useState(false);
  const [govDebugCar, setGovDebugCar] = useState<YardCar | null>(null);
  const [govDebugLoading, setGovDebugLoading] = useState(false);
  const [govDebugResult, setGovDebugResult] = useState<GovDebugResult | null>(null);

  // Debounced search text
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Load cars on mount
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;

      setIsLoading(true);
      setError(null);
      try {
        const loadedCars = await fetchYardCarsForUser();
        setAllCars(loadedCars);
        carsLoadedOnceRef.current = true; // Mark that cars have been loaded
      } catch (err: any) {
        console.error('Error loading yard cars:', err);
        setError('שגיאה בטעינת צי הרכב');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  // Debug telemetry helper (gated by localStorage.debugRepair='1' and non-production)
  const DEBUG_REPAIR = (import.meta.env.MODE !== 'production') && localStorage.getItem('debugRepair') === '1';
  const debugLog = (event: string, data?: Record<string, any>) => {
    if (!DEBUG_REPAIR) return;
    const logData: Record<string, any> = {
      event,
      uid: firebaseUser?.uid || 'unknown',
      timestamp: new Date().toISOString(),
      ...data,
    };
    console.log('[YardFleetPage:debugRepair]', logData);
  };

  // Auto-check and repair publicCars projection (runs only when needed, with TTL guard)
  // FIXED: Prevent running on every page entry - now runs only once per mount + respects TTL
  useEffect(() => {
    async function checkAndRepair(force: boolean = false) {
      if (!firebaseUser || isLoading) return;
      
      // Once-per-mount guard: prevent running multiple times in same component mount
      // This prevents React StrictMode double-invocation and re-runs on navigation
      if (!force && hasRunOnceThisMountRef.current) {
        return;
      }
      
      // TTL guard: prevent running if it ran recently (6 hours) - works across mounts
      if (!force) {
        const ttlKey = `yardFleetSync:lastRun:${firebaseUser.uid}`;
        const lastRun = Number(localStorage.getItem(ttlKey) || '0');
        const now = Date.now();
        const ttlMs = 6 * 60 * 60 * 1000; // 6 hours
        
        if (now - lastRun < ttlMs) {
          const lastRunAgeMinutes = Math.round((now - lastRun) / 1000 / 60);
          if (import.meta.env.DEV) {
            console.log('[YardFleetPage] Sync skipped (TTL): last run was', lastRunAgeMinutes, 'minutes ago');
          }
          debugLog('ttl-not-expired', { lastRunAgeMinutes, ttlHours: 6 });
          hasRunOnceThisMountRef.current = true; // Mark as checked even if skipped
          hasCheckedBackfill.current = true;
          return;
        }
      }
      
      // Mark as run to prevent re-execution in this mount
      hasRunOnceThisMountRef.current = true;
      hasCheckedBackfill.current = true;
      if (!force) {
        didRunInSessionRef.current = true;
      }
      
      try {
        // Count published cars in MASTER
        const publishedMasterCount = allCars.filter(
          c => c.publicationStatus === 'PUBLISHED' && c.saleStatus !== 'SOLD'
        ).length;
        
        if (publishedMasterCount === 0) {
          // No published cars, nothing to check - don't update TTL (let TTL guard prevent frequent checks)
          debugLog('no-published-cars', { publishedMasterCount: 0 });
          return;
        }
        
        // Query publicCars for this yard
        const publicCarsQuery = query(
          collection(db, 'publicCars'),
          where('yardUid', '==', firebaseUser.uid),
          where('isPublished', '==', true)
        );
        const publicCarsSnapshot = await getDocsFromServer(publicCarsQuery);
        const publicCount = publicCarsSnapshot.size;
        
        // If mismatch, auto-repair
        if (publishedMasterCount > 0 && publicCount < publishedMasterCount) {
          const mismatchCount = publishedMasterCount - publicCount;
          if (import.meta.env.DEV) {
            console.log('[YardFleetPage] PublicCars mismatch detected, auto-repairing:', {
              publishedMasterCount,
              publicCount,
              yardUid: firebaseUser.uid,
            });
          }
          
          setIsRepairingPublicCars(true);
          setRepairStatus('מסנכרן רכבים למכירה...');
          
          await rebuildPublicCarsForYard();
          
          // Reload cars to refresh
          const reloadedCars = await fetchYardCarsForUser();
          setAllCars(reloadedCars);
          
          // Update TTL ONLY after successful repair
          const ttlKey = `yardFleetSync:lastRun:${firebaseUser.uid}`;
          localStorage.setItem(ttlKey, String(Date.now()));
          
          debugLog('repair-done', {
            publishedMasterCount,
            publicCountBefore: publicCount,
            mismatchCount,
          });
          
          setIsRepairingPublicCars(false);
          setRepairStatus(null);
        } else {
          // If no mismatch, don't update TTL - let the TTL guard prevent checking too frequently
          debugLog('no-mismatch', { publishedMasterCount, publicCount });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[YardFleetPage] Error checking/repairing publicCars:', err);
        }
        setIsRepairingPublicCars(false);
        setRepairStatus(null);
      }
    }
    
    // FIXED: Only run once after initial load completes (not on every navigation)
    // The effect runs when isLoading becomes false AND cars have been loaded, but the guards ensure:
    // 1. Once-per-mount guard prevents multiple runs in same mount
    // 2. TTL guard prevents running if it ran recently (6 hours) - works across remounts
    if (!isLoading && carsLoadedOnceRef.current && !hasRunOnceThisMountRef.current && firebaseUser) {
      // Check if we have cars data - if allCars is empty, wait for it to load
      // This check is safe even if allCars is not in deps, because we only run when carsLoadedOnceRef is true
      checkAndRepair(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, firebaseUser]); // FIXED: Removed allCars from dependencies - effect only triggers on load completion

  // Manual repair handler (bypasses TTL and session guards)
  const handleManualRepair = async () => {
    if (!firebaseUser) return;
    
    setIsRepairingPublicCars(true);
    setRepairStatus('מסנכרן רכבים למכירה...');
    
    try {
      await rebuildPublicCarsForYard();
      
      // Reload cars
      const reloadedCars = await fetchYardCarsForUser();
      setAllCars(reloadedCars);
      
      // Update TTL after successful manual sync
      const ttlKey = `yardFleetSync:lastRun:${firebaseUser.uid}`;
      localStorage.setItem(ttlKey, String(Date.now()));
      
      debugLog('repair-done', { manual: true });
      
      setRepairStatus('סינכרון הושלם בהצלחה');
      setTimeout(() => setRepairStatus(null), 3000);
    } catch (err) {
      console.error('[YardFleetPage] Error in manual repair:', err);
      setRepairStatus('שגיאה בסינכרון');
      setTimeout(() => setRepairStatus(null), 3000);
    } finally {
      setIsRepairingPublicCars(false);
    }
  };

  const handleStartGovSync = async (mode: GovSyncMode) => {
    if (govSyncJobId) {
      alert('יש עדכון פעיל כרגע. המתין לסיום.');
      return;
    }
    try {
      const statusParam = mode === 'STATUS' ? statusFilter : undefined;
      const res = await startGovSyncJob(mode, statusParam);
      if (res.ok && res.jobId) setGovSyncJobId(res.jobId);
      else alert('לא הצלחנו להתחיל עדכון משרד התחבורה');
    } catch (err: any) {
      console.error('startGovSyncJob error:', err);
      alert('שגיאה: ' + (err?.message || 'לא ניתן להתחיל עדכון'));
    }
  };

  const handleRowGovSync = async (car: YardCar) => {
    const plateRaw = car.licensePlatePartial?.toString().trim() || '';
    const plateDigits = plateRaw.replace(/\D/g, '');

    if (!plateDigits) {
      alert('אין מספר רישוי תקין לרכב הזה');
      return;
    }

    // Israeli license plates are typically 7–8 digits
    if (plateDigits.length < 7 || plateDigits.length > 8) {
      alert('מספר רישוי לא תקין: ' + plateRaw);
      return;
    }

    setGovSyncRowId(car.id);
    setGovSyncRowFeedback(null);
    try {
      const res = await syncVehicleReliable({
        plateDigits,
        carId: car.id,
      });
      setGovSyncRowFeedback(res.ok ? 'ok' : 'fail');
      if (!res.ok && res.reason !== 'NOT_FOUND') {
        alert('עדכון משרד התחבורה: ' + (res.error || res.reason || 'שגיאה'));
      }
      if (!res.ok && res.reason === 'NOT_FOUND') {
        alert('הרכב לא נמצא במשרד התחבורה');
      }
      setTimeout(() => { setGovSyncRowId(null); setGovSyncRowFeedback(null); }, 2000);
    } catch (err: any) {
      setGovSyncRowFeedback('fail');
      if (err?.code === 'not-found') {
        alert('הרכב לא נמצא במשרד התחבורה');
      } else if (err?.code === 'invalid-argument') {
        alert('מספר רישוי לא תקין');
      } else {
        console.error('Gov Sync error:', err);
        alert('שגיאה פנימית בסנכרון רכב');
      }
      setTimeout(() => { setGovSyncRowId(null); setGovSyncRowFeedback(null); }, 2000);
    }
  };

  /** Run CKAN-only sync and show result in debug modal. */
  const debugGovSync = useCallback(async (car: YardCar) => {
    const plateDigits = (car.licensePlatePartial ?? '').toString().replace(/\D/g, '');
    const carId = car.id;
    const url = getCkanSyncRequestUrl(plateDigits);
    const origin = window.location.origin;

    setGovDebugCar(car);
    setShowGovDebugDialog(true);
    setGovDebugLoading(true);
    setGovDebugResult(null);

    try {
      const result = await syncVehicleReliable({
        plateDigits,
        carId,
      });
      setGovDebugResult({
        request: { url, origin, plateDigits, carId },
        token: { hasToken: !!firebaseUser, tokenLength: 0 },
        source: result.source,
        ok: result.ok,
        reason: result.reason,
        error: result.error,
        mapped: result.mapped,
        raw: result.raw,
      });
    } finally {
      setGovDebugLoading(false);
    }
  }, [firebaseUser]);

  // Apply filters and sort
  const cars = useMemo(() => {
    let filtered = [...allCars];

    // Filter out SOLD cars from active inventory
    filtered = filtered.filter((car) => car.saleStatus !== 'SOLD');

    // Apply text search (normalized for robust Hebrew matching)
    if (debouncedSearchText) {
      const normalizedQuery = normalizeYardSearchText(debouncedSearchText);
      if (normalizedQuery) {
        filtered = filtered.filter((car) => {
          const searchableText = normalizeYardSearchText(
            [car.brandText, car.modelText, car.licensePlatePartial, car.notes]
              .filter(Boolean)
              .join(' ')
          );
          return searchableText.includes(normalizedQuery);
        });
      }
    }

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((car) => car.publicationStatus === statusFilter);
    }

    // Apply year range
    if (yearFrom) {
      const yearFromNum = parseInt(yearFrom, 10);
      filtered = filtered.filter((car) => car.year && car.year >= yearFromNum);
    }
    if (yearTo) {
      const yearToNum = parseInt(yearTo, 10);
      filtered = filtered.filter((car) => car.year && car.year <= yearToNum);
    }

    // Apply image filter
    if (imageFilter === 'withImages') {
      filtered = filtered.filter((car) => (car.imageCount || 0) > 0);
    } else if (imageFilter === 'withoutImages') {
      filtered = filtered.filter((car) => (car.imageCount || 0) === 0);
    }

    // Apply promotion filter (רק מקודמים)
    if (promotionFilter) {
      // Note: isPromotionActive is now imported from utils/promotionTime
      
      filtered = filtered.filter((car) => {
        if (!car.promotion) return false;
        const promo = car.promotion;
        return (
          (promo.diamondUntil && isPromotionActive(promo.diamondUntil)) ||
          (promo.platinumUntil && isPromotionActive(promo.platinumUntil)) ||
          (promo.boostUntil && isPromotionActive(promo.boostUntil)) ||
          (promo.highlightUntil && isPromotionActive(promo.highlightUntil)) ||
          (promo.exposurePlusUntil && isPromotionActive(promo.exposurePlusUntil))
        );
      });
    }

    // Apply import filter (יבוא)
    if (importFilter === 'IN_IMPORT') {
      // Default: exclude REMOVED_FROM_IMPORT cars
      filtered = filtered.filter((car) => car.importState !== 'REMOVED_FROM_IMPORT');
    } else if (importFilter === 'REMOVED_FROM_IMPORT') {
      // Show ONLY REMOVED_FROM_IMPORT cars
      filtered = filtered.filter((car) => car.importState === 'REMOVED_FROM_IMPORT');
    }
    // importFilter === 'ALL' means no filtering by importState

    // Apply sorting
    filtered.sort((a, b) => {
      // Special handling for makeModel sort (locale-aware)
      if (sortField === 'makeModel') {
        const compareResult = compareCarsByMakeModel(a, b);
        return sortDirection === 'asc' ? compareResult : -compareResult;
      }

      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'createdAt':
          aValue = a.createdAt || 0;
          bValue = b.createdAt || 0;
          break;
        case 'updatedAt':
          aValue = a.updatedAt || 0;
          bValue = b.updatedAt || 0;
          break;
        case 'price':
          aValue = a.salePrice || 0;
          bValue = b.salePrice || 0;
          break;
        case 'mileageKm':
          aValue = a.mileageKm || 0;
          bValue = b.mileageKm || 0;
          break;
        case 'year':
          aValue = a.year || 0;
          bValue = b.year || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [allCars, debouncedSearchText, statusFilter, yearFrom, yearTo, imageFilter, promotionFilter, importFilter, sortField, sortDirection]);

  // Calculate status counts for summary cards
  const statusCounts = useMemo(() => {
    const counts = {
      DRAFT: 0,
      PUBLISHED: 0,
      HIDDEN: 0,
      REMOVED_FROM_IMPORT: 0,
    };
    allCars.forEach((car) => {
      const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
      if (status === 'DRAFT') counts.DRAFT++;
      else if (status === 'PUBLISHED') counts.PUBLISHED++;
      else if (status === 'HIDDEN') counts.HIDDEN++;
      if (car.importState === 'REMOVED_FROM_IMPORT') counts.REMOVED_FROM_IMPORT++;
    });
    return counts;
  }, [allCars]);

  const getStatusLabel = (status?: string): string => {
    switch (status) {
      case 'PUBLISHED':
        return 'מפורסם';
      case 'HIDDEN':
        return 'מוסתר';
      case 'DRAFT':
        return 'טיוטה';
      default:
        return 'טיוטה';
    }
  };

  // Open preview modal and load images from publicCars (same as public car page)
  const openCarPreview = useCallback(async (car: YardCar) => {
    setPreviewCar(car);
    setShowPreviewModal(true);
    setPreviewImageUrls([]);
    setPreviewMainImageUrl(undefined);
    setLoadingPreviewImages(true);
    
    try {
      // Use publicCarId if available, otherwise fall back to car.id
      const effectiveId = car.publicCarId || car.id;
      
      // Load car data from publicCars collection (same source as public car page)
      const publicCar: Car | null = await fetchCarByIdWithFallback(effectiveId);
      
      if (publicCar) {
        const urls = publicCar.imageUrls ?? [];
        setPreviewImageUrls(urls);
        
        // Set main image URL with proper selection logic
        if (publicCar.mainImageUrl && urls.includes(publicCar.mainImageUrl)) {
          setPreviewMainImageUrl(publicCar.mainImageUrl);
        } else if (urls.length > 0) {
          setPreviewMainImageUrl(urls[0]);
        } else {
          setPreviewMainImageUrl(undefined);
        }
      } else {
        console.warn('[YardFleet] Public car not found for preview:', effectiveId);
        // Fallback: use mainImageUrl from YardCar if available
        if (car.mainImageUrl) {
          setPreviewImageUrls([car.mainImageUrl]);
          setPreviewMainImageUrl(car.mainImageUrl);
        }
      }
    } catch (err) {
      console.error('[YardFleet] Failed to load preview images:', car.id, err);
      // Fallback: use mainImageUrl from YardCar if available
      if (car.mainImageUrl) {
        setPreviewImageUrls([car.mainImageUrl]);
        setPreviewMainImageUrl(car.mainImageUrl);
      }
    } finally {
      setLoadingPreviewImages(false);
    }
  }, []);

  // Close preview modal
  const closeCarPreview = useCallback(() => {
    setShowPreviewModal(false);
    setPreviewCar(null);
    setPreviewImageUrls([]);
    setPreviewMainImageUrl(undefined);
  }, []);

  const getStatusClass = (status?: string): string => {
    switch (status) {
      case 'PUBLISHED':
        return 'status-published';
      case 'HIDDEN':
        return 'status-hidden';
      case 'DRAFT':
        return 'status-draft';
      default:
        return 'status-draft';
    }
  };

  if (isLoading) {
    return (
      <div className="yard-fleet-page">
        <div className="loading-container">
          <p>טוען את צי הרכב...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-fleet-page">
      <div className="page-container">
        <YardPageHeader
          title="צי הרכב שלי"
          actions={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleStartGovSync('ALL')}
                disabled={!!govSyncJobId}
                title="סנכרון כל הרכבים עם משרד התחבורה"
                aria-label="סנכרון כל הרכבים עם משרד התחבורה"
                style={{ marginLeft: '0.5rem' }}
              >
                <span aria-hidden="true">🚗✏️</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleStartGovSync('PUBLISHED')}
                disabled={!!govSyncJobId}
                title="סנכרון רכבים מפורסמים עם משרד התחבורה"
                aria-label="סנכרון רכבים מפורסמים"
                style={{ marginLeft: '0.25rem' }}
              >
                <span aria-hidden="true">📋🚗</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleStartGovSync('STATUS')}
                disabled={!!govSyncJobId}
                title="סנכרון לפי סטטוס נוכחי עם משרד התחבורה"
                aria-label="סנכרון לפי סטטוס"
                style={{ marginLeft: '0.25rem' }}
              >
                <span aria-hidden="true">🔍🚗</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleManualRepair}
                disabled={isRepairingPublicCars}
                style={{ marginLeft: '0.5rem' }}
              >
                {isRepairingPublicCars ? 'מסנכרן...' : 'תיקון מכירה (סנכרון)'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/yard/sales-history')}
                style={{ marginLeft: '12px' }}
              >
                היסטוריית מכירות
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/yard/add-car-images')}
                style={{ marginLeft: '0.5rem' }}
              >
                הוסף תמונות לרכב
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/yard/cars/new')}
              >
                הוסף רכב חדש
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/account')}
              >
                חזרה לאזור האישי
              </button>
            </>
          }
        />

        {repairStatus && (
          <div style={{ padding: '0.5rem 1rem', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
            {repairStatus}
          </div>
        )}

        {govSyncJobId && (
          <GovSyncProgress
            jobId={govSyncJobId}
            onDone={() => setGovSyncJobId(null)}
          />
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Status Summary Cards */}
        {allCars.length > 0 && (
          <div className="status-summary-cards">
            <div className="status-card status-card-draft">
              <div className="status-card-label">טיוטה</div>
              <div className="status-card-count">{statusCounts.DRAFT}</div>
            </div>
            <div className="status-card status-card-published">
              <div className="status-card-label">מפורסם</div>
              <div className="status-card-count">{statusCounts.PUBLISHED}</div>
            </div>
            <div className="status-card status-card-hidden">
              <div className="status-card-label">מוסתר</div>
              <div className="status-card-count">{statusCounts.HIDDEN}</div>
            </div>
            <div className="status-card status-card-hidden" style={{ backgroundColor: '#fff3cd', borderColor: '#ffc107' }}>
              <div className="status-card-label">הוסר מיבוא</div>
              <div className="status-card-count">{statusCounts.REMOVED_FROM_IMPORT}</div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        {allCars.length > 0 && (
          <div className="filters-section">
            <div className="filters-row">
              <div className="filter-group">
                <label className="filter-label">חיפוש</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="חפש לפי יצרן / דגם / לוחית / הערה"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">סטטוס</label>
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as CarPublicationStatus | 'ALL')}
                >
                  <option value="ALL">הכל</option>
                  <option value="DRAFT">טיוטה</option>
                  <option value="PUBLISHED">מפורסם</option>
                  <option value="HIDDEN">מוסתר</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">שנה מ-</label>
                <input
                  type="number"
                  className="filter-input filter-input-small"
                  placeholder="מ-"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  min="1900"
                  max="2100"
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">שנה עד</label>
                <input
                  type="number"
                  className="filter-input filter-input-small"
                  placeholder="עד"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  min="1900"
                  max="2100"
                />
              </div>

              <div className="filter-group">
                <label className="filter-label">תמונות</label>
                <select
                  className="filter-select"
                  value={imageFilter}
                  onChange={(e) => setImageFilter(e.target.value as ImageFilterMode)}
                >
                  <option value="all">הכל</option>
                  <option value="withImages">עם תמונות</option>
                  <option value="withoutImages">ללא תמונות</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">קידום</label>
                <select
                  className="filter-select"
                  value={promotionFilter ? 'promoted' : 'all'}
                  onChange={(e) => setPromotionFilter(e.target.value === 'promoted')}
                >
                  <option value="all">הכל</option>
                  <option value="promoted">רק מקודמים</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">יבוא</label>
                <select
                  className="filter-select"
                  value={importFilter}
                  onChange={(e) => setImportFilter(e.target.value as 'IN_IMPORT' | 'REMOVED_FROM_IMPORT' | 'ALL')}
                >
                  <option value="IN_IMPORT">בתוך מצבת</option>
                  <option value="REMOVED_FROM_IMPORT">הוסר מיבוא</option>
                  <option value="ALL">הכל</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">מיון</label>
                <select
                  className="filter-select"
                  value={`${sortField}-${sortDirection}`}
                  onChange={(e) => {
                    const [field, direction] = e.target.value.split('-');
                    setSortField(field as YardFleetSortField);
                    setSortDirection(direction as 'asc' | 'desc');
                  }}
                >
                  <option value="makeModel-asc">יצרן ודגם (א→ת / A→Z)</option>
                  <option value="makeModel-desc">יצרן ודגם (ת→א / Z→A)</option>
                  <option value="updatedAt-desc">תאריך עדכון (חדש → ישן)</option>
                  <option value="updatedAt-asc">תאריך עדכון (ישן → חדש)</option>
                  <option value="createdAt-desc">תאריך הוספה (חדש → ישן)</option>
                  <option value="createdAt-asc">תאריך הוספה (ישן → חדש)</option>
                  <option value="price-desc">מחיר (גבוה → נמוך)</option>
                  <option value="price-asc">מחיר (נמוך → גבוה)</option>
                  <option value="mileageKm-asc">קילומטראז' (נמוך → גבוה)</option>
                  <option value="mileageKm-desc">קילומטראז' (גבוה → נמוך)</option>
                  <option value="year-desc">שנה (חדש → ישן)</option>
                  <option value="year-asc">שנה (ישן → חדש)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Bulk sell action for removed cars */}
        {importFilter === 'REMOVED_FROM_IMPORT' && cars.length > 0 && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong style={{ color: '#856404' }}>נמצאו {cars.length} רכבים שהוסרו מיבוא</strong>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#856404' }}>
                  ניתן לסמן את כל הרכבים כנמכר ולמחוק את התמונות לצמיתות
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (!window.confirm(
                    `האם אתה בטוח שברצונך לסמן את כל ${cars.length} הרכבים כנמכר?\n\n` +
                    `פעולה זו תמחק לצמיתות את כל התמונות מהשרת.\n` +
                    `פעולה זו אינה ניתנת לביטול!`
                  )) {
                    return;
                  }
                  
                  setIsBulkSelling(true);
                  setBulkSellProgress({ current: 0, total: cars.length });
                  
                  try {
                    let successCount = 0;
                    let errorCount = 0;
                    
                    for (let i = 0; i < cars.length; i++) {
                      const car = cars[i];
                      try {
                        await markYardCarSold(car.id);
                        successCount++;
                      } catch (err: any) {
                        console.error(`Error marking car ${car.id} as sold:`, err);
                        errorCount++;
                      }
                      
                      setBulkSellProgress({ current: i + 1, total: cars.length });
                    }
                    
                    // Reload cars to refresh list
                    const reloadedCars = await fetchYardCarsForUser();
                    setAllCars(reloadedCars);
                    
                    alert(`הושלם: ${successCount} רכבים סומנו כנמכר${errorCount > 0 ? `, ${errorCount} שגיאות` : ''}`);
                  } catch (err: any) {
                    console.error('Error in bulk sell:', err);
                    alert('שגיאה בסימון הרכבים כנמכר: ' + (err.message || 'שגיאה לא ידועה'));
                  } finally {
                    setIsBulkSelling(false);
                    setBulkSellProgress(null);
                  }
                }}
                disabled={isBulkSelling}
                style={{ 
                  backgroundColor: '#d32f2f', 
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: isBulkSelling ? 'not-allowed' : 'pointer',
                  opacity: isBulkSelling ? 0.6 : 1,
                }}
              >
                {isBulkSelling 
                  ? (bulkSellProgress ? `מעבד... ${bulkSellProgress.current} / ${bulkSellProgress.total}` : 'מעבד...')
                  : 'סמן את כל החסרים כנמכר (ימחקו תמונות)'
                }
              </button>
            </div>
          </div>
        )}

        {allCars.length === 0 ? (
          <div className="empty-state">
            <p>אין עדיין רכבים במגרש</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/yard/cars/new')}
            >
              הוסף רכב ראשון
            </button>
          </div>
        ) : cars.length === 0 ? (
          <div className="empty-state">
            <p>לא נמצאו רכבים התואמים את הפילטרים</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchText('');
                setStatusFilter('ALL');
                setYearFrom('');
                setYearTo('');
                setImageFilter('all');
                setPromotionFilter(false);
                setImportFilter('IN_IMPORT');
              }}
            >
              נקה פילטרים
            </button>
          </div>
        ) : (
          <div className="cars-table-container">
            <table className="cars-table">
              <thead>
                <tr>
                  <th>תמונות</th>
                  <th>דגם</th>
                  <th>מס' רישוי</th>
                  <th>שנה</th>
                  <th>קילומטראז'</th>
                  <th>מחיר</th>
                  <th>עיר</th>
                  <th>קידום</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {cars.map((car) => {
                  const imageCount = car.imageCount || 0;
                  
                  // Check if any promotion is active
                  const hasActivePromotion = car.promotion && (
                    (car.promotion.diamondUntil && isPromotionActive(car.promotion.diamondUntil)) ||
                    (car.promotion.platinumUntil && isPromotionActive(car.promotion.platinumUntil)) ||
                    (car.promotion.boostUntil && isPromotionActive(car.promotion.boostUntil)) ||
                    (car.promotion.highlightUntil && isPromotionActive(car.promotion.highlightUntil)) ||
                    (car.promotion.exposurePlusUntil && isPromotionActive(car.promotion.exposurePlusUntil))
                  );
                  
                  return (
                    <tr key={car.id}>
                      <td>
                        <button
                          type="button"
                          className={`image-count-badge ${imageCount === 0 ? 'no-images' : 'has-images'}`}
                          onClick={() => {
                            setSelectedCarForImages(car);
                            setShowImagesDialog(true);
                          }}
                          title="לחץ לעריכת תמונות"
                        >
                          📷 {imageCount}
                        </button>
                      </td>
                      <td>
                        {car.brandText || car.brand || ''} {car.modelText || car.model || ''}
                      </td>
                      <td>
                        <LicensePlateBadge plate={car.licensePlatePartial} size="sm" />
                      </td>
                      <td>{car.year || '-'}</td>
                      <td>{car.mileageKm ? `${car.mileageKm.toLocaleString()} ק"מ` : '-'}</td>
                      <td>{car.price ? `₪${car.price.toLocaleString()}` : '-'}</td>
                      <td>{car.city || '-'}</td>
                      <td>
                        <span style={{ color: hasActivePromotion ? '#2e7d32' : '#999', fontSize: '0.875rem' }}>
                          {hasActivePromotion ? 'קידום פעיל' : 'ללא קידום'}
                        </span>
                      </td>
                      <td>
                        {car.importState === 'REMOVED_FROM_IMPORT' && (
                          <div style={{ fontSize: '0.75rem', color: '#856404', marginBottom: '0.25rem' }}>
                            הוסר מיבוא
                          </div>
                        )}
                        <select
                          className="status-select"
                          value={car.saleStatus === 'SOLD' ? 'SOLD' : (car.publicationStatus || 'DRAFT')}
                          onChange={async (e) => {
                            const newValue = e.target.value;
                            if (newValue === 'SOLD') {
                              // Show confirm dialog for SOLD
                              setSelectedCarForSold(car);
                              setShowSoldDialog(true);
                            } else {
                              // Update publication status with optimistic update (no reload)
                              const oldStatus = car.publicationStatus || 'DRAFT';
                              const newStatus = newValue as CarPublicationStatus;
                              
                              // Optimistically update local state immediately
                              setAllCars((prevCars) =>
                                prevCars.map((c) =>
                                  c.id === car.id ? { ...c, publicationStatus: newStatus } : c
                                )
                              );
                              
                              try {
                                await updateCarPublicationStatus(car.id, newStatus);
                                // Success - state already updated optimistically
                              } catch (err: any) {
                                console.error('Error updating car status:', err);
                                // Revert optimistic update on error
                                setAllCars((prevCars) =>
                                  prevCars.map((c) =>
                                    c.id === car.id ? { ...c, publicationStatus: oldStatus as CarPublicationStatus } : c
                                  )
                                );
                                alert('שגיאה בעדכון סטטוס: ' + (err.message || 'שגיאה לא ידועה'));
                              }
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.875rem',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="DRAFT">טיוטה</option>
                          <option value="PUBLISHED">מפורסם</option>
                          <option value="HIDDEN">מוסתר</option>
                          <option value="SOLD">נמכר</option>
                        </select>
                      </td>
                      <td className="col-actions">
                        <div className="car-action-buttons">
                          {/* View button - opens quick preview modal */}
                          {car.publicationStatus === 'PUBLISHED' && (
                            <button
                              type="button"
                              className="action-chip"
                              onClick={() => openCarPreview(car)}
                              aria-label="צפייה בפרטי הרכב"
                              title="צפייה בפרטי הרכב"
                            >
                              <span className="chip-emoji" aria-hidden="true">🔍</span>
                            </button>
                          )}
                          {/* צפייה באתר - opens public car page in new tab */}
                          {car.publicationStatus === 'PUBLISHED' && firebaseUser && (
                            <button
                              type="button"
                              className="action-chip"
                              onClick={() => {
                                window.open(`/cars/${car.id}?yardId=${firebaseUser.uid}`, '_blank', 'noopener,noreferrer');
                              }}
                              title="פתיחת אתר"
                              aria-label="פתיחת אתר"
                            >
                              <span className="chip-emoji" aria-hidden="true">🌐</span>
                            </button>
                          )}
                          {car.publicationStatus === 'PUBLISHED' && (
                            <button
                              type="button"
                              className="action-chip"
                              onClick={() => {
                                setSelectedCarForPromotion(car);
                                setShowPromotionDialog(true);
                              }}
                              aria-label="קידום הרכב"
                              title="קידום הרכב"
                            >
                              <span className="chip-emoji" aria-hidden="true">📈</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="action-chip"
                            onClick={() => navigate(`/yard/cars/edit/${car.id}`)}
                            aria-label="עריכת הרכב"
                            title="עריכת הרכב"
                          >
                            <span className="chip-emoji" aria-hidden="true">✏️</span>
                          </button>
                          <button
                            type="button"
                            className="action-chip"
                            onClick={() => handleRowGovSync(car)}
                            disabled={!car.licensePlatePartial || !!govSyncRowId}
                            aria-label="עדכן משרד התחבורה"
                            title="עדכן משרד התחבורה"
                          >
                            {govSyncRowId === car.id ? (
                              govSyncRowFeedback ? (
                                <span className="chip-emoji" aria-hidden="true">{govSyncRowFeedback === 'ok' ? '✅' : '⚠️'}</span>
                              ) : (
                                <span className="chip-emoji" aria-hidden="true">⏳</span>
                              )
                            ) : (
                              <span className="chip-emoji" aria-hidden="true">🚗✏️</span>
                            )}
                          </button>
                          {enableAdminGovDebugger && (
                            <button
                              type="button"
                              className="action-chip"
                              onClick={() => debugGovSync(car)}
                              disabled={govDebugLoading}
                              aria-label="GOV DEBUGGER"
                              title="GOV DEBUGGER – CORS/OPTIONS/POST diagnostics"
                            >
                              <span className="chip-emoji" aria-hidden="true">🔧</span>
                              <span style={{ marginRight: '2px' }}>DEBUGGER</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Yard Car Images Dialog */}
        {showImagesDialog && selectedCarForImages && firebaseUser && (
          <YardCarImagesDialog
            open={showImagesDialog}
            yardId={firebaseUser.uid}
            carId={selectedCarForImages.id}
            carTitle={`${selectedCarForImages.year || ''} ${selectedCarForImages.brandText || selectedCarForImages.brand || ''} ${selectedCarForImages.modelText || selectedCarForImages.model || ''}`.trim()}
            licensePlatePartial={selectedCarForImages.licensePlatePartial}
            initialImageCount={selectedCarForImages.imageCount || 0}
            onClose={() => {
              setShowImagesDialog(false);
              setSelectedCarForImages(null);
            }}
            onImagesUpdated={(newCount) => {
              // Update the car's image count in local state
              setAllCars((prevCars) =>
                prevCars.map((car) =>
                  car.id === selectedCarForImages.id
                    ? { ...car, imageCount: newCount }
                    : car
                )
              );
            }}
          />
        )}

        {/* Yard Car Promotion Dialog */}
        {showPromotionDialog && selectedCarForPromotion && (
          <YardCarPromotionDialog
            isOpen={showPromotionDialog}
            onClose={() => {
              setShowPromotionDialog(false);
              setSelectedCarForPromotion(null);
            }}
            car={selectedCarForPromotion}
            onPromotionApplied={async () => {
              // Reload cars to refresh data
              try {
                const loadedCars = await fetchYardCarsForUser();
                setAllCars(loadedCars);
              } catch (err) {
                console.error('Error reloading cars after promotion:', err);
              }
            }}
          />
        )}

        {/* Sold Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showSoldDialog}
          title="אישור מכירה"
          message="האם אתה בטוח שהרכב נמכר? פעולה זו תמחק לצמיתות את כל התמונות מהשרת והרכב יוסר מהרשימה הפעילה."
          confirmLabel="כן, נמכר"
          cancelLabel="ביטול"
          onConfirm={async () => {
            if (!selectedCarForSold) return;
            
            setIsMarkingSold(true);
            try {
              await markYardCarSold(selectedCarForSold.id);
              
              // Reload cars to remove sold car from list
              const loadedCars = await fetchYardCarsForUser();
              setAllCars(loadedCars);
              
              setShowSoldDialog(false);
              setSelectedCarForSold(null);
              
              // Show success message (you can add a toast here if needed)
              alert('הרכב סומן כנמכר בהצלחה');
            } catch (err: any) {
              console.error('Error marking car as sold:', err);
              alert('שגיאה בסימון הרכב כנמכר: ' + (err.message || 'שגיאה לא ידועה'));
            } finally {
              setIsMarkingSold(false);
            }
          }}
          onCancel={() => {
            setShowSoldDialog(false);
            setSelectedCarForSold(null);
          }}
          isProcessing={isMarkingSold}
        />

        {/* GOV DEBUGGER modal – CORS/OPTIONS/POST diagnostic (admin toggle only) */}
        {showGovDebugDialog && govDebugCar && (
          <div
            className="car-preview-modal-backdrop"
            onClick={() => {
              if (!govDebugLoading) {
                setShowGovDebugDialog(false);
                setGovDebugCar(null);
                setGovDebugResult(null);
              }
            }}
          >
            <div
              className="car-preview-modal"
              style={{ maxWidth: '560px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="car-preview-modal-header">
                <h2 className="car-preview-modal-title">
                  GOV DEBUGGER – {(govDebugCar.licensePlatePartial ?? '').toString().replace(/\D/g, '') || '—'}
                </h2>
                <button
                  type="button"
                  className="car-preview-modal-close"
                  onClick={() => {
                    if (!govDebugLoading) {
                      setShowGovDebugDialog(false);
                      setGovDebugCar(null);
                      setGovDebugResult(null);
                    }
                  }}
                  disabled={govDebugLoading}
                  aria-label="סגור"
                >
                  ✕
                </button>
              </div>
              <div className="car-preview-modal-body">
                {govDebugLoading ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', marginBottom: '0.5rem' }}>⏳</span>
                    <p style={{ margin: 0 }}>מריץ סנכרון אמין (ענן + CKAN)...</p>
                  </div>
                ) : govDebugResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
                    <section>
                      <strong>Request</strong>
                      <pre style={{ margin: '0.25rem 0 0', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {`url: ${govDebugResult.request.url}\norigin: ${govDebugResult.request.origin}\nplateDigits: ${govDebugResult.request.plateDigits}\ncarId: ${govDebugResult.request.carId}`}
                      </pre>
                    </section>
                    <section>
                      <strong>Token</strong>
                      <p style={{ margin: '0.25rem 0 0' }}>
                        hasToken: {String(govDebugResult.token.hasToken)}, tokenLength: {govDebugResult.token.tokenLength}
                      </p>
                    </section>
                    <section>
                      <strong>Result</strong>
                      <p style={{ margin: '0.25rem 0 0' }}>
                        source: <code>{govDebugResult.source}</code>, ok: {String(govDebugResult.ok)}
                        {govDebugResult.reason != null && `, reason: ${govDebugResult.reason}`}
                        {govDebugResult.error != null && `, error: ${govDebugResult.error}`}
                      </p>
                    </section>
                    {govDebugResult.mapped != null && (
                      <section>
                        <strong>Mapped (GOV)</strong>
                        <pre style={{ margin: '0.25rem 0 0', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                          {JSON.stringify(govDebugResult.mapped, null, 2)}
                        </pre>
                      </section>
                    )}
                    {govDebugResult.raw != null && (
                      <section>
                        <strong>Raw</strong>
                        <pre style={{ margin: '0.25rem 0 0', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', fontSize: '0.8rem' }}>
                          {typeof govDebugResult.raw === 'string'
                            ? govDebugResult.raw
                            : JSON.stringify(govDebugResult.raw, null, 2)}
                        </pre>
                      </section>
                    )}
                  </div>
                ) : null}
              </div>
              {govDebugResult && (
                <div className="car-preview-modal-footer" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const json = JSON.stringify(govDebugResult, null, 2);
                      navigator.clipboard.writeText(json).then(
                        () => alert('הועתק ללוח'),
                        () => console.warn('Copy failed')
                      );
                    }}
                  >
                    Copy JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setShowGovDebugDialog(false);
                      setGovDebugCar(null);
                      setGovDebugResult(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Car Preview Modal - Enhanced with Image Gallery */}
        {showPreviewModal && previewCar && (
          <div 
            className="car-preview-modal-backdrop"
            onClick={closeCarPreview}
          >
            <div 
              className="car-preview-modal car-preview-modal-wide"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="car-preview-modal-header">
                <h2 className="car-preview-modal-title">
                  {previewCar.brandText || previewCar.brand || ''} {previewCar.modelText || previewCar.model || ''} {previewCar.year || ''}
                </h2>
                <button
                  type="button"
                  className="car-preview-modal-close"
                  onClick={closeCarPreview}
                  aria-label="סגור"
                >
                  ✕
                </button>
              </div>
              
              <div className="car-preview-modal-body">
                {/* Image Gallery */}
                <div className="car-preview-gallery-section">
                  {loadingPreviewImages ? (
                    <div className="car-preview-gallery-loading">
                      <div className="car-preview-gallery-skeleton" />
                      <span>טוען תמונות...</span>
                    </div>
                  ) : (
                    <CarImageGallery
                      imageUrls={previewImageUrls}
                      mainImageUrl={previewMainImageUrl}
                      altText={`${previewCar.brandText || ''} ${previewCar.modelText || ''}`}
                      className="car-preview-gallery"
                      noImagesText="אין תמונות לרכב זה"
                    />
                  )}
                </div>

                {/* Basic Details Section */}
                <div className="car-preview-section">
                  <h3 className="car-preview-section-title">פרטים בסיסיים</h3>
                  <div className="car-preview-details car-preview-details-grid">
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">מחיר:</span>
                      <span className="car-preview-detail-value car-preview-price">
                        {previewCar.price ? `₪${previewCar.price.toLocaleString()}` : '-'}
                      </span>
                    </div>
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">שנה:</span>
                      <span className="car-preview-detail-value">{previewCar.year || '-'}</span>
                    </div>
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">קילומטראז':</span>
                      <span className="car-preview-detail-value">
                        {previewCar.mileageKm ? `${previewCar.mileageKm.toLocaleString()} ק"מ` : '-'}
                      </span>
                    </div>
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">עיר:</span>
                      <span className="car-preview-detail-value">{previewCar.city || '-'}</span>
                    </div>
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">סטטוס:</span>
                      <span className={`status-badge ${getStatusClass(previewCar.publicationStatus)}`}>
                        {getStatusLabel(previewCar.publicationStatus)}
                      </span>
                    </div>
                    <div className="car-preview-detail-row">
                      <span className="car-preview-detail-label">תמונות:</span>
                      <span className="car-preview-detail-value">
                        {previewImageUrls.length > 0 ? previewImageUrls.length : previewCar.imageCount || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Technical Details Section - show only if has data */}
                {(previewCar.gearboxType || previewCar.fuelType || previewCar.handCount || 
                  previewCar.color || previewCar.engineDisplacementCc || previewCar.licensePlatePartial) && (
                  <div className="car-preview-section">
                    <h3 className="car-preview-section-title">פרטים טכניים</h3>
                    <div className="car-preview-details car-preview-details-grid">
                      {previewCar.gearboxType && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">תיבת הילוכים:</span>
                          <span className="car-preview-detail-value">{previewCar.gearboxType}</span>
                        </div>
                      )}
                      {previewCar.fuelType && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">סוג דלק:</span>
                          <span className="car-preview-detail-value">{previewCar.fuelType}</span>
                        </div>
                      )}
                      {previewCar.handCount && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">יד:</span>
                          <span className="car-preview-detail-value">{previewCar.handCount}</span>
                        </div>
                      )}
                      {previewCar.color && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">צבע:</span>
                          <span className="car-preview-detail-value">{previewCar.color}</span>
                        </div>
                      )}
                      {previewCar.engineDisplacementCc && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">נפח מנוע:</span>
                          <span className="car-preview-detail-value">{previewCar.engineDisplacementCc.toLocaleString()} סמ"ק</span>
                        </div>
                      )}
                      {previewCar.licensePlatePartial && (
                        <div className="car-preview-detail-row">
                          <span className="car-preview-detail-label">מספר רכב:</span>
                          <span className="car-preview-detail-value car-preview-ltr">{previewCar.licensePlatePartial}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes Section */}
                {previewCar.notes && (
                  <div className="car-preview-section">
                    <h3 className="car-preview-section-title">הערות</h3>
                    <div className="car-preview-notes-content">
                      <p>{previewCar.notes}</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="car-preview-modal-footer">
                {previewCar.publicCarId && (
                  <a
                    href={`/cars/${previewCar.publicCarId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                  >
                    🔗 הצג בעמוד רכב
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    closeCarPreview();
                    navigate(`/yard/cars/edit/${previewCar.id}`);
                  }}
                >
                  ✏️ עריכה
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeCarPreview}
                >
                  סגור
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
