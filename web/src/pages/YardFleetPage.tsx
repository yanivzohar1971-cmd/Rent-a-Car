import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchYardCarsForUser,
  type YardCar,
  type YardFleetSortField,
  type CarPublicationStatus,
  type ImageFilterMode,
} from '../api/yardFleetApi';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import YardCarPromotionDialog from '../components/YardCarPromotionDialog';
import YardCarImagesDialog from '../components/yard/YardCarImagesDialog';
import CarImageGallery from '../components/cars/CarImageGallery';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { markYardCarSold } from '../api/yardSoldApi';
import { updateCarPublicationStatus } from '../api/yardPublishApi';
import YardPageHeader from '../components/yard/YardPageHeader';
import './YardFleetPage.css';

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
  
  // Filters and sort
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CarPublicationStatus | 'ALL'>('ALL');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');
  const [imageFilter, setImageFilter] = useState<ImageFilterMode>('all');
  const [sortField, setSortField] = useState<YardFleetSortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
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
      } catch (err: any) {
        console.error('Error loading yard cars:', err);
        setError('שגיאה בטעינת צי הרכב');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  // Apply filters and sort
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

    // Apply sorting
    filtered.sort((a, b) => {
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
  }, [allCars, debouncedSearchText, statusFilter, yearFrom, yearTo, imageFilter, sortField, sortDirection]);

  // Calculate status counts for summary cards
  const statusCounts = useMemo(() => {
    const counts = {
      DRAFT: 0,
      PUBLISHED: 0,
      HIDDEN: 0,
    };
    allCars.forEach((car) => {
      const status = (car.publicationStatus || 'DRAFT') as CarPublicationStatus;
      if (status === 'DRAFT') counts.DRAFT++;
      else if (status === 'PUBLISHED') counts.PUBLISHED++;
      else if (status === 'HIDDEN') counts.HIDDEN++;
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
    
    let loadedUrls: string[] = [];
    let loadedMainUrl: string | undefined = undefined;
    
    try {
      // Use publicCarId if available, otherwise fall back to car.id
      const effectiveId = car.publicCarId || car.id;
      
      // Load car data from publicCars collection (same source as public car page)
      const publicCar: Car | null = await fetchCarByIdWithFallback(effectiveId);
      
      if (publicCar) {
        // Use normalized images from publicCars (fetchCarByIdWithFallback already normalizes)
        const urls = publicCar.imageUrls ?? [];
        loadedUrls = urls;
        
        // Set main image URL with proper selection logic
        if (publicCar.mainImageUrl && urls.includes(publicCar.mainImageUrl)) {
          loadedMainUrl = publicCar.mainImageUrl;
        } else if (urls.length > 0) {
          loadedMainUrl = urls[0];
        } else if (publicCar.mainImageUrl) {
          // Use mainImageUrl even if not in urls array (might be standalone)
          loadedMainUrl = publicCar.mainImageUrl;
          loadedUrls = [publicCar.mainImageUrl];
        }
      } else {
        // Public car not found - try to resolve by carSaleId
        console.warn('[YardFleet] Public car not found for preview, trying to resolve:', {
          effectiveId,
          carId: car.id,
        });
        
        // Try resolving publicCarId from carSaleId
        const { resolvePublicCarIdForCarSale } = await import('../api/yardFleetApi');
        const resolvedPublicCarId = await resolvePublicCarIdForCarSale(car.id);
        
        if (resolvedPublicCarId) {
          // Try loading with resolved ID
          const resolvedCar: Car | null = await fetchCarByIdWithFallback(resolvedPublicCarId);
          if (resolvedCar) {
            const urls = resolvedCar.imageUrls ?? [];
            loadedUrls = urls;
            if (resolvedCar.mainImageUrl && urls.includes(resolvedCar.mainImageUrl)) {
              loadedMainUrl = resolvedCar.mainImageUrl;
            } else if (urls.length > 0) {
              loadedMainUrl = urls[0];
            } else if (resolvedCar.mainImageUrl) {
              loadedMainUrl = resolvedCar.mainImageUrl;
              loadedUrls = [resolvedCar.mainImageUrl];
            }
          }
        }
      }
      
      // Final fallback: use mainImageUrl from YardCar if we still have no images
      if (loadedUrls.length === 0 && car.mainImageUrl) {
        loadedUrls = [car.mainImageUrl];
        loadedMainUrl = car.mainImageUrl;
      }
      
      // Update state with loaded images
      setPreviewImageUrls(loadedUrls);
      setPreviewMainImageUrl(loadedMainUrl);
      
    } catch (err) {
      console.error('[YardFleet] Failed to load preview images:', {
        carId: car.id,
        publicCarId: car.publicCarId,
        error: err,
      });
      // Final fallback: use mainImageUrl from YardCar if available
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
                onClick={() => navigate('/yard/sales-history')}
                style={{ marginLeft: '12px' }}
              >
                היסטוריית מכירות
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
                  <th>שנה</th>
                  <th>קילומטראז'</th>
                  <th>מחיר</th>
                  <th>עיר</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
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
                      <td>{car.year || '-'}</td>
                      <td>{car.mileageKm ? `${car.mileageKm.toLocaleString()} ק"מ` : '-'}</td>
                      <td>{car.price ? `₪${car.price.toLocaleString()}` : '-'}</td>
                      <td>{car.city || '-'}</td>
                      <td>
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
                      <td>
                        <div className="car-action-buttons" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                          {/* View button - opens quick preview modal */}
                          {car.publicationStatus === 'PUBLISHED' && (
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => openCarPreview(car)}
                            >
                              צפייה
                            </button>
                          )}
                          {car.publicationStatus === 'PUBLISHED' && (
                            <button
                              type="button"
                              className="btn btn-small btn-primary"
                              onClick={() => {
                                setSelectedCarForPromotion(car);
                                setShowPromotionDialog(true);
                              }}
                            >
                              קדם
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => navigate(`/yard/cars/edit/${car.id}`)}
                          >
                            עריכה
                          </button>
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
