import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardStats, type YardStatsResult, type CarStatus } from '../api/yardStatsApi';
import './YardStatsPage.css';

export default function YardStatsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<YardStatsResult | null>(null);

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load stats
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchYardStats(firebaseUser.uid);
        setStats(result);
      } catch (err: any) {
        console.error('Error loading yard stats:', err);
        setError('שגיאה בטעינת הסטטיסטיקות');
      } finally {
        setIsLoading(false);
      }
    }
    
    load();
  }, [firebaseUser]);

  const getStatusLabel = (status: CarStatus): string => {
    switch (status) {
      case 'PUBLISHED':
        return 'מפורסם';
      case 'HIDDEN':
        return 'מוסתר';
      case 'DRAFT':
        return 'טיוטה';
      default:
        return status;
    }
  };

  const getStatusClass = (status: CarStatus): string => {
    switch (status) {
      case 'PUBLISHED':
        return 'status-published';
      case 'HIDDEN':
        return 'status-hidden';
      case 'DRAFT':
        return 'status-draft';
      default:
        return '';
    }
  };

  // Constants for insights
  const RISK_DAYS_THRESHOLD = 30;
  const RISK_VIEWS_THRESHOLD = 10;

  // Top 5 most viewed cars
  const topViewedCars = stats
    ? [...stats.cars]
        .filter((c) => c.status === 'PUBLISHED')
        .sort((a, b) => b.viewsCount - a.viewsCount)
        .slice(0, 5)
    : [];

  // Top 5 at-risk cars (many days, low interest)
  const atRiskCars = stats
    ? [...stats.cars]
        .filter(
          (c) =>
            c.status === 'PUBLISHED' &&
            c.daysLive !== undefined &&
            c.daysLive >= RISK_DAYS_THRESHOLD &&
            (c.viewsCount < RISK_VIEWS_THRESHOLD || c.leadsCount === 0)
        )
        .sort((a, b) => (b.daysLive || 0) - (a.daysLive || 0))
        .slice(0, 5)
    : [];

  if (isLoading) {
    return (
      <div className="yard-stats-page">
        <div className="loading-container">
          <p>טוען סטטיסטיקות...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="yard-stats-page">
        <div className="page-container">
          <div className="error-message">{error || 'שגיאה בטעינת הסטטיסטיקות'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-stats-page">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">לוח סטטיסטיקות המגרש</h1>
            <p className="page-subtitle">צפיות, לידים וימים באוויר לכל רכב</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {/* Summary KPIs */}
        <div className="kpi-cards">
          <div className="kpi-card">
            <div className="kpi-label">סה״כ רכבים</div>
            <div className="kpi-value">{stats.summary.totalCars}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">מפורסמים כרגע</div>
            <div className="kpi-value">{stats.summary.publishedCars}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">סה״כ צפיות</div>
            <div className="kpi-value">{stats.summary.totalViews.toLocaleString('he-IL')}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">סה״כ לידים</div>
            <div className="kpi-value">{stats.summary.totalLeads}</div>
          </div>
          {stats.summary.publishedCars > 0 && (
            <>
              <div className="kpi-card">
                <div className="kpi-label">צפיות ממוצעות לרכב מפורסם</div>
                <div className="kpi-value">{stats.summary.avgViewsPerPublishedCar.toFixed(1)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">לידים ממוצעים לרכב מפורסם</div>
                <div className="kpi-value">{stats.summary.avgLeadsPerPublishedCar.toFixed(1)}</div>
              </div>
            </>
          )}
        </div>

        {/* Insights Section */}
        <div className="insights-section">
          {/* Top Viewed Cars */}
          <div className="insight-card">
            <h3 className="insight-title">5 רכבים הכי נצפים</h3>
            {topViewedCars.length === 0 ? (
              <p className="insight-empty">אין רכבים מפורסמים</p>
            ) : (
              <div className="insight-list">
                {topViewedCars.map((car) => (
                  <div key={car.carId} className="insight-item">
                    <div className="insight-item-main">
                      <strong>{car.modelLabel}</strong>
                      <div className="insight-item-stats">
                        <span>צפיות: {car.viewsCount}</span>
                        <span>לידים: {car.leadsCount}</span>
                        {car.daysLive !== undefined && <span>ימים: {car.daysLive}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* At-Risk Cars */}
          <div className="insight-card">
            <h3 className="insight-title">5 רכבים בסיכון (ימים רבים באוויר, מעט עניין)</h3>
            {atRiskCars.length === 0 ? (
              <p className="insight-empty">אין רכבים בסיכון</p>
            ) : (
              <div className="insight-list">
                {atRiskCars.map((car) => (
                  <div key={car.carId} className="insight-item">
                    <div className="insight-item-main">
                      <strong>{car.modelLabel}</strong>
                      <div className="insight-item-stats">
                        <span>צפיות: {car.viewsCount}</span>
                        <span>לידים: {car.leadsCount}</span>
                        {car.daysLive !== undefined && <span>ימים: {car.daysLive}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Full Table */}
        <div className="stats-table-section">
          <h2 className="section-title">כל הרכבים</h2>
          {stats.cars.length === 0 ? (
            <div className="empty-state">
              <p>אין רכבים במגרש</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>רכב</th>
                      <th>סטטוס</th>
                      <th>ימים באוויר</th>
                      <th>צפיות</th>
                      <th>לידים</th>
                      <th>מחיר</th>
                      <th>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.cars.map((car) => (
                      <tr key={car.carId}>
                        <td>{car.modelLabel}</td>
                        <td>
                          <span className={`status-badge ${getStatusClass(car.status)}`}>
                            {getStatusLabel(car.status)}
                          </span>
                        </td>
                        <td>{car.daysLive !== undefined ? car.daysLive : '—'}</td>
                        <td>{car.viewsCount.toLocaleString('he-IL')}</td>
                        <td>{car.leadsCount}</td>
                        <td>{car.price ? `${car.price.toLocaleString('he-IL')} ₪` : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => navigate(`/yard/cars/edit/${car.carId}`)}
                          >
                            ערוך
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="stats-cards">
                {stats.cars.map((car) => (
                  <div key={car.carId} className="stats-card">
                    <div className="stats-card-header">
                      <h3>{car.modelLabel}</h3>
                      <span className={`status-badge ${getStatusClass(car.status)}`}>
                        {getStatusLabel(car.status)}
                      </span>
                    </div>
                    <div className="stats-card-body">
                      <div className="stats-card-row">
                        <span className="stats-label">ימים באוויר:</span>
                        <span>{car.daysLive !== undefined ? car.daysLive : '—'}</span>
                      </div>
                      <div className="stats-card-row">
                        <span className="stats-label">צפיות:</span>
                        <span>{car.viewsCount.toLocaleString('he-IL')}</span>
                      </div>
                      <div className="stats-card-row">
                        <span className="stats-label">לידים:</span>
                        <span>{car.leadsCount}</span>
                      </div>
                      {car.price && (
                        <div className="stats-card-row">
                          <span className="stats-label">מחיר:</span>
                          <span>{car.price.toLocaleString('he-IL')} ₪</span>
                        </div>
                      )}
                    </div>
                    <div className="stats-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/yard/cars/edit/${car.carId}`)}
                      >
                        ערוך
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

