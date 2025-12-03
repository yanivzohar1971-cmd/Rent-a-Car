import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchCarByIdWithFallback, type Car } from '../api/carsApi';
import './CarDetailsPage.css';

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

  // If no src, show placeholder immediately
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

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | undefined>(undefined);

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
          setError('הרכב לא נמצא');
        } else {
          setCar(result);
          // Set initial selected image
          const initial =
            result.mainImageUrl ||
            (result.imageUrls && result.imageUrls.length > 0 ? result.imageUrls[0] : undefined);
          setSelectedImageUrl(initial);
        }
      })
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת הרכב');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  const handleContactClick = () => {
    alert('הפרטים שלך יועברו לסוכן (דמו בלבד, ללא שליחה אמיתית)');
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
    return (
      <div className="car-details-page">
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

  return (
    <div className="car-details-page">
      <button onClick={() => navigate(-1)} className="back-button">
        ← חזור
      </button>

      <div className="car-details-layout">
        <div className="car-image-section">
          <div className="car-main-image">
            <CarMainImage 
              src={selectedImageUrl} 
              alt={`${car.year} ${car.manufacturerHe} ${car.modelHe}`} 
            />
          </div>
          {car.imageUrls && car.imageUrls.length > 1 && (
            <div className="image-thumbnails-row">
              {car.imageUrls.map((url) => (
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

            <div className="car-features">
              <h3>פרטים נוספים</h3>
              <ul className="features-list">
                <li>גיר אוטומטי</li>
                <li>בעלים פרטיים</li>
                <li>טסט לשנה קדימה</li>
                <li>רכב שמור ומטופל</li>
              </ul>
            </div>

            <div className="car-description">
              <h3>תיאור</h3>
              <p>
                בגיר אוטומטי, בעלים פרטיים, שמור ומטופל. טקסט זה יוחלף בנתונים אמיתיים מהמערכת.
              </p>
            </div>

            <button 
              className="btn btn-primary contact-button"
              onClick={handleContactClick}
            >
              השאר פרטים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
