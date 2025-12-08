/**
 * YardSmartPublishPage - Smart Promotion / פרסום חכם page for yard users
 *
 * Features:
 * - Manage car publication status (DRAFT / HIDDEN / PUBLISHED)
 * - Batch status updates
 * - Facebook share button for published cars (uses shareUtils.ts)
 *
 * Facebook share: For PUBLISHED cars, a "פרסום לפייסבוק" button opens the
 * Facebook share dialog with the car's public URL (buildPublicCarUrl from shareUtils).
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardCarsForUser, type YardCar } from '../api/yardFleetApi';
import {
  updateCarPublicationStatus,
  batchUpdateCarPublicationStatus,
  fetchCarsByStatus,
  type CarPublicationStatus,
} from '../api/yardPublishApi';
import { buildPublicCarUrl, openFacebookShareDialog } from '../utils/shareUtils';
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
    const publicUrl = buildPublicCarUrl(car.id);

    // Open Facebook share dialog
    openFacebookShareDialog({
      url: publicUrl,
      title: title || 'רכב למכירה',
      description,
    });
  };

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
                          <button
                            type="button"
                            className="btn-facebook-share"
                            onClick={() => handleFacebookShare(car)}
                            title="פרסום לפייסבוק"
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
                            <span>פרסום לפייסבוק</span>
                          </button>
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
      </div>
    </div>
  );
}
