import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchYardCarsForUser,
  type YardCar,
  type YardFleetSortField,
  type CarPublicationStatus,
  type ImageFilterMode,
} from '../api/yardFleetApi';
import './YardFleetPage.css';

export default function YardFleetPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCars, setAllCars] = useState<YardCar[]>([]);
  
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
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => navigate(`/yard/cars/edit/${car.id}`)}
                        >
                          עריכה
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
