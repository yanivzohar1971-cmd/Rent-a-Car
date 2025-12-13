import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import YardPageHeader from '../components/yard/YardPageHeader';
import { fetchGlobalDemand, type CarDemandEntry } from '../api/yardDemandApi';
import './YardDemandPage.css';

export default function YardDemandPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demandEntries, setDemandEntries] = useState<CarDemandEntry[]>([]);
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('');

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load demand data
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const entries = await fetchGlobalDemand();
        setDemandEntries(entries);
      } catch (err: any) {
        // Log real Firebase error with code and message
        const errorCode = err?.code || 'unknown';
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        console.error('[HotDemandLoad]', { code: errorCode, message: errorMessage, fullError: err });
        setError('שגיאה בטעינת נתוני ביקושים');
      } finally {
        setIsLoading(false);
      }
    }
    
    load();
  }, [firebaseUser]);

  // Filter by manufacturer
  const filteredEntries = manufacturerFilter
    ? demandEntries.filter((entry) =>
        entry.manufacturer?.toLowerCase().includes(manufacturerFilter.toLowerCase())
      )
    : demandEntries;

  // Get unique manufacturers for filter dropdown
  const manufacturers = Array.from(
    new Set(demandEntries.map((e) => e.manufacturer).filter(Boolean))
  ).sort();

  if (isLoading) {
    return (
      <div className="yard-demand-page">
        <div className="loading-container">
          <p>טוען נתוני ביקושים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-demand-page">
      <div className="page-container">
        <YardPageHeader
          title="ביקושים חמים בשוק"
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/account')}
            >
              חזרה לאזור האישי
            </button>
          }
        />

        {error && <div className="error-message">{error}</div>}

        <div className="demand-info">
          <p className="demand-description">
            נתוני ביקושים מבוססים על חיפושים שמורים פעילים של משתמשים במערכת.
            ככל שיש יותר חיפושים שמורים לדגם מסוים, הביקוש גבוה יותר.
          </p>
        </div>

        {/* Filter */}
        <div className="filter-section">
          <label className="filter-label">
            סינון לפי יצרן:
            <select
              className="filter-select"
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
            >
              <option value="">הכל</option>
              {manufacturers.map((mfr) => (
                <option key={mfr} value={mfr}>
                  {mfr}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Demand Table */}
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            <p>אין נתוני ביקושים להצגה</p>
          </div>
        ) : (
          <div className="demand-table-container">
            <table className="demand-table">
              <thead>
                <tr>
                  <th>יצרן</th>
                  <th>דגם</th>
                  <th>מספר חיפושים שמורים</th>
                  <th>טווח שנים</th>
                  <th>טווח מחיר</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.manufacturer || '-'}</td>
                    <td>{entry.model || '-'}</td>
                    <td>
                      <span className="demand-count">{entry.searchCount}</span>
                    </td>
                    <td>
                      {entry.minYearFrom || entry.maxYearTo
                        ? `${entry.minYearFrom || '?'} - ${entry.maxYearTo || '?'}`
                        : '-'}
                    </td>
                    <td>
                      {entry.minPriceFrom || entry.maxPriceTo
                        ? `${entry.minPriceFrom?.toLocaleString('he-IL') || '?'} - ${entry.maxPriceTo?.toLocaleString('he-IL') || '?'} ₪`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

