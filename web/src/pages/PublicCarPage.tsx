import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { fetchCarAdById } from '../api/carAdsApi';
import { fetchCarByIdWithFallback } from '../api/carsApi';
import { useYardPublic } from '../context/YardPublicContext';
import { ContactFormCard } from '../components/contact/ContactFormCard';
import type { CarAd } from '../types/CarAd';
import type { Car } from '../api/carsApi';
import './PublicCarPage.css';

/**
 * Updates Open Graph meta tags in the document head for Facebook sharing.
 * Note: Facebook's crawler can't execute JavaScript, so these tags are mainly
 * for other services and for users who manually copy links. For full Facebook
 * support, server-side rendering or a Cloud Function would be needed.
 */
function updateOpenGraphTags(data: {
  title: string;
  description: string;
  imageUrl?: string;
  url: string;
}) {
  const { title, description, imageUrl, url } = data;

  // Helper to update or create a meta tag
  const setMetaTag = (property: string, content: string) => {
    let meta = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', content);
  };

  // Update OG tags
  setMetaTag('og:title', title);
  setMetaTag('og:description', description);
  setMetaTag('og:url', url);
  if (imageUrl) {
    setMetaTag('og:image', imageUrl);
  }

  // Also update document title
  document.title = `${title} | CarExpert`;
}

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

  // Scroll to top on mount - safe helper that never throws
  function scrollToTopSafe() {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
  }

  useEffect(() => {
    scrollToTopSafe();
  }, []);

  // Update Open Graph meta tags when car data is loaded
  useEffect(() => {
    if (!carAd && !car) return;

    const displayCar = carAd || car;
    if (!displayCar) return;

    // Build title
    const title = carAd
      ? `${carAd.year} ${carAd.manufacturer} ${carAd.model} למכירה`
      : `${car!.year} ${car!.manufacturerHe} ${car!.modelHe} למכירה`;

    // Build description with available specs
    const price = carAd?.price || car?.price;
    const km = carAd?.mileageKm || car?.km;
    const city = carAd?.city || car?.city;
    const descParts: string[] = [];
    if (price) descParts.push(`₪${price.toLocaleString('he-IL')}`);
    if (km) descParts.push(`${km.toLocaleString('he-IL')} ק״מ`);
    if (city) descParts.push(city);
    descParts.push('רכב למכירה ב-CarExpert');
    const description = descParts.join(' · ');

    // Get main image URL
    const imageUrl = carAd?.mainImageUrl || carAd?.imageUrls?.[0] || car?.mainImageUrl || car?.imageUrls?.[0];

    // Build canonical URL
    const url = `${window.location.origin}/car/${id}`;

    updateOpenGraphTags({ title, description, imageUrl, url });

    // Reset title on unmount
    return () => {
      document.title = 'CarExpert - אתר חיפוש רכבים';
    };
  }, [carAd, car, id]);

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
              {/* Additional specs for yard cars */}
              {car && car.gearboxType && (
                <div className="spec-item">
                  <span className="spec-label">תיבת הילוכים:</span>
                  <span className="spec-value">{car.gearboxType}</span>
                </div>
              )}
              {car && car.fuelType && (
                <div className="spec-item">
                  <span className="spec-label">סוג דלק:</span>
                  <span className="spec-value">{car.fuelType}</span>
                </div>
              )}
              {car && car.bodyType && (
                <div className="spec-item">
                  <span className="spec-label">סוג מרכב:</span>
                  <span className="spec-value">{car.bodyType}</span>
                </div>
              )}
              {car && car.engineDisplacementCc && (
                <div className="spec-item">
                  <span className="spec-label">נפח מנוע:</span>
                  <span className="spec-value">{car.engineDisplacementCc} סמ״ק</span>
                </div>
              )}
              {car && car.horsepower && (
                <div className="spec-item">
                  <span className="spec-label">כוח סוס:</span>
                  <span className="spec-value">{car.horsepower} HP</span>
                </div>
              )}
              {car && car.ownershipType && (
                <div className="spec-item">
                  <span className="spec-label">סוג בעלות:</span>
                  <span className="spec-value">{car.ownershipType}</span>
                </div>
              )}
              {car && car.importType && (
                <div className="spec-item">
                  <span className="spec-label">סוג יבוא:</span>
                  <span className="spec-value">{car.importType}</span>
                </div>
              )}
              {car && car.previousUse && (
                <div className="spec-item">
                  <span className="spec-label">שימוש קודם:</span>
                  <span className="spec-value">{car.previousUse}</span>
                </div>
              )}
              {car && car.handCount !== null && car.handCount !== undefined && (
                <div className="spec-item">
                  <span className="spec-label">מספר יד:</span>
                  <span className="spec-value">{car.handCount}</span>
                </div>
              )}
              {car && car.color && (
                <div className="spec-item">
                  <span className="spec-label">צבע:</span>
                  <span className="spec-value">{car.color}</span>
                </div>
              )}
              {car && car.numberOfGears !== null && car.numberOfGears !== undefined && (
                <div className="spec-item">
                  <span className="spec-label">מספר הילוכים:</span>
                  <span className="spec-value">{car.numberOfGears}</span>
                </div>
              )}
              {car && ((car.hasAC !== null && car.hasAC !== undefined) || (car.ac !== null && car.ac !== undefined)) && (
                <div className="spec-item">
                  <span className="spec-label">מזגן:</span>
                  <span className="spec-value">{(car.hasAC ?? car.ac) ? 'כן' : 'לא'}</span>
                </div>
              )}
              {car && car.licensePlatePartial && (
                <div className="spec-item">
                  <span className="spec-label">מספר רישוי חלקי:</span>
                  <span className="spec-value">{car.licensePlatePartial}</span>
                </div>
              )}
            </div>

            {carAd && carAd.description && (
              <div className="car-description">
                <h3>תיאור</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{carAd.description}</p>
              </div>
            )}
            {car && car.notes && (
              <div className="car-description">
                <h3>הערות/תיאור</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{car.notes}</p>
              </div>
            )}

            {/* Contact Form Card */}
            <ContactFormCard
              carId={carAd?.id || car?.id || null}
              yardPhone={carAd?.phone || null}
              sellerType={carAd ? 'PRIVATE' : 'YARD'}
              sellerId={carAd?.ownerUserId || car?.yardUid || null}
              carTitle={
                carAd
                  ? `${carAd.year} ${carAd.manufacturer} ${carAd.model}`.trim()
                  : car
                  ? `${car.year} ${car.manufacturerHe} ${car.modelHe}`.trim()
                  : null
              }
              source={activeYardId ? 'YARD_QR' : 'WEB_SEARCH'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

