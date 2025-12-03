import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchYardLeads,
  observeYardLeads,
  updateLeadStatus,
  type YardLeadsFilters,
  type YardLeadsSort,
} from '../api/yardLeadsApi';
import { fetchYardCarsForUser, type YardCar } from '../api/yardFleetApi';
import type { YardLead, YardLeadStatus } from '../types/YardLead';
import './YardLeadsPage.css';

export default function YardLeadsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<YardLead[]>([]);
  const [yardCars, setYardCars] = useState<Record<string, YardCar>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<YardLeadStatus | 'ALL'>('ALL');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  
  // Use real-time updates (always enabled)
  const useRealtime = true;

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Load yard cars for lookup
  useEffect(() => {
    async function loadCars() {
      if (!firebaseUser) return;
      
      try {
        const cars = await fetchYardCarsForUser();
        const carsById: Record<string, YardCar> = {};
        cars.forEach((car) => {
          carsById[car.id] = car;
        });
        setYardCars(carsById);
      } catch (err: any) {
        console.error('Error loading yard cars for lead lookup:', err);
        // Non-fatal: continue without car data
      }
    }
    
    if (firebaseUser) {
      loadCars();
    }
  }, [firebaseUser]);

  // Load or observe leads
  useEffect(() => {
    if (!firebaseUser) return;

    const filters: YardLeadsFilters = {
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      text: debouncedSearchText || undefined,
    };

    const sort: YardLeadsSort = {
      field: 'createdAt',
      direction: 'desc',
    };

    if (useRealtime) {
      // Use real-time observer
      setIsLoading(false);
      const unsubscribe = observeYardLeads(
        firebaseUser.uid,
        filters,
        sort,
        (updatedLeads) => {
          setLeads(updatedLeads);
          setError(null);
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      setIsLoading(true);
      setError(null);
      fetchYardLeads(firebaseUser.uid, filters, sort)
        .then((loadedLeads) => {
          setLeads(loadedLeads);
        })
        .catch((err: any) => {
          console.error('Error loading leads:', err);
          setError('שגיאה בטעינת הלידים');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [firebaseUser, statusFilter, debouncedSearchText, useRealtime]);

  const handleStatusChange = async (leadId: string, newStatus: YardLeadStatus) => {
    if (!firebaseUser) return;

    setIsUpdatingStatus(true);
    setError(null);

    try {
      await updateLeadStatus(firebaseUser.uid, leadId, newStatus);
      // Update local state
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus } : lead))
      );
    } catch (err: any) {
      console.error('Error updating lead status:', err);
      setError('שגיאה בעדכון סטטוס הליד');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleMarkInProgress = (lead: YardLead) => {
    if (lead.status === 'NEW') {
      handleStatusChange(lead.id, 'IN_PROGRESS');
    }
  };

  const handleMarkClosed = (lead: YardLead) => {
    if (lead.status !== 'CLOSED') {
      handleStatusChange(lead.id, 'CLOSED');
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

  const getStatusLabel = (status: YardLeadStatus): string => {
    switch (status) {
      case 'NEW':
        return 'חדש';
      case 'IN_PROGRESS':
        return 'בטיפול';
      case 'CLOSED':
        return 'נסגר';
      default:
        return status;
    }
  };

  const getStatusClass = (status: YardLeadStatus): string => {
    switch (status) {
      case 'NEW':
        return 'status-new';
      case 'IN_PROGRESS':
        return 'status-in-progress';
      case 'CLOSED':
        return 'status-closed';
      default:
        return '';
    }
  };

  const getCarInfo = (carId: string): string => {
    const car = yardCars[carId];
    if (!car) {
      return 'הרכב לא קיים / נמחק';
    }
    const parts: string[] = [];
    if (car.brandText || car.brand) {
      parts.push(car.brandText || car.brand || '');
    }
    if (car.modelText || car.model) {
      parts.push(car.modelText || car.model || '');
    }
    if (car.year) {
      parts.push(car.year.toString());
    }
    if (car.mileageKm) {
      parts.push(`${car.mileageKm.toLocaleString()} ק"מ`);
    }
    if (car.price || car.salePrice) {
      parts.push(`${(car.price || car.salePrice || 0).toLocaleString()} ₪`);
    }
    return parts.join(' • ') || 'פרטי רכב לא זמינים';
  };

  const selectedLead = selectedLeadId ? leads.find((l) => l.id === selectedLeadId) : null;
  const selectedCar = selectedLead ? yardCars[selectedLead.carId] : null;

  if (isLoading) {
    return (
      <div className="yard-leads-page">
        <div className="loading-container">
          <p>טוען לידים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-leads-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">הלידים שלי</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="filters-section">
          <div className="filters-row">
            <div className="filter-group">
              <label className="filter-label">חיפוש</label>
              <input
                type="text"
                className="filter-input"
                placeholder="חיפוש לפי שם, טלפון, מייל או הודעה"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">סטטוס</label>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as YardLeadStatus | 'ALL')}
              >
                <option value="ALL">הכל</option>
                <option value="NEW">חדשים</option>
                <option value="IN_PROGRESS">בטיפול</option>
                <option value="CLOSED">נסגרו</option>
              </select>
            </div>

            <div className="filter-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearchText('');
                  setStatusFilter('ALL');
                }}
              >
                נקה פילטרים
              </button>
            </div>
          </div>
        </div>

        {/* Leads List */}
        <div className="leads-content">
          <div className={`leads-list ${selectedLeadId ? 'has-detail' : ''}`}>
            {leads.length === 0 ? (
              <div className="empty-state">
                <p>אין לידים להצגה</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="leads-table-container">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>תאריך</th>
                        <th>שם</th>
                        <th>טלפון</th>
                        <th>על איזה רכב</th>
                        <th>סטטוס</th>
                        <th>פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr
                          key={lead.id}
                          className={selectedLeadId === lead.id ? 'selected' : ''}
                          onClick={() => setSelectedLeadId(lead.id)}
                        >
                          <td>{formatTimestamp(lead.createdAt)}</td>
                          <td>{lead.name}</td>
                          <td dir="ltr">{lead.phone}</td>
                          <td className="car-info-cell">
                            <button
                              type="button"
                              className="car-link-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/yard/cars/edit/${lead.carId}`);
                              }}
                            >
                              {getCarInfo(lead.carId)}
                            </button>
                          </td>
                          <td>
                            <span className={`status-badge ${getStatusClass(lead.status)}`}>
                              {getStatusLabel(lead.status)}
                            </span>
                          </td>
                          <td>
                            <select
                              className="status-select"
                              value={lead.status}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleStatusChange(lead.id, e.target.value as YardLeadStatus);
                              }}
                              disabled={isUpdatingStatus}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="NEW">חדש</option>
                              <option value="IN_PROGRESS">בטיפול</option>
                              <option value="CLOSED">נסגר</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="leads-cards">
                  {leads.map((lead) => (
                    <div
                      key={lead.id}
                      className={`lead-card ${selectedLeadId === lead.id ? 'selected' : ''}`}
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <div className="lead-card-header">
                        <div>
                          <h3>{lead.name}</h3>
                          <span className={`status-badge ${getStatusClass(lead.status)}`}>
                            {getStatusLabel(lead.status)}
                          </span>
                        </div>
                        <div className="lead-date">{formatTimestamp(lead.createdAt)}</div>
                      </div>
                      <div className="lead-card-body">
                        <div className="lead-info-row">
                          <span className="lead-label">טלפון:</span>
                          <span dir="ltr">{lead.phone}</span>
                        </div>
                        {lead.email && (
                          <div className="lead-info-row">
                            <span className="lead-label">מייל:</span>
                            <span dir="ltr">{lead.email}</span>
                          </div>
                        )}
                        <div className="lead-info-row">
                          <span className="lead-label">רכב:</span>
                          <button
                            type="button"
                            className="car-link-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/yard/cars/edit/${lead.carId}`);
                            }}
                          >
                            {getCarInfo(lead.carId)}
                          </button>
                        </div>
                      </div>
                      <div className="lead-card-actions">
                        <select
                          className="status-select"
                          value={lead.status}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleStatusChange(lead.id, e.target.value as YardLeadStatus);
                          }}
                          disabled={isUpdatingStatus}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="NEW">חדש</option>
                          <option value="IN_PROGRESS">בטיפול</option>
                          <option value="CLOSED">נסגר</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Detail Panel */}
          {selectedLead && (
            <div className="lead-detail-panel">
              <div className="detail-panel-header">
                <h2>פרטי ליד</h2>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSelectedLeadId(null)}
                >
                  × סגור
                </button>
              </div>

              <div className="detail-panel-content">
                {/* Car Info */}
                <div className="detail-section">
                  <h3 className="detail-section-title">פרטי הרכב</h3>
                  {selectedCar ? (
                    <div className="car-detail-info">
                      <p>
                        <strong>דגם:</strong> {selectedCar.brandText || selectedCar.brand || ''} {selectedCar.modelText || selectedCar.model || ''}
                      </p>
                      {selectedCar.year && (
                        <p>
                          <strong>שנה:</strong> {selectedCar.year}
                        </p>
                      )}
                      {selectedCar.mileageKm && (
                        <p>
                          <strong>קילומטראז':</strong> {selectedCar.mileageKm.toLocaleString()} ק"מ
                        </p>
                      )}
                      {(selectedCar.price || selectedCar.salePrice) && (
                        <p>
                          <strong>מחיר:</strong> {(selectedCar.price || selectedCar.salePrice || 0).toLocaleString()} ₪
                        </p>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(`/yard/cars/edit/${selectedLead.carId}`)}
                      >
                        פתח עריכת רכב
                      </button>
                    </div>
                  ) : (
                    <p className="car-not-found">הרכב לא קיים / נמחק</p>
                  )}
                </div>

                {/* Lead Info */}
                <div className="detail-section">
                  <h3 className="detail-section-title">פרטי הפונה</h3>
                  <div className="lead-detail-info">
                    <p>
                      <strong>שם:</strong> {selectedLead.name}
                    </p>
                    <p>
                      <strong>טלפון:</strong> <a href={`tel:${selectedLead.phone}`} dir="ltr">{selectedLead.phone}</a>
                    </p>
                    {selectedLead.email && (
                      <p>
                        <strong>מייל:</strong> <a href={`mailto:${selectedLead.email}`} dir="ltr">{selectedLead.email}</a>
                      </p>
                    )}
                    <p>
                      <strong>תאריך יצירה:</strong> {formatTimestamp(selectedLead.createdAt)}
                    </p>
                    {selectedLead.updatedAt && (
                      <p>
                        <strong>עודכן לאחרונה:</strong> {formatTimestamp(selectedLead.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Message */}
                {selectedLead.message && (
                  <div className="detail-section">
                    <h3 className="detail-section-title">הודעה</h3>
                    <div className="lead-message">
                      <p>{selectedLead.message}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="detail-section">
                  <h3 className="detail-section-title">פעולות</h3>
                  <div className="detail-actions">
                    <select
                      className="status-select"
                      value={selectedLead.status}
                      onChange={(e) => handleStatusChange(selectedLead.id, e.target.value as YardLeadStatus)}
                      disabled={isUpdatingStatus}
                    >
                      <option value="NEW">חדש</option>
                      <option value="IN_PROGRESS">בטיפול</option>
                      <option value="CLOSED">נסגר</option>
                    </select>
                    {selectedLead.status === 'NEW' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleMarkInProgress(selectedLead)}
                        disabled={isUpdatingStatus}
                      >
                        סמן כבטיפול
                      </button>
                    )}
                    {selectedLead.status !== 'CLOSED' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleMarkClosed(selectedLead)}
                        disabled={isUpdatingStatus}
                      >
                        סמן כסגור
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

