/**
 * YardSmartPublishPage - Smart Promotion / פרסום חכם page for yard users
 *
 * Features:
 * - Manage car publication status (DRAFT / HIDDEN / PUBLISHED)
 * - Batch status updates
 * - Facebook share button for published cars (uses shareUtils.ts)
 * - Facebook post text generator with copy-to-clipboard
 *
 * Facebook share: For PUBLISHED cars, a "פרסום לפייסבוק" button opens the
 * Facebook share dialog with the car's public URL (buildPublicYardCarUrl from shareUtils).
 *
 * Facebook post card: Shows a ready-to-use Hebrew Facebook post text with:
 * - Copy text button (copies to clipboard)
 * - Open Facebook button (opens sharer.php with the car URL)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardCarsForUser, resolvePublicCarIdForCarSale, type YardCar } from '../api/yardFleetApi';
import {
  updateCarPublicationStatus,
  type CarPublicationStatus,
} from '../api/yardPublishApi';
import { bulkUpdateCarStatus } from '../api/yardBulkStatusApi';
import { buildPublicYardCarUrl, openFacebookShareDialog } from '../utils/shareUtils';
import { buildFacebookPostText, type FacebookPostContext } from '../utils/facebookPostHelper';
import { verifyPublicCarExists } from '../api/carsApi';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { markYardCarSold } from '../api/yardSoldApi';
import {
  copyImageUrlToClipboard,
  copyCarMarketingImageToClipboard,
} from '../utils/imageClipboardHelper';
import { copyCarSpecImageToClipboard, type CarSpecImageOptions } from '../utils/carSpecImageClipboard';
import YardCarImagesDialog from '../components/yard/YardCarImagesDialog';
import YardPageHeader from '../components/yard/YardPageHeader';
import './YardSmartPublishPage.css';

export default function YardSmartPublishPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [allCars, setAllCars] = useState<YardCar[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<CarPublicationStatus, number>>({
    DRAFT: 0,
    HIDDEN: 0,
    PUBLISHED: 0,
  });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingBatchAction, setPendingBatchAction] = useState<{
    from: CarPublicationStatus;
    to: CarPublicationStatus;
  } | null>(null);
  const [bulkHiddenTarget, setBulkHiddenTarget] = useState<CarPublicationStatus | null>(null);
  const [bulkDraftTarget, setBulkDraftTarget] = useState<CarPublicationStatus | null>(null);
  const [bulkPublishedTarget, setBulkPublishedTarget] = useState<CarPublicationStatus | null>(null);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  
  // Images dialog state
  const [showImagesDialog, setShowImagesDialog] = useState(false);
  const [selectedCarForImages, setSelectedCarForImages] = useState<YardCar | null>(null);
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarPublicationStatus | 'ALL'>('ALL');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  // Facebook post card state
  const [facebookPostCar, setFacebookPostCar] = useState<YardCar | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Sold confirmation dialog state
  const [showSoldDialog, setShowSoldDialog] = useState(false);
  const [selectedCarForSold, setSelectedCarForSold] = useState<YardCar | null>(null);
  const [isMarkingSold, setIsMarkingSold] = useState(false);
  
  // Bulk progress state
  type BulkProgress = {
    total: number;
    done: number;
    updated: number;
    errors: number;
    from: CarPublicationStatus;
    to: CarPublicationStatus;
  };
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  
  // Unified busy flag
  const isBusy = isProcessing || isBulkMoving || isMarkingSold || Boolean(bulkProgress);

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load cars on mount
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;

      setIsLoading(true);
      setError(null);
      try {
        const loadedCars = await fetchYardCarsForUser();
        setAllCars(loadedCars);

        // Calculate status counts (exclude SOLD cars)
        const counts: Record<CarPublicationStatus, number> = {
          DRAFT: 0,
          HIDDEN: 0,
          PUBLISHED: 0,
        };
        loadedCars.forEach((car) => {
          if (car.saleStatus !== 'SOLD') {
          const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
          if (status in counts) {
            counts[status]++;
            }
          }
        });
        setStatusCounts(counts);
      } catch (err: any) {
        console.error('Error loading yard cars:', err);
        setError('שגיאה בטעינת צי הרכב');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  const handleStatusChange = async (carId: string, newStatus: CarPublicationStatus | 'SOLD') => {
    // Special handling for SOLD status - show confirmation dialog
    if (newStatus === 'SOLD') {
      const car = allCars.find((c) => c.id === carId);
      if (car) {
        setSelectedCarForSold(car);
        setShowSoldDialog(true);
        // Revert dropdown to previous status (will be updated after confirmation)
        const selectElement = document.querySelector(`select[data-car-id="${carId}"]`) as HTMLSelectElement;
        if (selectElement) {
          selectElement.value = car.publicationStatus || 'DRAFT';
        }
      }
      return;
    }

    // Normal status change for publication statuses
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      await updateCarPublicationStatus(carId, newStatus as CarPublicationStatus);

      // Update local state
      setAllCars((prevCars) =>
        prevCars.map((car) =>
          car.id === carId ? { ...car, publicationStatus: newStatus as CarPublicationStatus } : car
        )
      );

      // Update counts
      const car = allCars.find((c) => c.id === carId);
      if (car) {
        const oldStatus = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
        setStatusCounts((prev) => ({
          ...prev,
          [oldStatus]: Math.max(0, prev[oldStatus] - 1),
          [newStatus as CarPublicationStatus]: prev[newStatus as CarPublicationStatus] + 1,
        }));
      }

      showToast('✅ סטטוס הרכב עודכן בהצלחה');
    } catch (err: any) {
      console.error('[YardSmartPublish] Error updating car status:', {
        carId,
        newStatus,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        fullError: err,
      });
      // Only show toast for action errors, not banner
      showToast(`❌ שגיאה בעדכון סטטוס הרכב: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchAction = async (from: CarPublicationStatus, to: CarPublicationStatus) => {
    setPendingBatchAction({ from, to });
    setShowConfirmDialog(true);
  };


  const confirmBatchAction = async () => {
    if (!pendingBatchAction) return;
    if (!firebaseUser) {
      showToast("יש להתחבר מחדש");
      return;
    }

    const startTime = import.meta.env.MODE !== 'production' ? Date.now() : 0;
    const { from, to } = pendingBatchAction;
    
    // Build IDs from local state (no server fetch)
    const carIds = allCars
      .filter(c => c.saleStatus !== 'SOLD' && ((c.publicationStatus || 'DRAFT') as CarPublicationStatus) === from)
      .map(c => c.id);

    if (carIds.length === 0) {
      showToast('לא נמצאו רכבים במצב זה');
      setShowConfirmDialog(false);
      setPendingBatchAction(null);
      return;
    }

    // Initialize progress state
    setBulkProgress({ total: carIds.length, done: 0, updated: 0, errors: 0, from, to });
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setShowConfirmDialog(false);

    try {
      if (import.meta.env.MODE !== 'production') {
        console.log(`[YardSmartPublishPage] Starting bulk update: ${carIds.length} cars from ${from} to ${to}`);
      }

      // Use efficient batch write API with progress callback
      const stats = await bulkUpdateCarStatus(firebaseUser.uid, carIds, to, {
        batchSize: carIds.length <= 60 ? 1 : 25,
        runBackfill: false,
        onChunkCommitted: (chunkIds, chunkUpdatedCount) => {
          // Update counts by chunkUpdatedCount
          setStatusCounts(prev => ({
            ...prev,
            [from]: Math.max(0, prev[from] - chunkUpdatedCount),
            [to]: prev[to] + chunkUpdatedCount,
          }));
          
          // Optimistic move cars
          const chunkSet = new Set(chunkIds);
          setAllCars(prev => prev.map(c => {
            if (chunkSet.has(c.id) && ((c.publicationStatus || 'DRAFT') as CarPublicationStatus) === from) {
              return { ...c, publicationStatus: to };
            }
            return c;
          }));
        },
        onProgress: (p) => {
          setBulkProgress(prev => prev ? ({ ...prev, ...p, from, to }) : prev);
        },
      });

      if (import.meta.env.MODE !== 'production') {
        const duration = Date.now() - startTime;
        console.log(`[YardSmartPublishPage] Bulk update completed in ${duration}ms:`, stats);
      }

      // Final toast
      if (stats.errors > 0) {
        showToast(`הסתיים עם שגיאות: ${stats.errors}/${stats.total}`);
      } else {
        showToast(`✅ עודכנו ${stats.updated} רכבים בהצלחה`);
      }

      // Note: Server-side trigger handles publicCars projection automatically
      // No need to call rebuildPublicCarsForYard here
    } catch (err: any) {
      console.error('[YardSmartPublishPage] Error batch updating car status:', err);
      showToast(`❌ שגיאה בעדכון קבוצתי: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setIsProcessing(false);
      setPendingBatchAction(null);
      setBulkProgress(null);
    }
  };

  /**
   * Handle bulk move for currently visible cars in a tab
   */
  const handleBulkMoveVisibleCars = async (fromStatus: CarPublicationStatus, toStatus: CarPublicationStatus) => {
    if (!firebaseUser) return;

    // Get car IDs from currently visible/filtered cars
    const visibleCarIds = cars
      .filter((car) => ((car.publicationStatus || 'DRAFT') as CarPublicationStatus) === fromStatus)
      .map((car) => car.id);

    if (visibleCarIds.length === 0) {
      showToast('אין רכבים לביצוע פעולה');
      return;
    }

    // Initialize progress state
    setBulkProgress({ total: visibleCarIds.length, done: 0, updated: 0, errors: 0, from: fromStatus, to: toStatus });
    setIsBulkMoving(true);
    setError(null);
    setSuccess(null);

    try {
      const startTime = import.meta.env.MODE !== 'production' ? Date.now() : 0;

      if (import.meta.env.MODE !== 'production') {
        console.log(`[YardSmartPublishPage] Starting bulk move: ${visibleCarIds.length} visible cars from ${fromStatus} to ${toStatus}`);
      }

      // Use efficient batch write API with progress callback
      const stats = await bulkUpdateCarStatus(firebaseUser.uid, visibleCarIds, toStatus, {
        batchSize: visibleCarIds.length <= 60 ? 1 : 25,
        runBackfill: false,
        onChunkCommitted: (chunkIds, chunkUpdatedCount) => {
          // Update counts by chunkUpdatedCount
          setStatusCounts(prev => ({
            ...prev,
            [fromStatus]: Math.max(0, prev[fromStatus] - chunkUpdatedCount),
            [toStatus]: prev[toStatus] + chunkUpdatedCount,
          }));
          
          // Optimistic move cars
          const chunkSet = new Set(chunkIds);
          setAllCars(prev => prev.map(c => {
            if (chunkSet.has(c.id) && ((c.publicationStatus || 'DRAFT') as CarPublicationStatus) === fromStatus) {
              return { ...c, publicationStatus: toStatus };
            }
            return c;
          }));
        },
        onProgress: (p) => {
          setBulkProgress(prev => prev ? ({ ...prev, ...p, from: fromStatus, to: toStatus }) : prev);
        },
      });

      if (import.meta.env.MODE !== 'production') {
        const duration = Date.now() - startTime;
        console.log(`[YardSmartPublishPage] Bulk move completed in ${duration}ms:`, stats);
      }

      // Final toast
      if (stats.errors > 0) {
        showToast(`הסתיים עם שגיאות: ${stats.errors}/${stats.total}`);
      } else {
        showToast(`✅ עודכנו ${stats.updated} רכבים בהצלחה`);
      }

      // Reset dropdown
      if (fromStatus === 'HIDDEN') {
        setBulkHiddenTarget(null);
      } else if (fromStatus === 'DRAFT') {
        setBulkDraftTarget(null);
      }
    } catch (err: any) {
      console.error('[YardSmartPublishPage] Error bulk moving visible cars:', err);
      showToast(`❌ שגיאה בעדכון קבוצתי: ${err.message || 'שגיאה לא ידועה'}`);
    } finally {
      setIsBulkMoving(false);
      setBulkProgress(null);
    }
  };

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Apply filters
  const cars = useMemo(() => {
    let filtered = [...allCars];

    // Filter out SOLD cars from active inventory
    filtered = filtered.filter((car) => car.saleStatus !== 'SOLD');

    // Apply text search
    if (debouncedSearchText) {
      const searchText = debouncedSearchText.toLowerCase();
      filtered = filtered.filter((car) => {
        const searchableText = [
          car.brandText,
          car.modelText,
          car.licensePlatePartial,
          car.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(searchText);
      });
    }

    // Apply status filter (treat undefined as DRAFT)
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((car) => ((car.publicationStatus || 'DRAFT') as CarPublicationStatus) === statusFilter);
    }

    return filtered;
  }, [allCars, debouncedSearchText, statusFilter]);


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

  /**
   * Generate Facebook post text for a car.
   *
   * @param car - The YardCar to generate text for
   * @param publicUrl - The verified public URL to include in the post.
   *                    If not provided, falls back to building URL from car.publicCarId || car.id.
   */
  const generateFacebookPostText = useCallback(
    (car: YardCar, publicUrl?: string): string => {
      // Use provided publicUrl, or fallback to building from available IDs
      const effectiveUrl = publicUrl || buildPublicYardCarUrl(car.publicCarId || car.id);

      // Yard name can come from various fields depending on how it was set up
      const profileAny = userProfile as Record<string, unknown> | null;
      const yardName = (profileAny?.yardName as string) || 
                       (profileAny?.displayName as string) || 
                       userProfile?.fullName;
      const contactPhone = userProfile?.phone;

      const ctx: FacebookPostContext = {
        car: {
          brandText: car.brandText || car.brand,
          modelText: car.modelText || car.model,
          year: car.year,
          price: car.price || car.salePrice,
          mileageKm: car.mileageKm,
          gearboxType: car.gearboxType,
          fuelType: car.fuelType,
          handCount: car.handCount,
          city: car.city,
          color: car.color,
          engineDisplacementCc: car.engineDisplacementCc,
          notes: car.notes,
        },
        yard: yardName ? { yardName } : null,
        contactPhone: contactPhone || undefined,
        websiteUrl: effectiveUrl,
      };

      return buildFacebookPostText(ctx);
    },
    [userProfile]
  );

  /**
   * Show toast message with auto-dismiss
   */
  const showToast = useCallback((message: string, duration = 4000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), duration);
  }, []);

  /**
   * Get the effective publicCars ID for a YardCar.
   *
   * Strategy:
   *   1. If car.publicCarId is present → verify it exists in Firestore, then use it.
   *   2. If verification fails → fall back to resolvePublicCarIdForCarSale(car.id).
   *   3. If no publicCarId initially → query Firestore via resolvePublicCarIdForCarSale(car.id).
   *   4. Optionally verify the resolved ID as well for extra safety.
   *
   * This ensures that we never generate a /cars/:id URL for a non-existent publicCars document.
   */
  const getEffectivePublicCarId = useCallback(
    async (car: YardCar): Promise<string | null> => {
      // Fast path: use existing publicCarId if available, but verify it first
      if (car.publicCarId) {
        const exists = await verifyPublicCarExists(car.publicCarId);
        if (exists) {
          console.log('[YardSmartPublish] Using verified publicCarId for share', {
            carSaleId: car.id,
            publicCarId: car.publicCarId,
            brand: car.brandText || car.brand,
            model: car.modelText || car.model,
          });
          return car.publicCarId;
        } else {
          // Stale/invalid publicCarId - log warning and fall back to resolution
          console.warn('[YardSmartPublish] Stale/invalid publicCarId, falling back to resolution', {
            carSaleId: car.id,
            stalePublicCarId: car.publicCarId,
            brand: car.brandText || car.brand,
            model: car.modelText || car.model,
            licensePlatePartial: car.licensePlatePartial,
          });
        }
      }

      // Slow path: resolve via Firestore query
      try {
        const resolvedId = await resolvePublicCarIdForCarSale(car.id);
        if (resolvedId) {
          // Optionally verify the resolved ID as well
          const verified = await verifyPublicCarExists(resolvedId);
          if (verified) {
            console.log('[YardSmartPublish] Resolved and verified publicCarId via Firestore', {
              carSaleId: car.id,
              publicCarId: resolvedId,
            });
            return resolvedId;
          } else {
            console.warn('[YardSmartPublish] Resolved publicCarId does not exist in Firestore', {
              carSaleId: car.id,
              resolvedId,
            });
            return null;
          }
        } else {
          console.warn(
            '[YardSmartPublish] Unable to resolve publicCarId for carSaleId',
            {
              carSaleId: car.id,
              brand: car.brandText || car.brand,
              model: car.modelText || car.model,
              licensePlatePartial: car.licensePlatePartial,
            }
          );
        }
        return null;
      } catch (error) {
        console.error(
          '[YardSmartPublish] Error resolving publicCarId for carSaleId',
          {
            carSaleId: car.id,
            brand: car.brandText || car.brand,
            model: car.modelText || car.model,
            error,
          }
        );
        return null;
      }
    },
    []
  );

  /**
   * Copy text to clipboard using Clipboard API.
   * Uses getEffectivePublicCarId to ensure the URL in the text is valid.
   *
   * @param car - The YardCar to generate text for
   * @param preResolvedPublicCarId - Optional pre-resolved publicCarId (skips resolver call)
   */
  const handleCopyPostText = useCallback(
    async (car: YardCar, preResolvedPublicCarId?: string | null) => {
      // Use pre-resolved ID if provided, otherwise resolve it
      const publicCarId = preResolvedPublicCarId ?? await getEffectivePublicCarId(car);
      
      // Generate post text with verified URL (or fallback if resolution failed)
      const publicUrl = publicCarId ? buildPublicYardCarUrl(publicCarId) : undefined;
      const postText = generateFacebookPostText(car, publicUrl);

      try {
        await navigator.clipboard.writeText(postText);
        if (publicCarId) {
          showToast('הטקסט לפייסבוק הועתק ללוח. אפשר להדביק בפייסבוק 📋');
        } else {
          showToast('⚠️ הטקסט הועתק, אך הלינק עלול לא לעבוד (רכב לא מפורסם)');
        }
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        showToast('לא הצלחנו להעתיק ללוח. נסה להעתיק ידנית.');
        // The textarea is already visible so user can copy manually
      }
    },
    [generateFacebookPostText, getEffectivePublicCarId, showToast]
  );

  /**
   * Handle Facebook share for a published car
   * Opens Facebook share dialog with the car's public URL
   *
   * Uses getEffectivePublicCarId to ensure we have a valid, verified publicCars ID
   * before generating the share URL.
   */
  const handleFacebookShare = useCallback(
    async (car: YardCar) => {
      // Resolve the effective publicCarId (with Firestore fallback if needed)
      const publicCarId = await getEffectivePublicCarId(car);

      if (!publicCarId) {
        showToast('לא נמצא לינק ציבורי לרכב הזה. ודא שהרכב פורסם לציבור.');
        return;
      }

      // Build car title from brand + model
      const title = [car.brandText || car.brand, car.modelText || car.model]
        .filter(Boolean)
        .join(' ');

      // Build description with price if available
      const description = car.price
        ? `₪${car.price.toLocaleString()} · רכב למכירה ב-CarExpert`
        : 'רכב למכירה ב-CarExpert';

      // Get public URL using the verified publicCarId
      const publicUrl = buildPublicYardCarUrl(publicCarId);

      // Open Facebook share dialog
      openFacebookShareDialog({
        url: publicUrl,
        title: title || 'רכב למכירה',
        description,
      });
    },
    [getEffectivePublicCarId, showToast]
  );

  /**
   * Open Facebook post card for a specific car
   */
  const handleOpenFacebookPostCard = useCallback((car: YardCar) => {
    // Debug: log car data to help diagnose image detection issues
    console.debug('[FacebookPostDialog] car data', {
      id: car?.id,
      mainImageUrl: car?.mainImageUrl,
      imageCount: car?.imageCount,
      brandText: car?.brandText,
      modelText: car?.modelText,
      fullCar: car,
    });
    setFacebookPostCar(car);
  }, []);

  /**
   * Close the Facebook post card
   */
  const handleCloseFacebookPostCard = useCallback(() => {
    setFacebookPostCar(null);
  }, []);

  /**
   * Open Facebook with the car URL (sharer.php)
   * Uses getEffectivePublicCarId to ensure valid publicCars ID.
   * Fallback: if no publicCarId found, copies text and opens facebook.com
   */
  const handleOpenFacebook = useCallback(
    async (car: YardCar) => {
      // Resolve the effective publicCarId (with Firestore fallback if needed)
      const publicCarId = await getEffectivePublicCarId(car);

      if (publicCarId) {
        const publicUrl = buildPublicYardCarUrl(publicCarId);
        // Open Facebook share dialog with the verified car URL
        openFacebookShareDialog({
          url: publicUrl,
          title: `${car.brandText || car.brand || ''} ${car.modelText || car.model || ''} למכירה`.trim(),
          description: car.price ? `₪${car.price.toLocaleString()}` : undefined,
        });
      } else {
        // Fallback: copy text and open Facebook
        // Note: The copied text will include a URL that may not work, but we warn the user
        showToast('⚠️ לא נמצא לינק ציבורי לרכב. הטקסט הועתק אך הלינק עלול לא לעבוד.');
        await handleCopyPostText(car);
        window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer');
      }
    },
    [getEffectivePublicCarId, handleCopyPostText, showToast]
  );

  /**
   * Get the main image URL for a car (used for image clipboard operations)
   * 
   * Uses normalized mainImageUrl from YardCar (populated by normalizeCarImages in yardFleetApi).
   * No need for complex fallback logic since the API layer already handles normalization.
   */
  const getCarMainImageUrl = useCallback((car: YardCar | null | undefined): string | null => {
    if (!car) return null;
    
    // YardCar.mainImageUrl is already normalized by yardFleetApi using normalizeCarImages()
    // It comes from publicCars.imageUrls[0] or carSales imagesJson fallback
    return car.mainImageUrl ?? null;
  }, []);

  /**
   * Copy the original car image to clipboard
   */
  const handleCopyOriginalImage = useCallback(
    async (car: YardCar) => {
      const imageUrl = getCarMainImageUrl(car);

      if (!imageUrl) {
        showToast('❌ לא נמצאה תמונה לרכב הזה');
        return;
      }

      const result = await copyImageUrlToClipboard(imageUrl);

      switch (result) {
        case 'success':
          showToast('✅ התמונה הועתקה ללוח');
          break;
        case 'unsupported':
          showToast('❌ הדפדפן לא תומך בהעתקת תמונות ללוח. נסה Chrome על מחשב שולחני.');
          break;
        case 'error':
          showToast('❌ אירעה שגיאה בהעתקת התמונה ללוח');
          break;
      }
    },
    [getCarMainImageUrl, showToast]
  );

  /**
   * Copy a branded marketing image to clipboard
   */
  const handleCopyMarketingImage = useCallback(
    async (car: YardCar) => {
      const imageUrl = getCarMainImageUrl(car);

      if (!imageUrl) {
        showToast('❌ לא נמצאה תמונה לרכב הזה');
        return;
      }

      // Build labels from car data
      const title = [
        car.brandText || car.brand,
        car.modelText || car.model,
        car.year,
      ]
        .filter(Boolean)
        .join(' ');

      const priceLabel = car.price ? `₪${car.price.toLocaleString()}` : undefined;

      // Get yard name from user profile
      const profileAny = userProfile as Record<string, unknown> | null;
      const yardName =
        (profileAny?.yardName as string) ||
        (profileAny?.displayName as string) ||
        userProfile?.fullName ||
        undefined;

      const result = await copyCarMarketingImageToClipboard({
        imageUrl,
        title: title || 'רכב למכירה',
        priceLabel,
        yardName,
      });

      switch (result) {
        case 'success':
          showToast('✅ תמונת הפרסום הועתקה ללוח');
          break;
        case 'unsupported':
          showToast('❌ הדפדפן לא תומך בהעתקת תמונות ללוח. נסה Chrome על מחשב שולחני.');
          break;
        case 'error':
          showToast('❌ אירעה שגיאה ביצירת תמונת הפרסום');
          break;
      }
    },
    [getCarMainImageUrl, userProfile, showToast]
  );

  /**
   * Build spec image options from car data
   */
  const buildCarSpecImageOptions = useCallback(
    (car: YardCar): CarSpecImageOptions | null => {
      const imageUrl = getCarMainImageUrl(car);
      if (!imageUrl) return null;

      // Build title
      const title = [
        car.brandText || car.brand,
        car.modelText || car.model,
        car.year,
      ]
        .filter(Boolean)
        .join(' ') || 'רכב למכירה';

      // Build specs list
      const specs: string[] = [];
      if (car.gearboxType) specs.push(`תיבת הילוכים: ${car.gearboxType}`);
      if (car.engineDisplacementCc) specs.push(`נפח מנוע: ${car.engineDisplacementCc.toLocaleString()} סמ״ק`);
      if (car.mileageKm) specs.push(`ק״מ: ${car.mileageKm.toLocaleString('he-IL')}`);
      if (car.handCount) specs.push(`בעלות: יד ${car.handCount}`);
      if (car.color) specs.push(`צבע: ${car.color}`);
      if (car.fuelType) specs.push(`סוג דלק: ${car.fuelType}`);
      if (car.city) specs.push(`מיקום: ${car.city}`);

      // Build price label
      const priceLabel = car.price
        ? `מחיר מבוקש: ₪${car.price.toLocaleString('he-IL')}`
        : undefined;

      // Get yard info from user profile
      const profileAny = userProfile as Record<string, unknown> | null;
      const yardName =
        (profileAny?.yardName as string) ||
        (profileAny?.displayName as string) ||
        userProfile?.fullName ||
        undefined;
      const phone = userProfile?.phone || undefined;

      return {
        imageUrl,
        title,
        specs,
        priceLabel,
        yardName,
        phone,
      };
    },
    [getCarMainImageUrl, userProfile]
  );

  /**
   * Copy a spec card image to clipboard
   */
  const handleCopySpecImage = useCallback(
    async (car: YardCar) => {
      const options = buildCarSpecImageOptions(car);

      if (!options) {
        showToast('❌ לא נמצאה תמונה לרכב הזה');
        return;
      }

      const result = await copyCarSpecImageToClipboard(options);

      switch (result) {
        case 'success':
          showToast('✅ תמונת המפרט הועתקה ללוח');
          break;
        case 'unsupported':
          showToast('❌ הדפדפן לא תומך בהעתקת תמונות ללוח. נסה Chrome על מחשב שולחני.');
          break;
        case 'error':
          showToast('❌ אירעה שגיאה ביצירת תמונת המפרט');
          break;
      }
    },
    [buildCarSpecImageOptions, showToast]
  );

  // Images dialog handlers
  const handleOpenImagesDialog = useCallback((car: YardCar) => {
    setSelectedCarForImages(car);
    setShowImagesDialog(true);
  }, []);

  const handleCloseImagesDialog = useCallback(() => {
    setShowImagesDialog(false);
    setSelectedCarForImages(null);
  }, []);

  const handleImagesUpdated = useCallback((carId: string, newCount: number) => {
    setAllCars((prevCars) =>
      prevCars.map((car) =>
        car.id === carId ? { ...car, imageCount: newCount } : car
      )
    );
  }, []);

  if (isLoading) {
    return (
      <div className="yard-smart-publish-page">
        <div className="loading-container">
          <p>טוען נתוני פרסום...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-smart-publish-page">
      <div className="page-container">
        <YardPageHeader
          title="פרסום חכם"
          actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
          }
        />

        {/* Error banner only for fatal page-load errors, not action-level errors */}
        {error && error.includes('טעינה') && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        {/* Filters */}
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
            </div>
          </div>
        )}

        {/* Status Summary Cards */}
        <div className="status-summary">
          <div className="status-card status-draft">
            <div className="status-card-title">טיוטה</div>
            <div className="status-card-count">{statusCounts.DRAFT}</div>
            {statusCounts.DRAFT > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>העבר הכל ל:</label>
                <select
                  className="filter-select"
                  value={bulkDraftTarget || ''}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target && target !== '' && target !== 'DRAFT') {
                      setBulkDraftTarget(target as CarPublicationStatus);
                      handleBatchAction('DRAFT', target as CarPublicationStatus);
                      setTimeout(() => setBulkDraftTarget(null), 100);
                    }
                  }}
                  disabled={isBusy}
                  style={{ minWidth: '120px', padding: '0.25rem 0.5rem', flex: 1 }}
                >
                  <option value="">בחר יעד...</option>
                  <option value="PUBLISHED">פרסום</option>
                  <option value="HIDDEN">הסתר</option>
                </select>
              </div>
            )}
          </div>
          <div className="status-card status-published">
            <div className="status-card-title">מפורסם</div>
            <div className="status-card-count">{statusCounts.PUBLISHED}</div>
            {statusCounts.PUBLISHED > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>העבר הכל ל:</label>
                <select
                  className="filter-select"
                  value={bulkPublishedTarget || ''}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target && target !== '' && target !== 'PUBLISHED') {
                      setBulkPublishedTarget(target as CarPublicationStatus);
                      handleBatchAction('PUBLISHED', target as CarPublicationStatus);
                      setTimeout(() => setBulkPublishedTarget(null), 100);
                    }
                  }}
                  disabled={isBusy}
                  style={{ minWidth: '120px', padding: '0.25rem 0.5rem', flex: 1 }}
                >
                  <option value="">בחר יעד...</option>
                  <option value="HIDDEN">הסתר</option>
                  <option value="DRAFT">טיוטה</option>
                </select>
              </div>
            )}
          </div>
          <div className="status-card status-hidden">
            <div className="status-card-title">מוסתר</div>
            <div className="status-card-count">{statusCounts.HIDDEN}</div>
            {statusCounts.HIDDEN > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>העבר הכל ל:</label>
                <select
                  className="filter-select"
                  value={bulkHiddenTarget || ''}
                  onChange={(e) => {
                    const target = e.target.value;
                    if (target && target !== '' && target !== 'HIDDEN') {
                      setBulkHiddenTarget(target as CarPublicationStatus);
                      handleBatchAction('HIDDEN', target as CarPublicationStatus);
                      setTimeout(() => setBulkHiddenTarget(null), 100);
                    }
                  }}
                  disabled={isBusy}
                  style={{ minWidth: '120px', padding: '0.25rem 0.5rem', flex: 1 }}
                >
                  <option value="">בחר יעד...</option>
                  <option value="PUBLISHED">פרסום</option>
                  <option value="DRAFT">טיוטה</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar for bulk operations */}
        {bulkProgress && (
          <div className="commit-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} 
              />
            </div>
            <p className="progress-text">
              מעבד... {bulkProgress.done} / {bulkProgress.total}
            </p>
          </div>
        )}

        {/* Cars List */}
        {allCars.length === 0 ? (
          <div className="empty-state">
            <p>אין רכבים במגרש</p>
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
              }}
            >
              נקה פילטרים
            </button>
          </div>
        ) : (
          <div className="cars-list">
            <h2 className="section-title">רכבים במגרש</h2>
            
            {/* Bulk Move Control - Only for DRAFT and HIDDEN tabs */}
            {(statusFilter === 'DRAFT' || statusFilter === 'HIDDEN') && (
              <div className="bulk-move-control" style={{ 
                marginBottom: '1rem', 
                padding: '0.75rem', 
                backgroundColor: '#f5f5f5', 
                borderRadius: '4px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                justifyContent: 'flex-end'
              }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>העבר הכל ל:</label>
                <select
                  className="filter-select"
                  value={statusFilter === 'DRAFT' ? (bulkDraftTarget || '') : (bulkHiddenTarget || '')}
                  onChange={(e) => {
                    const target = e.target.value as CarPublicationStatus | '';
                    if (statusFilter === 'DRAFT') {
                      setBulkDraftTarget(target ? (target as CarPublicationStatus) : null);
                    } else {
                      setBulkHiddenTarget(target ? (target as CarPublicationStatus) : null);
                    }
                  }}
                  disabled={isBusy}
                  style={{ minWidth: '120px', padding: '0.25rem 0.5rem' }}
                >
                  <option value="">בחר יעד...</option>
                  {statusFilter === 'DRAFT' ? (
                    <>
                      <option value="PUBLISHED">פרסום</option>
                      <option value="HIDDEN">מוסתר</option>
                    </>
                  ) : (
                    <>
                      <option value="PUBLISHED">פרסום</option>
                      <option value="DRAFT">טיוטה</option>
                    </>
                  )}
                </select>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => {
                    const target = statusFilter === 'DRAFT' ? bulkDraftTarget : bulkHiddenTarget;
                    if (target) {
                      handleBulkMoveVisibleCars(statusFilter as CarPublicationStatus, target);
                    }
                  }}
                  disabled={
                    isBusy ||
                    !(statusFilter === 'DRAFT' ? bulkDraftTarget : bulkHiddenTarget) ||
                    cars.length === 0
                  }
                >
                  בצע
                </button>
                {cars.length > 0 && (
                  <span style={{ fontSize: '0.875rem', color: '#666' }}>
                    יחול על {cars.length} רכבים
                  </span>
                )}
              </div>
            )}

            <div className="cars-table-container">
              <table className="cars-table">
                <thead>
                  <tr>
                    <th>תמונות</th>
                    <th>דגם</th>
                    <th>שנה</th>
                    <th>מחיר</th>
                    <th>סטטוס נוכחי</th>
                    <th>שינוי סטטוס</th>
                    <th>פרסום</th>
                  </tr>
                </thead>
                <tbody>
                  {cars.map((car) => {
                    const imageCount = car.imageCount || 0;
                    return (
                      <tr key={car.id}>
                        <td>
                          <button
                            type="button"
                            className={`image-count-badge ${imageCount === 0 ? 'no-images' : 'has-images'}`}
                            onClick={() => handleOpenImagesDialog(car)}
                            title="לחץ לעריכת תמונות"
                          >
                            📷 {imageCount}
                          </button>
                        </td>
                        <td>
                          {car.brandText || car.brand || ''} {car.modelText || car.model || ''}
                        </td>
                        <td>{car.year || '-'}</td>
                        <td>{car.price ? `₪${car.price.toLocaleString()}` : '-'}</td>
                      <td>
                        <span className={`status-badge status-${(car.publicationStatus || 'DRAFT').toLowerCase()}`}>
                          {getStatusLabel(car.publicationStatus)}
                        </span>
                      </td>
                      <td>
                        <select
                          className="status-select"
                          data-car-id={car.id}
                          value={car.publicationStatus || 'DRAFT'}
                          onChange={(e) =>
                            handleStatusChange(car.id, e.target.value as CarPublicationStatus | 'SOLD')
                          }
                          disabled={isBusy}
                        >
                          <option value="DRAFT">טיוטה</option>
                          <option value="HIDDEN">מוסתר</option>
                          <option value="PUBLISHED">מפורסם</option>
                          <option value="SOLD">נמכר</option>
                        </select>
                      </td>
                      <td>
                        <div className="car-row-actions">
                        {car.publicationStatus === 'PUBLISHED' && (
                          <div className="publish-actions">
                            <button
                              type="button"
                              className="btn-facebook-share"
                              onClick={() => handleFacebookShare(car)}
                              title="שיתוף מהיר לפייסבוק"
                            >
                              <svg
                                className="facebook-icon"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                width="16"
                                height="16"
                                aria-hidden="true"
                              >
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                              <span>שיתוף</span>
                            </button>
                            <button
                              type="button"
                              className="btn-facebook-post"
                              onClick={() => handleOpenFacebookPostCard(car)}
                              title="צור פוסט לפייסבוק"
                            >
                              <span>📝</span>
                              <span>פוסט</span>
                            </button>
                          </div>
                        )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
              
              // Recalculate counts
              const counts: Record<CarPublicationStatus, number> = {
                DRAFT: 0,
                HIDDEN: 0,
                PUBLISHED: 0,
              };
              loadedCars.forEach((car) => {
                if (car.saleStatus !== 'SOLD') {
                  const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
                  if (status in counts) {
                    counts[status]++;
                  }
                }
              });
              setStatusCounts(counts);
              
              setShowSoldDialog(false);
              setSelectedCarForSold(null);
              showToast('✅ הרכב סומן כנמכר בהצלחה');
            } catch (err: any) {
              console.error('[PublishSync] Error marking car as sold:', err);
              // Only show toast, not banner error
              showToast(`❌ שגיאה בסימון הרכב כנמכר: ${err.message || 'שגיאה לא ידועה'}`);
            } finally {
              setIsMarkingSold(false);
            }
          }}
          onCancel={() => {
            setShowSoldDialog(false);
            setSelectedCarForSold(null);
            // Revert dropdown to previous status
            if (selectedCarForSold) {
              const selectElement = document.querySelector(`select[data-car-id="${selectedCarForSold.id}"]`) as HTMLSelectElement;
              if (selectElement) {
                selectElement.value = selectedCarForSold.publicationStatus || 'DRAFT';
              }
            }
          }}
          isProcessing={isMarkingSold}
        />

        {/* Confirmation Dialog */}
        {showConfirmDialog && pendingBatchAction && (
          <div className="modal-overlay" onClick={() => setShowConfirmDialog(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>אישור פעולה קבוצתית</h3>
              <p>
                האם אתה בטוח שברצונך לשנות את סטטוס כל הרכבים מ-"{getStatusLabel(pendingBatchAction.from)}" ל-"{getStatusLabel(pendingBatchAction.to)}"?
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setPendingBatchAction(null);
                  }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmBatchAction}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'מעבד...' : 'אישור'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Facebook Post Card Modal */}
        {facebookPostCar && (
          <div className="modal-overlay" onClick={handleCloseFacebookPostCard}>
            <div
              className="modal-content facebook-post-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="facebook-post-header">
                <h3>
                  <span className="facebook-icon-emoji">📱</span>
                  פוסט לפייסבוק
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseFacebookPostCard}
                  aria-label="סגור"
                >
                  ✕
                </button>
              </div>

              <div className="facebook-post-car-title">
                {facebookPostCar.brandText || facebookPostCar.brand}{' '}
                {facebookPostCar.modelText || facebookPostCar.model}{' '}
                {facebookPostCar.year || ''}
              </div>

              <p className="facebook-post-description">
                יצרנו עבורך טקסט לפוסט. אפשר להעתיק ולהדביק בפייסבוק, או ללחוץ על
                "פתיחת פייסבוק" לשיתוף מהיר.
              </p>

              <textarea
                className="facebook-post-textarea"
                value={generateFacebookPostText(facebookPostCar)}
                readOnly
                dir="rtl"
                rows={14}
                aria-label="טקסט הפוסט לפייסבוק"
              />

              <div className="facebook-post-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleCopyPostText(facebookPostCar)}
                >
                  📋 העתקת טקסט
                </button>
                <button
                  type="button"
                  className="btn btn-facebook"
                  onClick={() => handleOpenFacebook(facebookPostCar)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="18"
                    height="18"
                    aria-hidden="true"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  פתיחת פייסבוק
                </button>
              </div>

              {/* Image copy section */}
              <div className="facebook-post-images-section">
                <h4 className="facebook-post-images-title">📷 העתקת תמונה</h4>
                <p className="facebook-post-images-description">
                  העתק תמונה ללוח והדבק ישירות בפייסבוק או בוואטסאפ
                </p>
                {(() => {
                  // Use the robust getCarMainImageUrl to determine if images are available
                  const hasImagesForClipboard = !!getCarMainImageUrl(facebookPostCar);
                  const noImageTitle = 'אין תמונה לרכב זה';
                  return (
                    <div className="facebook-post-image-actions">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => handleCopyOriginalImage(facebookPostCar)}
                        disabled={!hasImagesForClipboard}
                        title={hasImagesForClipboard ? 'העתק תמונה מקורית' : noImageTitle}
                      >
                        🖼️ העתק תמונה מקורית
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-marketing"
                        onClick={() => handleCopyMarketingImage(facebookPostCar)}
                        disabled={!hasImagesForClipboard}
                        title={hasImagesForClipboard ? 'העתק תמונת פרסום מעוצבת' : noImageTitle}
                      >
                        🎨 העתק תמונת פרסום מעוצבת
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-spec"
                        onClick={() => handleCopySpecImage(facebookPostCar)}
                        disabled={!hasImagesForClipboard}
                        title={hasImagesForClipboard ? 'העתק תמונת מפרט' : noImageTitle}
                      >
                        📋 העתק תמונת מפרט
                      </button>
                    </div>
                  );
                })()}
                {!getCarMainImageUrl(facebookPostCar) && (facebookPostCar.imageCount ?? 0) > 0 && (
                  <p className="facebook-post-images-warning" style={{ color: '#e67e22', marginTop: '8px', fontSize: '0.9em' }}>
                    ⚠️ הרכב מכיל {facebookPostCar.imageCount} תמונות, אך לא הצלחנו לטעון את כתובת התמונה. נסה לרענן את הדף.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toast notification */}
        {toastMessage && (
          <div className="toast-notification" role="alert">
            {toastMessage}
          </div>
        )}

        {/* Yard Car Images Dialog */}
        {showImagesDialog && selectedCarForImages && firebaseUser && (
          <YardCarImagesDialog
            open={showImagesDialog}
            yardId={firebaseUser.uid}
            carId={selectedCarForImages.id}
            carTitle={`${selectedCarForImages.year || ''} ${selectedCarForImages.brandText || selectedCarForImages.brand || ''} ${selectedCarForImages.modelText || selectedCarForImages.model || ''}`.trim()}
            initialImageCount={selectedCarForImages.imageCount || 0}
            onClose={handleCloseImagesDialog}
            onImagesUpdated={(newCount) => {
              handleImagesUpdated(selectedCarForImages.id, newCount);
            }}
          />
        )}
      </div>
    </div>
  );
}
