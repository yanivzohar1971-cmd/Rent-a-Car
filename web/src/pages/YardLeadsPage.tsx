import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchLeadsForYard, updateLeadStatus, fetchLeadMonthlyStatsForYardCurrentMonth } from '../api/leadsApi';
import { getFreeMonthlyLeadQuota } from '../config/billingConfig';
import { generateUsageWarning } from '../utils/usageWarnings';
import { UpgradeWarningBanner } from '../components/UpgradeWarningBanner';
import type { Lead, LeadStatus } from '../types/Lead';
import './YardLeadsPage.css';

export default function YardLeadsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  
  // Usage stats for warnings
  const [currentMonthLeads, setCurrentMonthLeads] = useState<number | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load leads
  useEffect(() => {
    async function load() {
      if (!firebaseUser?.uid) {
        setError('לא נמצא מגרש משויך למשתמש הנוכחי.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const loadedLeads = await fetchLeadsForYard(firebaseUser.uid);
        setLeads(loadedLeads);

        // Load current month lead usage for warnings
        setLoadingUsage(true);
        try {
          const monthlyStats = await fetchLeadMonthlyStatsForYardCurrentMonth(firebaseUser.uid);
          setCurrentMonthLeads(monthlyStats.total);
        } catch (err) {
          console.warn('Error loading monthly lead stats:', err);
          // Don't show error, just leave as null
        } finally {
          setLoadingUsage(false);
        }
      } catch (err: any) {
        console.error('Error loading leads:', err);
        setError('אירעה שגיאה בטעינת הלידים.');
      } finally {
        setIsLoading(false);
      }
    }
    
    load();
  }, [firebaseUser]);

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    if (!firebaseUser) return;

    setUpdatingLeadId(leadId);
    setError(null);

    try {
      await updateLeadStatus(leadId, newStatus);
      // Update local state
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus } : lead))
      );
    } catch (err: any) {
      console.error('Error updating lead status:', err);
      setError('אירעה שגיאה בעדכון הסטטוס. נסה שוב.');
    } finally {
      setUpdatingLeadId(null);
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

  const getStatusLabel = (status: LeadStatus): string => {
    switch (status) {
      case 'NEW':
        return 'חדש';
      case 'IN_PROGRESS':
        return 'בטיפול';
      case 'CLOSED':
        return 'נסגר';
      case 'LOST':
        return 'לא רלוונטי';
      default:
        return status;
    }
  };

  const getStatusClass = (status: LeadStatus): string => {
    switch (status) {
      case 'NEW':
        return 'status-new';
      case 'IN_PROGRESS':
        return 'status-in-progress';
      case 'CLOSED':
        return 'status-closed';
      case 'LOST':
        return 'status-lost';
      default:
        return '';
    }
  };

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'WEB_SEARCH':
        return 'חיפוש באתר';
      case 'YARD_QR':
        return 'קוד QR של המגרש';
      case 'DIRECT_LINK':
        return 'קישור ישיר';
      case 'OTHER':
        return 'אחר';
      default:
        return source;
    }
  };

  // Generate usage warning
  const usageWarning = useMemo(() => {
    if (!userProfile || currentMonthLeads === null || loadingUsage) {
      return null;
    }

    const plan = userProfile.subscriptionPlan || 'FREE';
    const quota = getFreeMonthlyLeadQuota('YARD', plan);
    return generateUsageWarning({
      currentUsage: currentMonthLeads,
      quota,
      subscriptionPlan: plan,
      sellerType: 'YARD',
    });
  }, [userProfile, currentMonthLeads, loadingUsage]);

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
          <div>
            <h1 className="page-title">הלידים של המגרש</h1>
            <p className="page-subtitle">כאן תוכל לראות פניות שקיבלת על רכבים שפורסמו מהמגרש, ולעדכן סטטוס לכל ליד</p>
          </div>
          <div className="header-actions">
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

        {/* Usage Warning Banner */}
        {usageWarning && <UpgradeWarningBanner warning={usageWarning} />}

        {leads.length === 0 ? (
          <div className="empty-state">
            <p>עדיין אין לידים למגרש</p>
            <p className="empty-state-subtitle">
              כאשר לקוחות ימלאו את טופס יצירת הקשר בעמודי הרכבים של המגרש, הפניות יופיעו כאן.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/account')}
            >
              חזרה לדשבורד המגרש
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="leads-table-container">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>רכב</th>
                    <th>לקוח</th>
                    <th>מקור</th>
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>{formatTimestamp(lead.createdAt)}</td>
                      <td>
                        <Link to={`/car/${lead.carId}`} className="car-link">
                          {lead.carTitle}
                        </Link>
                      </td>
                      <td>
                        <div className="customer-info">
                          <div className="customer-name">{lead.customerName}</div>
                          <div className="customer-contact">
                            <a href={`tel:${lead.customerPhone}`} className="phone-link">
                              {lead.customerPhone}
                            </a>
                            {lead.customerEmail && (
                              <a href={`mailto:${lead.customerEmail}`} className="email-link">
                                {lead.customerEmail}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="source-badge">{getSourceLabel(lead.source)}</span>
                      </td>
                      <td>
                        <select
                          className={`status-select ${getStatusClass(lead.status)}`}
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          disabled={updatingLeadId === lead.id}
                        >
                          <option value="NEW">חדש</option>
                          <option value="IN_PROGRESS">בטיפול</option>
                          <option value="CLOSED">נסגר</option>
                          <option value="LOST">לא רלוונטי</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="leads-cards">
              {leads.map((lead) => (
                <div key={lead.id} className="lead-card">
                  <div className="lead-card-header">
                    <div className="lead-card-title">
                      <Link to={`/car/${lead.carId}`} className="car-link">
                        <h3>{lead.carTitle}</h3>
                      </Link>
                      <span className={`status-badge ${getStatusClass(lead.status)}`}>
                        {getStatusLabel(lead.status)}
                      </span>
                    </div>
                  </div>
                  <div className="lead-card-body">
                    <div className="lead-card-info">
                      <span>לקוח:</span>
                      <strong>{lead.customerName}</strong>
                    </div>
                    <div className="lead-card-info">
                      <span>טלפון:</span>
                      <a href={`tel:${lead.customerPhone}`} className="phone-link">
                        {lead.customerPhone}
                      </a>
                    </div>
                    {lead.customerEmail && (
                      <div className="lead-card-info">
                        <span>אימייל:</span>
                        <a href={`mailto:${lead.customerEmail}`} className="email-link">
                          {lead.customerEmail}
                        </a>
                      </div>
                    )}
                    <div className="lead-card-info">
                      <span>מקור:</span>
                      <span className="source-badge">{getSourceLabel(lead.source)}</span>
                    </div>
                    <div className="lead-card-info">
                      <span>תאריך:</span>
                      <strong>{formatTimestamp(lead.createdAt)}</strong>
                    </div>
                    {lead.note && (
                      <div className="lead-card-note">
                        <span>הערה:</span>
                        <p>{lead.note}</p>
                      </div>
                    )}
                  </div>
                  <div className="lead-card-actions">
                    <label className="status-select-label">
                      סטטוס:
                      <select
                        className={`status-select ${getStatusClass(lead.status)}`}
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                        disabled={updatingLeadId === lead.id}
                      >
                        <option value="NEW">חדש</option>
                        <option value="IN_PROGRESS">בטיפול</option>
                        <option value="CLOSED">נסגר</option>
                        <option value="LOST">לא רלוונטי</option>
                      </select>
                    </label>
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
