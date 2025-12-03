import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchCarAdById } from '../api/carAdsApi';
import { fetchCarByIdWithFallback } from '../api/carsApi';
import type { CarAd } from '../types/CarAd';
import type { Car } from '../api/carsApi';
import './PublicCarPage.css';

/**
 * Car main image component with loading and error states
 */
function CarMainImage({ 
  src, 
  alt 
}: { 
  src?: string; 
  alt: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!src) {
    return (
      <div className="image-error">
        אין תמונה זמינה
      </div>
    );
  }

  return (
    <>
      {loading && !error && (
        <div className="image-skeleton" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        style={{
          display: loading || error ? 'none' : 'block'
        }}
      />
      {error && (
        <div className="image-error">
          שגיאה בטעינת תמונה
        </div>
      )}
    </>
  );
}

export default function PublicCarPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [carAd, setCarAd] = useState<CarAd | null>(null);
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check for success message from navigation state
  useEffect(() => {
    if (location.state?.success && location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear state after showing message
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (!id) {
      setError('הרכב לא נמצא');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Try to fetch as CarAd first
    fetchCarAdById(id)
      .then((ad) => {
        if (ad) {
          setCarAd(ad);
          const initial = ad.mainImageUrl || (ad.imageUrls && ad.imageUrls.length > 0 ? ad.imageUrls[0] : undefined);
          setSelectedImageUrl(initial);
          setLoading(false);
        } else {
          // Fallback to publicCars
          return fetchCarByIdWithFallback(id);
        }
      })
      .then((result) => {
        if (result) {
          setCar(result);
          const initial =
            result.mainImageUrl ||
            (result.imageUrls && result.imageUrls.length > 0 ? result.imageUrls[0] : undefined);
          setSelectedImageUrl(initial);
        } else if (!carAd) {
          setError('הרכב לא נמצא');
        }
      })
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת הרכב');
      })
      .finally(() => setLoading(false));
  }, [id, carAd]);

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  const handleContactClick = () => {
    if (carAd) {
      if (carAd.phone) {
        window.location.href = `tel:${carAd.phone}`;
      } else if (carAd.email) {
        window.location.href = `mailto:${carAd.email}`;
      } else {
        alert('אין פרטי יצירת קשר זמינים');
      }
    } else {
      alert('הפרטים שלך יועברו למוכר');
    }
  };

  if (loading) {
    return (
      <div className="public-car-page">
        <div className="card">
          <p className="text-center">טוען פרטי רכב...</p>
        </div>
      </div>
    );
  }

  if (error || (!carAd && !car)) {
    return (
      <div className="public-car-page">
        <div className="card not-found-card">
          <h1>הרכב לא נמצא</h1>
          <p>הרכב המבוקש לא נמצא במערכת.</p>
          <Link to="/cars" className="btn btn-primary">
            חזור לתוצאות
          </Link>
        </div>
      </div>
    );
  }

  // Use carAd if available, otherwise use car
  const displayData = carAd || {
    id: car!.id,
    manufacturer: car!.manufacturerHe,
    model: car!.modelHe,
    year: car!.year,
    price: car!.price,
    mileageKm: car!.km,
    city: car!.city,
    description: null,
    phone: null,
    email: null,
    imageUrls: car!.imageUrls || [],
    mainImageUrl: car!.mainImageUrl,
  };

  return (
    <div className="public-car-page">
      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}
      
      <button onClick={() => navigate(-1)} className="back-button">
        ← חזור
      </button>

      <div className="car-details-layout">
        <div className="car-image-section">
          <div className="car-main-image">
            <CarMainImage 
              src={selectedImageUrl} 
              alt={`${displayData.year} ${displayData.manufacturer} ${displayData.model}`} 
            />
          </div>
          {displayData.imageUrls && displayData.imageUrls.length > 1 && (
            <div className="image-thumbnails-row">
              {displayData.imageUrls.map((url) => (
                <button
                  key={url}
                  type="button"
                  className={
                    url === selectedImageUrl
                      ? "thumbnail selected"
                      : "thumbnail"
                  }
                  onClick={() => setSelectedImageUrl(url)}
                >
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="car-info-section">
          <div className="car-details-card card">
            <div className="car-header">
              <h1 className="car-title-large">
                {displayData.year} {displayData.manufacturer} {displayData.model}
              </h1>
              <p className="car-price-large">{formatPrice(displayData.price)} ₪</p>
            </div>

            <div className="car-specs">
              <div className="spec-item">
                <span className="spec-label">קילומטראז׳:</span>
                <span className="spec-value">{displayData.mileageKm.toLocaleString('he-IL')} ק״מ</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">מיקום:</span>
                <span className="spec-value">{displayData.city}</span>
              </div>
              {carAd && carAd.gearboxType && (
                <div className="spec-item">
                  <span className="spec-label">גיר:</span>
                  <span className="spec-value">{carAd.gearboxType}</span>
                </div>
              )}
              {carAd && carAd.fuelType && (
                <div className="spec-item">
                  <span className="spec-label">דלק:</span>
                  <span className="spec-value">{carAd.fuelType}</span>
                </div>
              )}
            </div>

            {carAd && carAd.description && (
              <div className="car-description">
                <h3>תיאור</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{carAd.description}</p>
              </div>
            )}

            <button 
              className="btn btn-primary contact-button"
              onClick={handleContactClick}
            >
              יצירת קשר
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

