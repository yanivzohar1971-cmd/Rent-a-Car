import { useParams, Link, useNavigate } from 'react-router-dom';
import { MOCK_CARS } from '../mock/cars';
import './CarDetailsPage.css';

export default function CarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const car = MOCK_CARS.find((c) => c.id === id);

  if (!car) {
    return (
      <div className="car-details-page">
        <div className="card">
          <h1>הרכב לא נמצא</h1>
          <p>הרכב המבוקש לא נמצא במערכת.</p>
          <Link to="/cars" className="btn btn-primary">
            חזור לתוצאות
          </Link>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  return (
    <div className="car-details-page">
      <button onClick={() => navigate(-1)} className="back-button">
        ← חזור
      </button>

      <div className="car-details-card card">
        <div className="car-main-image">
          <img src={car.mainImageUrl} alt={`${car.manufacturerHe} ${car.modelHe}`} />
        </div>

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
            <span className="spec-value">{car.city}</span>
          </div>
        </div>

        <div className="car-description">
          <h2>תיאור</h2>
          <p>
            בגיר אוטומטי, בעלים פרטיים, שמור ומטופל. טקסט זה יוחלף בנתונים אמיתיים מהמערכת.
          </p>
        </div>

        <button className="btn btn-primary contact-button">
          השאר פרטים
        </button>
      </div>
    </div>
  );
}

