import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import { useAuth } from '../context/AuthContext';
import { useYardPublic } from '../context/YardPublicContext';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import { ContactFormCard } from '../components/contact/ContactFormCard';
import CarImageGallery from '../components/cars/CarImageGallery';
import type { LeadSource } from '../types/Lead';
import './CarDetailsPage.css';

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();
  const { activeYardId } = useYardPublic();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (!id) {
      setError('הרכב לא נמצא');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchCarByIdWithFallback(id)
      .then((result) => {
        if (!result) {
          console.error('[CarDetailsPage] Car not found in publicCars:', { carId: id });
          setError('הרכב לא נמצא');
        } else {
          setCar(result);
        }
      })
      .catch((err: any) => {
        // Enhanced error logging with context
        const errorCode = err?.code || 'unknown';
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        console.error('[CarDetailsPage] Error loading car details:', {
          carId: id,
          errorCode,
          errorMessage,
          fullError: err,
        });
        setError('אירעה שגיאה בטעינת פרטי הרכב');
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Track car view (non-blocking, called once per mount)
  useEffect(() => {
    if (!id || !car || !firebaseUser || !car.yardUid) {
      return;
    }

    // Only track views for published cars (we assume publicCars only has published cars)
    // Call trackCarView asynchronously, non-blocking
    const trackView = async () => {
      try {
        const trackCarView = httpsCallable(functions, 'trackCarView');
        await trackCarView({
          yardUid: car.yardUid,
          carId: id,
        });
      } catch (err) {
        // Silently fail - don't show errors to user
        console.error('Error tracking car view:', err);
      }
    };

    trackView();
  }, [id, car, firebaseUser]); // Only call once when car is loaded

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  if (loading) {
    return (
      <div className="car-details-page">
        <div className="card">
          <p className="text-center">טוען פרטי רכב...</p>
        </div>
      </div>
    );
  }

  if (error || !car) {
    const handleRetry = () => {
      if (id) {
        setLoading(true);
        setError(null);
        fetchCarByIdWithFallback(id)
          .then((result) => {
            if (!result) {
              setError('הרכב לא נמצא');
            } else {
              setCar(result);
            }
          })
          .catch((err: any) => {
            console.error('[CarDetailsPage] Retry error:', { carId: id, error: err });
            setError('אירעה שגיאה בטעינת פרטי הרכב');
          })
          .finally(() => setLoading(false));
      }
    };

    return (
      <div className="car-details-page">
        <div className="card not-found-card">
          <h1>הרכב לא נמצא</h1>
          <p>הרכב המבוקש לא נמצא במערכת.</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button onClick={handleRetry} className="btn btn-secondary">
              נסה שוב
            </button>
            <Link to="/cars" className="btn btn-primary">
              חזור לתוצאות
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  return (
    <div className="car-details-page">
      <button onClick={() => navigate(-1)} className="back-button">
        ← חזור
      </button>

      {/* Gallery Section - Full Width at Top */}
      <section className="car-details-gallery-section">
        <CarImageGallery
          imageUrls={car.imageUrls}
          mainImageUrl={car.mainImageUrl}
          altText={`${car.year} ${car.manufacturerHe} ${car.modelHe}`}
        />
      </section>

      {/* Details Section - Below Gallery */}
      <section className="car-details-info-section">
        <div className="car-details-content-layout">
          <div className="car-details-main">
            <div className="car-details-card card">
              <div className="car-header">
                <h1 className="car-title-large">
                  {car.year} {car.manufacturerHe} {car.modelHe}
                </h1>
                <p className="car-price-large">{formatPrice(car.price)} ₪</p>
              </div>

              <div className="car-specs">
                <div className="spec-item">
                  <span className="spec-label">קילומטראז׳:</span>
                  <span className="spec-value">{car.km.toLocaleString('he-IL')} ק״מ</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">מיקום:</span>
                  <span className="spec-value">
                    {car.cityNameHe || car.city}
                    {car.regionNameHe ? `, ${car.regionNameHe}` : ''}
                  </span>
                </div>
              </div>

              <div className="car-description">
                <h3>תיאור</h3>
                <p>
                  בגיר אוטומטי, בעלים פרטיים, שמור ומטופל. טקסט זה יוחלף בנתונים אמיתיים מהמערכת.
                </p>
              </div>

              {/* Advanced Details Section */}
              <div className="car-advanced-details">
                <button
                  type="button"
                  className="advanced-details-toggle"
                  onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                >
                  <span>פרטים נוספים מתקדמים</span>
                  <span className="toggle-icon">{showAdvancedDetails ? '▼' : '▶'}</span>
                </button>
                {showAdvancedDetails && (
                  <div className="advanced-details-content">
                    {car.gearboxType && (
                      <div className="spec-item">
                        <span className="spec-label">תיבת הילוכים:</span>
                        <span className="spec-value">{car.gearboxType}</span>
                      </div>
                    )}
                    {car.fuelType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג דלק:</span>
                        <span className="spec-value">{car.fuelType}</span>
                      </div>
                    )}
                    {car.bodyType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג מרכב:</span>
                        <span className="spec-value">{car.bodyType}</span>
                      </div>
                    )}
                    {car.engineDisplacementCc && (
                      <div className="spec-item">
                        <span className="spec-label">נפח מנוע:</span>
                        <span className="spec-value">{car.engineDisplacementCc} סמ״ק</span>
                      </div>
                    )}
                    {car.horsepower && (
                      <div className="spec-item">
                        <span className="spec-label">כוח סוס:</span>
                        <span className="spec-value">{car.horsepower} HP</span>
                      </div>
                    )}
                    {car.ownershipType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג בעלות:</span>
                        <span className="spec-value">{car.ownershipType}</span>
                      </div>
                    )}
                    {car.importType && (
                      <div className="spec-item">
                        <span className="spec-label">סוג יבוא:</span>
                        <span className="spec-value">{car.importType}</span>
                      </div>
                    )}
                    {car.previousUse && (
                      <div className="spec-item">
                        <span className="spec-label">שימוש קודם:</span>
                        <span className="spec-value">{car.previousUse}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contact Form - Right Side on Desktop */}
          <div className="car-contact-form-wrapper">
            <ContactFormCard
              carId={car?.id || null}
              yardPhone={null}
              sellerType="YARD"
              sellerId={car?.yardUid || null}
              carTitle={car ? `${car.year} ${car.manufacturerHe} ${car.modelHe}`.trim() : null}
              source={(activeYardId ? 'YARD_QR' : 'WEB_SEARCH') as LeadSource}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
