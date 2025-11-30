import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const params = new URLSearchParams();
    if (manufacturer) params.set('manufacturer', manufacturer);
    if (model) params.set('model', model);
    if (minYear) params.set('minYear', minYear);
    if (maxPrice) params.set('maxPrice', maxPrice);

    navigate(`/cars?${params.toString()}`);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">מחפשים את הרכב הבא שלכם?</h1>
          <p className="hero-subtitle">
            CarExpert מחבר אתכם למגרשים וסוכנים אמיתיים, עם תהליך שקוף ופשוט.
          </p>
          <div className="hero-illustration"></div>
        </div>
        
        <div className="search-card-container">
          <div className="search-card card">
            <h2 className="search-title">חפש רכב</h2>
            <form onSubmit={handleSearch} className="search-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">יצרן</label>
                  <input
                    type="text"
                    className="form-input"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="לדוגמה: טויוטה"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">דגם</label>
                  <input
                    type="text"
                    className="form-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="לדוגמה: קורולה"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">שנה מינימלית</label>
                  <select
                    className="form-input"
                    value={minYear}
                    onChange={(e) => setMinYear(e.target.value)}
                  >
                    <option value="">כל השנים</option>
                    {years.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">מחיר מקסימלי</label>
                  <input
                    type="number"
                    className="form-input"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="לדוגמה: 90000"
                    min="0"
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary search-button">
                חיפוש רכב
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
