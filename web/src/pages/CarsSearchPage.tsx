import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchCarsWithFallback, type Car, type CarFilters } from '../api/carsApi';
import { GearboxType, FuelType, BodyType } from '../types/carTypes';
import './CarsSearchPage.css';

/**
 * Car image component with loading and error states
 */
function CarImage({ 
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

export default function CarsSearchPage() {
  const [searchParams] = useSearchParams();
  
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Helper function to parse number from string
    const parseNumber = (value: string | null): number | undefined => {
      if (!value) return undefined;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? undefined : parsed;
    };

    // Helper function to parse array from comma-separated string
    const parseArray = <T extends string>(value: string | null, enumValues: readonly T[]): T[] | undefined => {
      if (!value) return undefined;
      const parts = value.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) return undefined;
      return parts.filter(p => enumValues.includes(p as T)) as T[];
    };

    // Build filters object from URL params
    const filters: CarFilters = {
      // Existing fields (backward compatibility)
      manufacturer: searchParams.get('manufacturer') || undefined,
      model: searchParams.get('model') || undefined,
      minYear: parseNumber(searchParams.get('minYear')),
      maxPrice: parseNumber(searchParams.get('maxPrice')),

      // Basic filters - ranges
      yearFrom: parseNumber(searchParams.get('yearFrom')),
      yearTo: parseNumber(searchParams.get('yearTo')),
      kmFrom: parseNumber(searchParams.get('kmFrom')),
      kmTo: parseNumber(searchParams.get('kmTo')),
      priceFrom: parseNumber(searchParams.get('priceFrom')),
      priceTo: parseNumber(searchParams.get('priceTo')),

      // Advanced filters - numeric ranges
      handFrom: parseNumber(searchParams.get('handFrom')),
      handTo: parseNumber(searchParams.get('handTo')),
      engineCcFrom: parseNumber(searchParams.get('engineCcFrom')),
      engineCcTo: parseNumber(searchParams.get('engineCcTo')),
      hpFrom: parseNumber(searchParams.get('hpFrom')),
      hpTo: parseNumber(searchParams.get('hpTo')),
      gearsFrom: parseNumber(searchParams.get('gearsFrom')),
      gearsTo: parseNumber(searchParams.get('gearsTo')),

      // Advanced filters - categorical
      gearboxTypes: parseArray(searchParams.get('gearboxTypes'), Object.values(GearboxType)),
      fuelTypes: parseArray(searchParams.get('fuelTypes'), Object.values(FuelType)),
      bodyTypes: parseArray(searchParams.get('bodyTypes'), Object.values(BodyType)),
      
      // AC filter
      acRequired: (() => {
        const value = searchParams.get('acRequired');
        if (value === null) return undefined;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
      })(),

      // Color filter
      color: searchParams.get('color') || undefined,

      // Location filters
      regionId: searchParams.get('regionId') || undefined,
      cityId: searchParams.get('cityId') || undefined,
    };

    fetchCarsWithFallback(filters)
      .then(setCars)
      .catch((err) => {
        console.error(err);
        setError('אירעה שגיאה בטעינת רכבים');
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

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
                  <CarImage 
                    src={car.mainImageUrl} 
                    alt={`${car.manufacturerHe} ${car.modelHe}`} 
                  />
                </div>
                <div className="car-info">
                  <h3 className="car-title">
                    {car.year} {car.manufacturerHe} {car.modelHe}
                  </h3>
                  <p className="car-price">מחיר: {formatPrice(car.price)} ₪</p>
                  <p className="car-km">ק״מ: {car.km.toLocaleString('he-IL')}</p>
                  <p className="car-location">
                    מיקום: {car.cityNameHe || car.city}
                    {car.regionNameHe ? `, ${car.regionNameHe}` : ''}
                  </p>
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
