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
import { fetchYardCarsForUser, type YardCar } from '../api/yardFleetApi';
import {
  updateCarPublicationStatus,
  batchUpdateCarPublicationStatus,
  fetchCarsByStatus,
  type CarPublicationStatus,
} from '../api/yardPublishApi';
import { buildPublicYardCarUrl, openFacebookShareDialog } from '../utils/shareUtils';
import { buildFacebookPostText, type FacebookPostContext } from '../utils/facebookPostHelper';
import {
  copyImageUrlToClipboard,
  copyCarMarketingImageToClipboard,
} from '../utils/imageClipboardHelper';
import { copyCarSpecImageToClipboard, type CarSpecImageOptions } from '../utils/carSpecImageClipboard';
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
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarPublicationStatus | 'ALL'>('ALL');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');

  // Facebook post card state
  const [facebookPostCar, setFacebookPostCar] = useState<YardCar | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

        // Calculate status counts
        const counts: Record<CarPublicationStatus, number> = {
          DRAFT: 0,
          HIDDEN: 0,
          PUBLISHED: 0,
        };
        loadedCars.forEach((car) => {
          const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
          if (status in counts) {
            counts[status]++;
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

  const handleStatusChange = async (carId: string, newStatus: CarPublicationStatus) => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      await updateCarPublicationStatus(carId, newStatus);

      // Update local state
      setAllCars((prevCars) =>
        prevCars.map((car) =>
          car.id === carId ? { ...car, publicationStatus: newStatus } : car
        )
      );

      // Update counts
      const car = allCars.find((c) => c.id === carId);
      if (car) {
        const oldStatus = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
        setStatusCounts((prev) => ({
          ...prev,
          [oldStatus]: Math.max(0, prev[oldStatus] - 1),
          [newStatus]: prev[newStatus] + 1,
        }));
      }

      setSuccess('סטטוס הרכב עודכן בהצלחה');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error updating car status:', err);
      setError('שגיאה בעדכון סטטוס הרכב');
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

    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setShowConfirmDialog(false);

    try {
      // Fetch car IDs with the source status
      const carIds = await fetchCarsByStatus(pendingBatchAction.from);

      if (carIds.length === 0) {
        setError('לא נמצאו רכבים במצב זה');
        setIsProcessing(false);
        return;
      }

      // Perform batch update
      await batchUpdateCarPublicationStatus(carIds, pendingBatchAction.to);

      // Reload cars to get updated data
      const loadedCars = await fetchYardCarsForUser();
      setAllCars(loadedCars);

      // Recalculate counts
      const counts: Record<CarPublicationStatus, number> = {
        DRAFT: 0,
        HIDDEN: 0,
        PUBLISHED: 0,
      };
      loadedCars.forEach((car) => {
        const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
        if (status in counts) {
          counts[status]++;
        }
      });
      setStatusCounts(counts);

      setSuccess(`עודכנו ${carIds.length} רכבים בהצלחה`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error batch updating car status:', err);
      setError('שגיאה בעדכון קבוצתי של רכבים');
    } finally {
      setIsProcessing(false);
      setPendingBatchAction(null);
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

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((car) => car.publicationStatus === statusFilter);
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
   * Generate Facebook post text for a car
   */
  const generateFacebookPostText = useCallback(
    (car: YardCar): string => {
      const publicUrl = buildPublicYardCarUrl(car.id);
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
        websiteUrl: publicUrl,
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
   * Copy text to clipboard using Clipboard API
   */
  const handleCopyPostText = useCallback(
    async (car: YardCar) => {
      const postText = generateFacebookPostText(car);

      try {
        await navigator.clipboard.writeText(postText);
        showToast('הטקסט לפייסבוק הועתק ללוח. אפשר להדביק בפייסבוק 📋');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        showToast('לא הצלחנו להעתיק ללוח. נסה להעתיק ידנית.');
        // The textarea is already visible so user can copy manually
      }
    },
    [generateFacebookPostText, showToast]
  );

  /**
   * Handle Facebook share for a published car
   * Opens Facebook share dialog with the car's public URL
   */
  const handleFacebookShare = (car: YardCar) => {
    // Build car title from brand + model
    const title = [car.brandText || car.brand, car.modelText || car.model]
      .filter(Boolean)
      .join(' ');

    // Build description with price if available
    const description = car.price
      ? `₪${car.price.toLocaleString()} · רכב למכירה ב-CarExpert`
      : 'רכב למכירה ב-CarExpert';

    // Get public URL for this car
    const publicUrl = buildPublicYardCarUrl(car.id);

    // Open Facebook share dialog
    openFacebookShareDialog({
      url: publicUrl,
      title: title || 'רכב למכירה',
      description,
    });
  };

  /**
   * Open Facebook post card for a specific car
   */
  const handleOpenFacebookPostCard = useCallback((car: YardCar) => {
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
   * Fallback: if URL can't be built, copies text and opens facebook.com
   */
  const handleOpenFacebook = useCallback(
    async (car: YardCar) => {
      const publicUrl = buildPublicYardCarUrl(car.id);

      if (publicUrl) {
        // Open Facebook share dialog with the car URL
        openFacebookShareDialog({
          url: publicUrl,
          title: `${car.brandText || car.brand || ''} ${car.modelText || car.model || ''} למכירה`.trim(),
          description: car.price ? `₪${car.price.toLocaleString()}` : undefined,
        });
      } else {
        // Fallback: copy text and open Facebook
        await handleCopyPostText(car);
        window.open('https://www.facebook.com/', '_blank', 'noopener,noreferrer');
        showToast('פתחנו את פייסבוק. הטקסט לפוסט כבר הועתק – רק הדבק בפוסט חדש.');
      }
    },
    [handleCopyPostText, showToast]
  );

  /**
   * Get the main image URL for a car (used for image clipboard operations)
   */
  const getCarMainImageUrl = useCallback((car: YardCar): string | null => {
    return car.mainImageUrl || null;
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
        <div className="page-header">
          <h1 className="page-title">פרסום חכם</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {error && (
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
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() => handleBatchAction('DRAFT', 'PUBLISHED')}
                disabled={isProcessing}
              >
                פרסם הכל
              </button>
            )}
          </div>
          <div className="status-card status-published">
            <div className="status-card-title">מפורסם</div>
            <div className="status-card-count">{statusCounts.PUBLISHED}</div>
            {statusCounts.PUBLISHED > 0 && (
              <button
                type="button"
                className="btn btn-small btn-secondary"
                onClick={() => handleBatchAction('PUBLISHED', 'HIDDEN')}
                disabled={isProcessing}
              >
                הסתר הכל
              </button>
            )}
          </div>
          <div className="status-card status-hidden">
            <div className="status-card-title">מוסתר</div>
            <div className="status-card-count">{statusCounts.HIDDEN}</div>
          </div>
        </div>

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
            <div className="cars-table-container">
              <table className="cars-table">
                <thead>
                  <tr>
                    <th>דגם</th>
                    <th>שנה</th>
                    <th>מחיר</th>
                    <th>סטטוס נוכחי</th>
                    <th>שינוי סטטוס</th>
                    <th>פרסום</th>
                  </tr>
                </thead>
                <tbody>
                  {cars.map((car) => (
                    <tr key={car.id}>
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
                          value={car.publicationStatus || 'DRAFT'}
                          onChange={(e) =>
                            handleStatusChange(car.id, e.target.value as CarPublicationStatus)
                          }
                          disabled={isProcessing}
                        >
                          <option value="DRAFT">טיוטה</option>
                          <option value="HIDDEN">מוסתר</option>
                          <option value="PUBLISHED">מפורסם</option>
                        </select>
                      </td>
                      <td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                <div className="facebook-post-image-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleCopyOriginalImage(facebookPostCar)}
                    disabled={!facebookPostCar.mainImageUrl}
                    title={facebookPostCar.mainImageUrl ? 'העתק תמונה מקורית' : 'אין תמונה לרכב זה'}
                  >
                    🖼️ העתק תמונה מקורית
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-marketing"
                    onClick={() => handleCopyMarketingImage(facebookPostCar)}
                    disabled={!facebookPostCar.mainImageUrl}
                    title={facebookPostCar.mainImageUrl ? 'העתק תמונת פרסום מעוצבת' : 'אין תמונה לרכב זה'}
                  >
                    🎨 העתק תמונת פרסום מעוצבת
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-spec"
                    onClick={() => handleCopySpecImage(facebookPostCar)}
                    disabled={!facebookPostCar.mainImageUrl}
                    title={facebookPostCar.mainImageUrl ? 'העתק תמונת מפרט' : 'אין תמונה לרכב זה'}
                  >
                    📋 העתק תמונת מפרט
                  </button>
                </div>
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
      </div>
    </div>
  );
}
