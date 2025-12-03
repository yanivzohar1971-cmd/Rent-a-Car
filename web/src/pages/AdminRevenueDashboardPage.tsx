/**
 * Admin Revenue Dashboard
 * Real-time revenue aggregation from leads and promotion orders
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { aggregateRevenue } from '../api/revenueApi';
import type { RevenueFilters, RevenueBucketSummary, RevenueScope } from '../types/Revenue';
import './AdminRevenueDashboardPage.css';

type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'CUSTOM';

export default function AdminRevenueDashboardPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  });
  const [grouping, setGrouping] = useState<'MONTHLY' | 'QUARTERLY'>('MONTHLY');
  const [scopeFilter, setScopeFilter] = useState<RevenueScope | 'ALL'>('ALL');

  // Data
  const [summaries, setSummaries] = useState<RevenueBucketSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null); // For showing line items

  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Update dates based on preset
  useEffect(() => {
    if (datePreset === 'CUSTOM') {
      return; // Don't auto-update for custom
    }

    const now = new Date();
    let newStart: Date;
    let newEnd: Date = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    switch (datePreset) {
      case 'THIS_MONTH':
        newStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'LAST_MONTH':
        newStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        newEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'LAST_3_MONTHS':
        newStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case 'THIS_YEAR':
        newStart = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        newStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    setStartDate(newStart);
    setEndDate(newEnd);
  }, [datePreset]);

  // Load revenue data
  useEffect(() => {
    if (!isAdmin) return;

    async function loadRevenue() {
      setLoading(true);
      setError(null);

      try {
        const filters: RevenueFilters = {
          startDate,
          endDate,
          grouping,
          scope: scopeFilter,
        };

        const data = await aggregateRevenue(filters);
        setSummaries(data);
      } catch (err: any) {
        console.error('Error loading revenue data:', err);
        setError('שגיאה בטעינת נתוני הכנסות');
      } finally {
        setLoading(false);
      }
    }

    loadRevenue();
  }, [isAdmin, startDate, endDate, grouping, scopeFilter]);

  // Calculate summary KPIs
  const summaryStats = useMemo(() => {
    let totalRevenue = 0;
    let revenueFromLeads = 0;
    let revenueFromPrivatePromotions = 0;
    let revenueFromYardPromotions = 0;

    summaries.forEach((summary) => {
      totalRevenue += summary.totalAmount;
      summary.lineItems.forEach((item) => {
        if (item.source === 'LEAD') {
          revenueFromLeads += item.totalAmount;
        } else if (item.source === 'PROMOTION_PRIVATE') {
          revenueFromPrivatePromotions += item.totalAmount;
        } else if (item.source === 'PROMOTION_YARD') {
          revenueFromYardPromotions += item.totalAmount;
        }
      });
    });

    return {
      totalRevenue,
      revenueFromLeads,
      revenueFromPrivatePromotions,
      revenueFromYardPromotions,
    };
  }, [summaries]);

  // Format bucket label
  const formatBucketLabel = (bucket: RevenueBucketSummary['bucket']): string => {
    if (bucket.quarter !== undefined) {
      return `Q${bucket.quarter} ${bucket.year}`;
    }
    if (bucket.month !== undefined) {
      const monthNames = [
        'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
      ];
      return `${monthNames[bucket.month - 1]} ${bucket.year}`;
    }
    return String(bucket.year);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const csvRows: string[] = [];

    // CSV Header
    csvRows.push([
      'תקופה',
      'סקופ',
      'מקור',
      'מזהה ישות',
      'שם ישות',
      'כמות',
      'מחיר ליחידה',
      'סכום כולל',
    ].join(','));

    // CSV Data
    summaries.forEach((summary) => {
      const periodLabel = formatBucketLabel(summary.bucket);
      
      summary.lineItems.forEach((item) => {
        const scopeLabel = item.scope === 'YARD' ? 'מגרש' : 'מוכר פרטי';
        const sourceLabel = item.source === 'LEAD' 
          ? 'ליד' 
          : item.source === 'PROMOTION_PRIVATE' 
            ? 'קידום פרטי' 
            : 'קידום מגרש';

        csvRows.push([
          periodLabel,
          scopeLabel,
          sourceLabel,
          item.entityId,
          item.displayName || '',
          String(item.count),
          String(item.unitPrice),
          String(item.totalAmount),
        ].join(','));
      });
    });

    // Create and download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Hebrew
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `revenue_export_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAdmin) {
    return (
      <div className="admin-revenue-dashboard-page">
        <div className="page-container">
          <div className="error-state">
            <p>אין לך הרשאה לצפות בעמוד זה.</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/account')}>
              חזרה לאזור האישי
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-revenue-dashboard-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">דשבורד הכנסות - זמן אמת</h1>
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportCSV}
              disabled={loading || summaries.length === 0}
            >
              ייצא CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/account')}
            >
              חזרה
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Filters */}
        <div className="revenue-filters">
          <div className="filter-group">
            <label htmlFor="date-preset">תקופת זמן:</label>
            <select
              id="date-preset"
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="form-input"
            >
              <option value="THIS_MONTH">חודש נוכחי</option>
              <option value="LAST_MONTH">חודש קודם</option>
              <option value="LAST_3_MONTHS">3 חודשים אחרונים</option>
              <option value="THIS_YEAR">שנה נוכחית</option>
              <option value="CUSTOM">מותאם אישית</option>
            </select>
          </div>

          {datePreset === 'CUSTOM' && (
            <>
              <div className="filter-group">
                <label htmlFor="start-date">תאריך התחלה:</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate.toISOString().split('T')[0]}
                  onChange={(e) => setStartDate(new Date(e.target.value))}
                  className="form-input"
                />
              </div>
              <div className="filter-group">
                <label htmlFor="end-date">תאריך סיום:</label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate.toISOString().split('T')[0]}
                  onChange={(e) => setEndDate(new Date(e.target.value))}
                  className="form-input"
                />
              </div>
            </>
          )}

          <div className="filter-group">
            <label>קיבוץ:</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="grouping"
                  value="MONTHLY"
                  checked={grouping === 'MONTHLY'}
                  onChange={() => setGrouping('MONTHLY')}
                />
                חודשי
              </label>
              <label>
                <input
                  type="radio"
                  name="grouping"
                  value="QUARTERLY"
                  checked={grouping === 'QUARTERLY'}
                  onChange={() => setGrouping('QUARTERLY')}
                />
                רבעוני
              </label>
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="scope-filter">סקופ:</label>
            <select
              id="scope-filter"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as RevenueScope | 'ALL')}
              className="form-input"
            >
              <option value="ALL">הכל</option>
              <option value="YARD">מגרשים בלבד</option>
              <option value="PRIVATE">מוכרים פרטיים בלבד</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        {loading ? (
          <div className="loading-state">
            <p>טוען נתוני הכנסות...</p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="empty-state">
            <p>לא נמצאו נתוני הכנסות בתקופה הנבחרת</p>
          </div>
        ) : (
          <>
            <div className="revenue-summary-cards">
              <div className="summary-card">
                <div className="summary-card-value">
                  {summaryStats.totalRevenue.toLocaleString('he-IL')} ₪
                </div>
                <div className="summary-card-label">סה״כ הכנסות</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-value">
                  {summaryStats.revenueFromLeads.toLocaleString('he-IL')} ₪
                </div>
                <div className="summary-card-label">הכנסות מלידים</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-value">
                  {summaryStats.revenueFromPrivatePromotions.toLocaleString('he-IL')} ₪
                </div>
                <div className="summary-card-label">הכנסות מקידום פרטי</div>
              </div>
              <div className="summary-card">
                <div className="summary-card-value">
                  {summaryStats.revenueFromYardPromotions.toLocaleString('he-IL')} ₪
                </div>
                <div className="summary-card-label">הכנסות מקידום מגרש</div>
              </div>
            </div>

            {/* Revenue Table */}
            <div className="revenue-table-container">
              <h2 className="section-title">פירוט הכנסות לפי תקופה</h2>
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>תקופה</th>
                    <th>סה״כ הכנסות</th>
                    <th>כמות פריטים</th>
                    <th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary, index) => {
                    const bucketKey = formatBucketLabel(summary.bucket);
                    const isExpanded = expandedBucket === bucketKey;
                    
                    return (
                      <>
                        <tr key={index}>
                          <td>{bucketKey}</td>
                          <td>
                            <strong>{summary.totalAmount.toLocaleString('he-IL')} ₪</strong>
                          </td>
                          <td>{summary.lineItems.length}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => {
                                setExpandedBucket(isExpanded ? null : bucketKey);
                              }}
                            >
                              {isExpanded ? 'הסתר פרטים' : 'הצג פרטים'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${index}-details`}>
                            <td colSpan={4}>
                              <div className="line-items-details">
                                <table className="line-items-table">
                                  <thead>
                                    <tr>
                                      <th>סקופ</th>
                                      <th>מקור</th>
                                      <th>ישות</th>
                                      <th>כמות</th>
                                      <th>מחיר ליחידה</th>
                                      <th>סכום</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {summary.lineItems.map((item, itemIndex) => (
                                      <tr key={itemIndex}>
                                        <td>{item.scope === 'YARD' ? 'מגרש' : 'מוכר פרטי'}</td>
                                        <td>
                                          {item.source === 'LEAD' 
                                            ? 'ליד' 
                                            : item.source === 'PROMOTION_PRIVATE' 
                                              ? 'קידום פרטי' 
                                              : 'קידום מגרש'}
                                        </td>
                                        <td>{item.displayName || item.entityId}</td>
                                        <td>{item.count}</td>
                                        <td>{item.unitPrice.toLocaleString('he-IL')} ₪</td>
                                        <td>
                                          <strong>{item.totalAmount.toLocaleString('he-IL')} ₪</strong>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

