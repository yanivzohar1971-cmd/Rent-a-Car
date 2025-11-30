import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchCarsWithFallback, type Car } from '../api/carsApi';
import './CarsSearchPage.css';

export default function CarsSearchPage() {
  const [searchParams] = useSearchParams();
  const manufacturer = searchParams.get('manufacturer') || '';
  const model = searchParams.get('model') || '';
  const minYear = searchParams.get('minYear');
  const maxPrice = searchParams.get('maxPrice');

  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const filters = {
      manufacturer: manufacturer || undefined,
      model: model || undefined,
      minYear: minYear ? parseInt(minYear) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
    };

    fetchCarsWithFallback(filters)
      .then(setCars)
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת רכבים');
      })
      .finally(() => setLoading(false));
  }, [manufacturer, model, minYear, maxPrice]);

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  if (loading) {
    return (
      <div className="cars-search-page">
        <h1 className="page-title">רכבים שנמצאו</h1>
        <div className="card">
          <p className="text-center">טוען רכבים...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cars-search-page">
        <h1 className="page-title">רכבים שנמצאו</h1>
        <div className="card">
          <p className="text-center" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem', display: 'block', textAlign: 'center' }}>
            חזור לחיפוש
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cars-search-page">
      <h1 className="page-title">רכבים שנמצאו</h1>
      {cars.length === 0 ? (
        <div className="no-results card">
          <p>לא נמצאו רכבים התואמים לחיפוש שלך.</p>
          <Link to="/" className="btn btn-primary">
            חזור לחיפוש
          </Link>
        </div>
      ) : (
        <>
          <p className="results-count">נמצאו {cars.length} רכבים מתאימים</p>
          <div className="cars-grid">
            {cars.map((car) => (
              <Link key={car.id} to={`/cars/${car.id}`} className="car-card card">
                <div className="car-image">
                  <img src={car.mainImageUrl} alt={`${car.manufacturerHe} ${car.modelHe}`} />
                </div>
                <div className="car-info">
                  <h3 className="car-title">
                    {car.year} {car.manufacturerHe} {car.modelHe}
                  </h3>
                  <p className="car-price">מחיר: {formatPrice(car.price)} ₪</p>
                  <p className="car-km">ק״מ: {car.km.toLocaleString('he-IL')}</p>
                  <p className="car-location">מיקום: {car.city}</p>
                  <div className="car-view-button-wrapper">
                    <span className="car-view-text">לצפייה בפרטים</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
