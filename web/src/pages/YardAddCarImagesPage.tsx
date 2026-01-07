import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardCarsForUser, type YardCar } from '../api/yardFleetApi';
import YardCarImagesDialog from '../components/yard/YardCarImagesDialog';
import LicensePlateBadge from '../components/common/LicensePlateBadge';
import YardPageHeader from '../components/yard/YardPageHeader';
import './YardAddCarImagesPage.css';

/**
 * Normalize license plate string for comparison (remove spaces, dashes, convert to lowercase)
 */
function normalizePlate(plate: string | null | undefined): string {
  if (!plate) return '';
  return plate.replace(/[\s-]/g, '').toLowerCase();
}

/**
 * Check if a car matches the search query (license plate)
 */
function matchesPlate(car: YardCar, query: string): boolean {
  const normalizedQuery = normalizePlate(query);
  if (normalizedQuery.length < 3) return false;
  
  const carPlate = normalizePlate(car.licensePlatePartial);
  return carPlate.includes(normalizedQuery) || carPlate === normalizedQuery;
}

export default function YardAddCarImagesPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCars, setAllCars] = useState<YardCar[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCar, setSelectedCar] = useState<YardCar | null>(null);
  const [showImagesDialog, setShowImagesDialog] = useState(false);

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
      } catch (err: any) {
        console.error('Error loading yard cars:', err);
        setError('שגיאה בטעינת צי הרכב');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  // Filter cars by license plate search
  const matchingCars = useMemo(() => {
    if (!searchQuery || searchQuery.trim().length < 3) {
      return [];
    }
    
    const filtered = allCars.filter(car => matchesPlate(car, searchQuery));
    // Limit to top 10 results
    return filtered.slice(0, 10);
  }, [allCars, searchQuery]);

  // Get car title for dialog
  const getCarTitle = (car: YardCar): string => {
    const parts: string[] = [];
    if (car.brandText || car.brand) {
      parts.push(car.brandText || car.brand || '');
    }
    if (car.modelText || car.model) {
      parts.push(car.modelText || car.model || '');
    }
    if (car.year) {
      parts.push(String(car.year));
    }
    return parts.join(' ') || 'רכב';
  };

  const handleCarSelect = (car: YardCar) => {
    setSelectedCar(car);
  };

  const handleOpenImagesDialog = () => {
    if (selectedCar && firebaseUser) {
      setShowImagesDialog(true);
    }
  };

  const handleCloseImagesDialog = () => {
    setShowImagesDialog(false);
  };

  const handleImagesUpdated = () => {
    // Optionally reload cars or show success message
    // For now, just close the dialog
  };

  if (isLoading) {
    return (
      <div className="yard-add-car-images-page">
        <div className="loading-container">
          <p>טוען את צי הרכב...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-add-car-images-page">
      <div className="page-container">
        <YardPageHeader
          title="הוסף תמונות לרכב"
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/yard/fleet')}
            >
              חזרה לצי הרכב
            </button>
          }
        />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="add-images-content">
          {/* Search Section */}
          <div className="search-section">
            <label htmlFor="plate-search" className="search-label">
              חפש רכב לפי מספר רישוי
            </label>
            <input
              id="plate-search"
              type="text"
              className="search-input"
              placeholder="לדוגמה: 12-345-67"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCar(null); // Clear selection when search changes
              }}
            />
            {searchQuery && searchQuery.trim().length < 3 && (
              <p className="search-hint">הקלד לפחות 3 תווים</p>
            )}
          </div>

          {/* Search Results */}
          {searchQuery && searchQuery.trim().length >= 3 && (
            <div className="results-section">
              {matchingCars.length === 0 ? (
                <div className="no-results">
                  <p>לא נמצא רכב במגרש לפי מספר זה</p>
                </div>
              ) : (
                <div className="results-list">
                  <h3 className="results-title">תוצאות חיפוש ({matchingCars.length})</h3>
                  {matchingCars.map((car) => (
                    <div
                      key={car.id}
                      className={`result-card ${selectedCar?.id === car.id ? 'selected' : ''}`}
                      onClick={() => handleCarSelect(car)}
                    >
                      <div className="result-card-left">
                        {car.licensePlatePartial && (
                          <LicensePlateBadge plate={car.licensePlatePartial} size="sm" />
                        )}
                      </div>
                      <div className="result-card-content">
                        <div className="result-card-title">
                          {getCarTitle(car)}
                        </div>
                        {car.year && (
                          <div className="result-card-subtitle">
                            שנת ייצור: {car.year}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Card */}
          {selectedCar && (
            <div className="confirmation-section">
              <div className="confirmation-card">
                <h3 className="confirmation-title">אישור פרטי הרכב</h3>
                <div className="confirmation-content">
                  <div className="confirmation-main">
                    <h4 className="confirmation-car-title">{getCarTitle(selectedCar)}</h4>
                    <div className="confirmation-details">
                      {selectedCar.year && (
                        <span className="confirmation-detail">שנה: {selectedCar.year}</span>
                      )}
                      {selectedCar.licensePlatePartial && (
                        <LicensePlateBadge plate={selectedCar.licensePlatePartial} size="md" />
                      )}
                    </div>
                  </div>
                  {selectedCar.mainImageUrl && (
                    <div className="confirmation-image">
                      <img
                        src={selectedCar.mainImageUrl}
                        alt={getCarTitle(selectedCar)}
                        className="confirmation-thumbnail"
                      />
                    </div>
                  )}
                </div>
                <div className="confirmation-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleOpenImagesDialog}
                  >
                    העלה תמונות
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Upload disabled message */}
          {!selectedCar && searchQuery && searchQuery.trim().length >= 3 && matchingCars.length > 0 && (
            <div className="upload-disabled-hint">
              <p>בחר רכב מהרשימה כדי להעלות תמונות</p>
            </div>
          )}
        </div>

        {/* Images Dialog */}
        {selectedCar && firebaseUser && (
          <YardCarImagesDialog
            open={showImagesDialog}
            yardId={firebaseUser.uid}
            carId={selectedCar.id}
            carTitle={getCarTitle(selectedCar)}
            licensePlatePartial={selectedCar.licensePlatePartial}
            initialImageCount={selectedCar.imageCount || 0}
            onClose={handleCloseImagesDialog}
            onImagesUpdated={handleImagesUpdated}
          />
        )}
      </div>
    </div>
  );
}

