import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchSellerCarAds, updateCarAdStatus, type CarAd } from '../api/carAdsApi';
import type { CarAdStatus } from '../types/CarAd';
import './SellerAccountPage.css';

export default function SellerAccountPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<CarAd[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!firebaseUser) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, navigate]);

  // Load ads
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const loadedAds = await fetchSellerCarAds();
        setAds(loadedAds);
      } catch (err: any) {
        console.error('Error loading seller ads:', err);
        setError('שגיאה בטעינת המודעות');
      } finally {
        setIsLoading(false);
      }
    }
    
    load();
  }, [firebaseUser]);

  const handleStatusChange = async (adId: string, newStatus: CarAdStatus) => {
    if (!firebaseUser) return;

    setIsUpdating(true);
    setError(null);

    try {
      await updateCarAdStatus(adId, newStatus);
      // Update local state
      setAds((prev) =>
        prev.map((ad) => (ad.id === adId ? { ...ad, status: newStatus } : ad))
      );
    } catch (err: any) {
      console.error('Error updating ad status:', err);
      setError('שגיאה בעדכון סטטוס המודעה');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return '-';
    }
  };

  const getStatusLabel = (status: CarAdStatus): string => {
    switch (status) {
      case 'ACTIVE':
        return 'פעיל';
      case 'PAUSED':
        return 'מושהה';
      case 'SOLD':
        return 'נמכר';
      default:
        return status;
    }
  };

  const getStatusClass = (status: CarAdStatus): string => {
    switch (status) {
      case 'ACTIVE':
        return 'status-active';
      case 'PAUSED':
        return 'status-paused';
      case 'SOLD':
        return 'status-sold';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className="seller-account-page">
        <div className="loading-container">
          <p>טוען מודעות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="seller-account-page">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">המודעות שלי</h1>
            <p className="page-subtitle">ניהול מודעות רכב למכירה</p>
          </div>
          <div className="header-actions">
            <Link to="/sell" className="btn btn-primary">
              פרסם מודעה חדשה
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/account')}
            >
              חזרה לאזור האישי
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {ads.length === 0 ? (
          <div className="empty-state">
            <p>אין מודעות פעילות</p>
            <p className="empty-state-subtitle">
              פרסם מודעה ראשונה כדי להתחיל למכור את הרכב שלך
            </p>
            <Link to="/sell" className="btn btn-primary">
              פרסם מודעה חדשה
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="ads-table-container">
              <table className="ads-table">
                <thead>
                  <tr>
                    <th>תמונה</th>
                    <th>רכב</th>
                    <th>מחיר</th>
                    <th>קילומטראז׳</th>
                    <th>עיר</th>
                    <th>סטטוס</th>
                    <th>תאריך יצירה</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id}>
                      <td>
                        {ad.mainImageUrl ? (
                          <img src={ad.mainImageUrl} alt="" className="ad-thumbnail" />
                        ) : (
                          <div className="ad-thumbnail-placeholder">אין תמונה</div>
                        )}
                      </td>
                      <td>
                        {ad.year} {ad.manufacturer} {ad.model}
                      </td>
                      <td>{ad.price.toLocaleString('he-IL')} ₪</td>
                      <td>{ad.mileageKm.toLocaleString('he-IL')} ק״מ</td>
                      <td>{ad.city}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(ad.status)}`}>
                          {getStatusLabel(ad.status)}
                        </span>
                      </td>
                      <td>{formatTimestamp(ad.createdAt)}</td>
                      <td>
                        <div className="ad-actions">
                          <Link
                            to={`/car/${ad.id}`}
                            className="btn btn-small btn-secondary"
                          >
                            צפה
                          </Link>
                          {ad.status === 'ACTIVE' && (
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => handleStatusChange(ad.id, 'PAUSED')}
                              disabled={isUpdating}
                            >
                              השהה
                            </button>
                          )}
                          {ad.status === 'PAUSED' && (
                            <button
                              type="button"
                              className="btn btn-small btn-primary"
                              onClick={() => handleStatusChange(ad.id, 'ACTIVE')}
                              disabled={isUpdating}
                            >
                              הפעל
                            </button>
                          )}
                          {ad.status !== 'SOLD' && (
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => {
                                if (window.confirm('האם לסמן את המודעה כנמכר?')) {
                                  handleStatusChange(ad.id, 'SOLD');
                                }
                              }}
                              disabled={isUpdating}
                            >
                              נמכר
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="ads-cards">
              {ads.map((ad) => (
                <div key={ad.id} className="ad-card">
                  <div className="ad-card-header">
                    {ad.mainImageUrl ? (
                      <img src={ad.mainImageUrl} alt="" className="ad-card-image" />
                    ) : (
                      <div className="ad-card-image-placeholder">אין תמונה</div>
                    )}
                    <div className="ad-card-title">
                      <h3>{ad.year} {ad.manufacturer} {ad.model}</h3>
                      <span className={`status-badge ${getStatusClass(ad.status)}`}>
                        {getStatusLabel(ad.status)}
                      </span>
                    </div>
                  </div>
                  <div className="ad-card-body">
                    <div className="ad-card-info">
                      <span>מחיר:</span>
                      <strong>{ad.price.toLocaleString('he-IL')} ₪</strong>
                    </div>
                    <div className="ad-card-info">
                      <span>קילומטראז׳:</span>
                      <strong>{ad.mileageKm.toLocaleString('he-IL')} ק״מ</strong>
                    </div>
                    <div className="ad-card-info">
                      <span>עיר:</span>
                      <strong>{ad.city}</strong>
                    </div>
                    <div className="ad-card-info">
                      <span>תאריך:</span>
                      <strong>{formatTimestamp(ad.createdAt)}</strong>
                    </div>
                  </div>
                  <div className="ad-card-actions">
                    <Link
                      to={`/car/${ad.id}`}
                      className="btn btn-small btn-secondary"
                    >
                      צפה במודעה
                    </Link>
                    {ad.status === 'ACTIVE' && (
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        onClick={() => handleStatusChange(ad.id, 'PAUSED')}
                        disabled={isUpdating}
                      >
                        השהה
                      </button>
                    )}
                    {ad.status === 'PAUSED' && (
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        onClick={() => handleStatusChange(ad.id, 'ACTIVE')}
                        disabled={isUpdating}
                      >
                        הפעל
                      </button>
                    )}
                    {ad.status !== 'SOLD' && (
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => {
                          if (window.confirm('האם לסמן את המודעה כנמכר?')) {
                            handleStatusChange(ad.id, 'SOLD');
                          }
                        }}
                        disabled={isUpdating}
                      >
                        נמכר
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

