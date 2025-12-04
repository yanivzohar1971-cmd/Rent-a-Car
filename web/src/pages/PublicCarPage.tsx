import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchCarAdById } from '../api/carAdsApi';
import { fetchCarByIdWithFallback } from '../api/carsApi';
import { useYardPublic } from '../context/YardPublicContext';
import { createLead } from '../api/leadsApi';
import type { CreateLeadParams } from '../api/leadsApi';
import type { LeadSource, LeadSellerType } from '../types/Lead';
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
  const { activeYardId, activeYardName, setActiveYard } = useYardPublic();
  const [carAd, setCarAd] = useState<CarAd | null>(null);
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Lead form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    customerName?: string;
    customerPhone?: string;
  }>({});

  // Check URL query for yardId (if navigating from yard page)
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const yardIdFromUrl = urlParams.get('yardId');
    if (yardIdFromUrl && !activeYardId) {
      // Load yard info and set context
      // For now, just set the ID - name will be loaded if needed
      setActiveYard(yardIdFromUrl);
    }
  }, [location.search, activeYardId, setActiveYard]);

  // Check for success message from navigation state
  useEffect(() => {
    if (location.state?.success && location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear state after showing message
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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
    setCarAd(null);
    setCar(null);

    // Try to fetch as CarAd first, then fallback to publicCars
    async function loadCar() {
      const carId = id; // Capture id value
      if (!carId) {
        setError('הרכב לא נמצא');
        setLoading(false);
        return;
      }

      try {
        // Try CarAd first
        const ad = await fetchCarAdById(carId);
        if (ad) {
          setCarAd(ad);
          const initial = ad.mainImageUrl || (ad.imageUrls && ad.imageUrls.length > 0 ? ad.imageUrls[0] : undefined);
          setSelectedImageUrl(initial);
          setLoading(false);
          return;
        }

        // Fallback to publicCars
        const car = await fetchCarByIdWithFallback(carId);
        if (car) {
          setCar(car);
          const initial =
            car.mainImageUrl ||
            (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined);
          setSelectedImageUrl(initial);
          setLoading(false);
          return;
        }

        // Not found in either collection
        setError('הרכב לא נמצא');
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError('אירעה שגיאה בטעינת הרכב');
        setLoading(false);
      }
    }

    loadCar();
  }, [id]);

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

  // Determine lead parameters
  const getLeadParams = (): {
    sellerType: LeadSellerType;
    sellerId: string;
    carTitle: string;
    source: LeadSource;
    carId: string;
  } | null => {
    if (!carAd && !car) return null;

    let sellerType: LeadSellerType;
    let sellerId: string;
    let carTitle: string;
    const carId = carAd?.id || car?.id || '';

    if (carAd) {
      // Private seller ad
      sellerType = 'PRIVATE';
      sellerId = carAd.ownerUserId;
      carTitle = `${carAd.year} ${carAd.manufacturer} ${carAd.model}`.trim();
    } else if (car) {
      // Yard/public car
      sellerType = 'YARD';
      sellerId = car.yardUid || '';
      carTitle = `${car.year} ${car.manufacturerHe} ${car.modelHe}`.trim();
    } else {
      return null;
    }

    // Determine source
    const source: LeadSource = activeYardId ? 'YARD_QR' : 'WEB_SEARCH';

    return { sellerType, sellerId, carTitle, source, carId };
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Reset errors
    setSubmitError(null);
    setFieldErrors({});
    setSubmitSuccess(false);

    // Validate
    const errors: { customerName?: string; customerPhone?: string } = {};
    if (!customerName.trim()) {
      errors.customerName = 'שדה חובה';
    }
    if (!customerPhone.trim()) {
      errors.customerPhone = 'שדה חובה';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Get lead parameters
    const leadParams = getLeadParams();
    if (!leadParams) {
      setSubmitError('אירעה שגיאה. נסה שוב בעוד רגע.');
      return;
    }

    // Check if sellerId is available
    if (!leadParams.sellerId) {
      setSubmitError('לא ניתן לזהות את המוכר. נסה שוב בעוד רגע.');
      return;
    }

    setIsSubmitting(true);

    try {
      const params: CreateLeadParams = {
        carId: leadParams.carId,
        carTitle: leadParams.carTitle,
        sellerType: leadParams.sellerType,
        sellerId: leadParams.sellerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        note: note.trim() || undefined,
        source: leadParams.source,
      };

      await createLead(params);

      // Success
      setSubmitSuccess(true);
      setSubmitError(null);
      
      // Clear form
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setNote('');
    } catch (err) {
      console.error('Error creating lead:', err);
      setSubmitError('אירעה שגיאה בשמירת הפרטים. נסה שוב בעוד רגע.');
      setSubmitSuccess(false);
    } finally {
      setIsSubmitting(false);
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

  const isInYardMode = !!activeYardId;

  return (
    <div className="public-car-page">
      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}

      {isInYardMode && (
        <div className="yard-banner">
          <div className="yard-banner-content">
            <p className="yard-banner-text">
              אתה צופה ברכבים של: <strong>{activeYardName || 'המגרש'}</strong>
            </p>
            <div className="yard-banner-actions">
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => navigate(`/yard/${activeYardId}`)}
              >
                חזרה לכל הרכבים במגרש
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setActiveYard(null);
                  navigate('/cars');
                }}
              >
                צפייה בכל הרכבים באתר
              </button>
            </div>
          </div>
        </div>
      )}
      
      <button onClick={() => isInYardMode && activeYardId ? navigate(`/yard/${activeYardId}`) : navigate(-1)} className="back-button">
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

            {/* Lead Form */}
            <div className="lead-form-section">
              <h3 className="lead-form-title">רוצה פרטים נוספים? השאר פרטים ונחזור אליך</h3>
              
              <form onSubmit={handleLeadSubmit} className="lead-form">
                <div className="form-group">
                  <label className="form-label">שם מלא *</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.customerName ? 'input-error' : ''}`}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  {fieldErrors.customerName && (
                    <span className="field-error">{fieldErrors.customerName}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">טלפון *</label>
                  <input
                    type="tel"
                    className={`form-input ${fieldErrors.customerPhone ? 'input-error' : ''}`}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  {fieldErrors.customerPhone && (
                    <span className="field-error">{fieldErrors.customerPhone}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">אימייל</label>
                  <input
                    type="email"
                    className="form-input"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">הערות</label>
                  <textarea
                    className="form-input form-textarea"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isSubmitting}
                    rows={3}
                  />
                </div>

                {submitSuccess && (
                  <div className="lead-success-message">
                    קיבלנו את הפרטים, המגרש/המוכר יחזור אליך בהקדם.
                  </div>
                )}

                {submitError && (
                  <div className="lead-error-message">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary lead-submit-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'שולח...' : 'שלח פרטים'}
                </button>
              </form>
            </div>

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

