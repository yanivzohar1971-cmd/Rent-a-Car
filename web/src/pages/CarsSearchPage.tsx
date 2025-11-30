import { useSearchParams, Link } from 'react-router-dom';
import { MOCK_CARS, type Car } from '../mock/cars';
import './CarsSearchPage.css';

export default function CarsSearchPage() {
  const [searchParams] = useSearchParams();
  const manufacturer = searchParams.get('manufacturer') || '';
  const model = searchParams.get('model') || '';
  const minYear = searchParams.get('minYear');
  const maxPrice = searchParams.get('maxPrice');

  const filteredCars = MOCK_CARS.filter((car: Car) => {
    if (manufacturer && !car.manufacturerHe.includes(manufacturer)) {
      return false;
    }
    if (model && !car.modelHe.includes(model)) {
      return false;
    }
    if (minYear && car.year < parseInt(minYear)) {
      return false;
    }
    if (maxPrice && car.price > parseInt(maxPrice)) {
      return false;
    }
    return true;
  });

  const formatPrice = (price: number) => {
    return price.toLocaleString('he-IL');
  };

  return (
    <div className="cars-search-page">
      <h1 className="page-title">רכבים שנמצאו</h1>
      {filteredCars.length === 0 ? (
        <div className="no-results card">
          <p>לא נמצאו רכבים התואמים לחיפוש שלך.</p>
          <Link to="/" className="btn btn-primary">
            חזור לחיפוש
          </Link>
        </div>
      ) : (
        <>
          <p className="results-count">נמצאו {filteredCars.length} רכבים מתאימים</p>
          <div className="cars-grid">
            {filteredCars.map((car) => (
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
                  <button className="btn btn-primary car-view-button">
                    לצפייה בפרטים
                  </button>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

