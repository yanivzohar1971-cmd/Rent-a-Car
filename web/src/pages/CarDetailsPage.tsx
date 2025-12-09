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
          setError('הרכב לא נמצא');
        } else {
          setCar(result);
        }
      })
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת הרכב');
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
          <CarImageGallery
            imageUrls={car.imageUrls}
            mainImageUrl={car.mainImageUrl}
            altText={`${car.year} ${car.manufacturerHe} ${car.modelHe}`}
          />
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

            {/* Contact Form Card */}
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
      </div>
    </div>
  );
}
