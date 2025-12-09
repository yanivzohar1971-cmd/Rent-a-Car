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
import { listCarImages, type YardCarImage } from '../api/yardImagesApi';
import YardCarPromotionDialog from '../components/YardCarPromotionDialog';
import CarImageGallery from '../components/cars/CarImageGallery';
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
  const [loadingPreviewImages, setLoadingPreviewImages] = useState(false);
  
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

  // Open preview modal and load images
  const openCarPreview = useCallback(async (car: YardCar) => {
    setPreviewCar(car);
    setShowPreviewModal(true);
    setPreviewImageUrls([]);
    
    // Load images in background
    if (firebaseUser?.uid && car.id) {
      setLoadingPreviewImages(true);
      try {
        const images = await listCarImages(firebaseUser.uid, car.id);
        const urls = images.map((img: YardCarImage) => img.originalUrl).filter(Boolean);
        setPreviewImageUrls(urls);
      } catch (err) {
        console.error('Error loading preview images:', err);
      } finally {
        setLoadingPreviewImages(false);
      }
    }
  }, [firebaseUser]);

  // Close preview modal
  const closeCarPreview = useCallback(() => {
    setShowPreviewModal(false);
    setPreviewCar(null);
    setPreviewImageUrls([]);
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
        <div className="page-header">
          <h1 className="page-title">צי הרכב שלי</h1>
          <div className="header-actions">
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
          </div>
        </div>

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
                        <span className={`image-count-indicator ${imageCount === 0 ? 'no-images' : 'has-images'}`}>
                          📷 {imageCount}
                        </span>
                      </td>
                      <td>
                        {car.brandText || car.brand || ''} {car.modelText || car.model || ''}
                      </td>
                      <td>{car.year || '-'}</td>
                      <td>{car.mileageKm ? `${car.mileageKm.toLocaleString()} ק"מ` : '-'}</td>
                      <td>{car.price ? `₪${car.price.toLocaleString()}` : '-'}</td>
                      <td>{car.city || '-'}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(car.publicationStatus)}`}>
                          {getStatusLabel(car.publicationStatus)}
                        </span>
                      </td>
                      <td>
                        <div className="car-action-buttons">
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
                      mainImageUrl={previewCar.mainImageUrl || undefined}
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
