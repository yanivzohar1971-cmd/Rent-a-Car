/**
 * Admin Revenue Dashboard
 * Real-time revenue aggregation from leads and promotion orders
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPromotionRevenueByMonth, getYardLeadsBillingForMonth } from '../api/adminRevenueApi';
import type { PromotionRevenueSummary, YardLeadBillingRow } from '../api/adminRevenueApi';
import './AdminRevenueDashboardPage.css';

type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR' | 'CUSTOM';
type ViewTab = 'PROMOTION_REVENUE' | 'YARD_LEADS_BILLING';

export default function AdminRevenueDashboardPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  // Active tab
  const [activeTab, setActiveTab] = useState<ViewTab>('PROMOTION_REVENUE');

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
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Data - Promotion Revenue
  const [promotionRevenue, setPromotionRevenue] = useState<PromotionRevenueSummary[]>([]);
  const [promotionRevenueLoading, setPromotionRevenueLoading] = useState(false);
  
  // Data - Yard Leads Billing
  const [yardLeadsBilling, setYardLeadsBilling] = useState<YardLeadBillingRow[]>([]);
  const [yardLeadsBillingLoading, setYardLeadsBillingLoading] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Get month keys from date range
  const getMonthKeysFromRange = (start: Date, end: Date): string[] => {
    const months: string[] = [];
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    
    while (current <= endMonth) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
      current = new Date(year, current.getMonth() + 1, 1);
    }
    
    return months;
  };

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
        setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`);
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
    
    // Update selected month for yard leads billing
    if (datePreset === 'THIS_MONTH' || datePreset === 'LAST_MONTH') {
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + (datePreset === 'THIS_MONTH' ? 1 : 0)).padStart(2, '0')}`;
      setSelectedMonth(monthKey);
    }
  }, [datePreset]);

  // Load promotion revenue data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'PROMOTION_REVENUE') return;

    async function loadPromotionRevenue() {
      setPromotionRevenueLoading(true);
      setError(null);

      try {
        // Get month keys from date range
        const monthKeys = getMonthKeysFromRange(startDate, endDate);
        if (monthKeys.length === 0) {
          setPromotionRevenue([]);
          return;
        }

        const fromMonth = monthKeys[0];
        const toMonth = monthKeys[monthKeys.length - 1];
        
        const data = await getPromotionRevenueByMonth(fromMonth, toMonth);
        setPromotionRevenue(data);
      } catch (err: any) {
        console.error('Error loading promotion revenue:', err);
        setError('שגיאה בטעינת נתוני הכנסות מקידומי מבצעים');
      } finally {
        setPromotionRevenueLoading(false);
      }
    }

    loadPromotionRevenue();
  }, [isAdmin, activeTab, startDate, endDate]);

  // Load yard leads billing data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'YARD_LEADS_BILLING') return;

    async function loadYardLeadsBilling() {
      setYardLeadsBillingLoading(true);
      setError(null);

      try {
        const data = await getYardLeadsBillingForMonth(selectedMonth);
        setYardLeadsBilling(data);
      } catch (err: any) {
        console.error('Error loading yard leads billing:', err);
        setError('שגיאה בטעינת נתוני בילינג לפי לידים למגרשים');
      } finally {
        setYardLeadsBillingLoading(false);
      }
    }

    loadYardLeadsBilling();
  }, [isAdmin, activeTab, selectedMonth]);


  // Export yard leads billing to CSV
  const handleExportYardLeadsBillingCSV = () => {
    const csvRows: string[] = [];

    // CSV Header
    csvRows.push([
      'month',
      'yardId',
      'yardName',
      'subscriptionPlan',
      'totalLeads',
      'freeLeads',
      'billableLeads',
    ].join(','));

    // CSV Data
    yardLeadsBilling.forEach((row) => {
      csvRows.push([
        row.month,
        row.yardId,
        row.yardName || '',
        row.subscriptionPlan,
        String(row.totalLeads),
        String(row.freeLeads),
        String(row.billableLeads),
      ].join(','));
    });

    // Create and download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Hebrew
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `revenue_billing_${selectedMonth}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Format month label
  const formatMonthLabel = (monthKey: string): string => {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthNames = [
      'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
      'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
    ];
    return `${monthNames[month - 1]} ${year}`;
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

  // Calculate promotion revenue summary stats
  const promotionRevenueStats = useMemo(() => {
    const totalRevenue = promotionRevenue.reduce((sum, r) => sum + r.totalAmountIls, 0);
    const totalOrders = promotionRevenue.reduce((sum, r) => sum + r.totalOrders, 0);
    const totalFromCar = promotionRevenue.reduce((sum, r) => sum + r.byScope.CAR, 0);
    const totalFromYard = promotionRevenue.reduce((sum, r) => sum + r.byScope.YARD, 0);
    return { totalRevenue, totalOrders, totalFromCar, totalFromYard };
  }, [promotionRevenue]);

  // Calculate yard leads billing summary stats
  const yardLeadsBillingStats = useMemo(() => {
    const totalYardsWithBillable = yardLeadsBilling.filter((r) => r.billableLeads > 0).length;
    const totalBillableLeads = yardLeadsBilling.reduce((sum, r) => sum + r.billableLeads, 0);
    return { totalYardsWithBillable, totalBillableLeads };
  }, [yardLeadsBilling]);

  return (
    <div className="admin-revenue-dashboard-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">דשבורד הכנסות</h1>
          <div className="header-actions">
            {activeTab === 'YARD_LEADS_BILLING' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExportYardLeadsBillingCSV}
                disabled={yardLeadsBillingLoading || yardLeadsBilling.length === 0}
              >
                ייצוא CSV לחיוב חודשי
              </button>
            )}
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

        {/* Tabs */}
        <div className="revenue-tabs">
          <button
            type="button"
            className={`revenue-tab ${activeTab === 'PROMOTION_REVENUE' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('PROMOTION_REVENUE');
            }}
          >
            הכנסות מקידומי מבצעים
          </button>
          <button
            type="button"
            className={`revenue-tab ${activeTab === 'YARD_LEADS_BILLING' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('YARD_LEADS_BILLING');
            }}
          >
            בילינג לפי לידים למגרשים
          </button>
        </div>

        {/* Filters */}
        <div className="revenue-filters">
          {activeTab === 'PROMOTION_REVENUE' ? (
            <>
              <div className="filter-group">
                <label htmlFor="date-preset">תקופת זמן:</label>
                <select
                  id="date-preset"
                  value={datePreset}
                  onChange={(e) => {
                    setError(null);
                    setDatePreset(e.target.value as DatePreset);
                  }}
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
                    <label htmlFor="start-month">חודש התחלה (YYYY-MM):</label>
                    <input
                      id="start-month"
                      type="month"
                      value={`${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [year, month] = e.target.value.split('-');
                        setStartDate(new Date(Number(year), Number(month) - 1, 1));
                      }}
                      className="form-input"
                    />
                  </div>
                  <div className="filter-group">
                    <label htmlFor="end-month">חודש סיום (YYYY-MM):</label>
                    <input
                      id="end-month"
                      type="month"
                      value={`${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [year, month] = e.target.value.split('-');
                        setEndDate(new Date(Number(year), Number(month), 0, 23, 59, 59));
                      }}
                      className="form-input"
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="filter-group">
              <label htmlFor="month-selector">חודש:</label>
              <input
                id="month-selector"
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setError(null);
                  setSelectedMonth(e.target.value);
                }}
                className="form-input"
              />
            </div>
          )}
        </div>

        {/* Promotion Revenue View */}
        {activeTab === 'PROMOTION_REVENUE' && (
          <>
            {promotionRevenueLoading ? (
              <div className="loading-state">
                <p>טוען נתוני הכנסות מקידומי מבצעים...</p>
              </div>
            ) : promotionRevenue.length === 0 ? (
              <div className="empty-state">
                <p>לא נמצאו נתוני הכנסות מקידומי מבצעים בתקופה הנבחרת</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="revenue-summary-cards">
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {promotionRevenueStats.totalRevenue.toLocaleString('he-IL')} ₪
                    </div>
                    <div className="summary-card-label">סה״כ הכנסות</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {promotionRevenueStats.totalOrders.toLocaleString('he-IL')}
                    </div>
                    <div className="summary-card-label">סה״כ הזמנות בתשלום</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {promotionRevenueStats.totalFromCar.toLocaleString('he-IL')} ₪
                    </div>
                    <div className="summary-card-label">הכנסות מקידומי רכבים</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {promotionRevenueStats.totalFromYard.toLocaleString('he-IL')} ₪
                    </div>
                    <div className="summary-card-label">הכנסות מקידומי מגרשים</div>
                  </div>
                </div>

                {/* Monthly Breakdown Table */}
                <div className="revenue-table-container">
                  <h2 className="section-title">פירוט הכנסות לפי חודש</h2>
                  <table className="revenue-table">
                    <thead>
                      <tr>
                        <th>חודש</th>
                        <th>סה״כ הכנסות (₪)</th>
                        <th>מספר הזמנות</th>
                        <th>הכנסות מרכבים (₪)</th>
                        <th>הכנסות ממגרשים (₪)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotionRevenue.map((summary) => (
                        <tr key={summary.periodKey}>
                          <td>{formatMonthLabel(summary.periodKey)}</td>
                          <td>
                            <strong>{summary.totalAmountIls.toLocaleString('he-IL')} ₪</strong>
                          </td>
                          <td>{summary.totalOrders}</td>
                          <td>{summary.byScope.CAR.toLocaleString('he-IL')} ₪</td>
                          <td>{summary.byScope.YARD.toLocaleString('he-IL')} ₪</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* Yard Leads Billing View */}
        {activeTab === 'YARD_LEADS_BILLING' && (
          <>
            {yardLeadsBillingLoading ? (
              <div className="loading-state">
                <p>טוען נתוני בילינג לפי לידים למגרשים...</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="revenue-summary-cards">
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {yardLeadsBillingStats.totalYardsWithBillable}
                    </div>
                    <div className="summary-card-label">מגרשים עם לידים לחיוב</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-card-value">
                      {yardLeadsBillingStats.totalBillableLeads.toLocaleString('he-IL')}
                    </div>
                    <div className="summary-card-label">סה״כ לידים לחיוב</div>
                  </div>
                </div>

                {/* Yard Leads Billing Table */}
                <div className="revenue-table-container">
                  <h2 className="section-title">בילינג לפי לידים למגרשים - {formatMonthLabel(selectedMonth)}</h2>
                  <table className="revenue-table">
                    <thead>
                      <tr>
                        <th>שם מגרש</th>
                        <th>תכנית מנוי</th>
                        <th>סה״כ לידים</th>
                        <th>לידים חינם</th>
                        <th>לידים לחיוב</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yardLeadsBilling.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                            לא נמצאו נתונים לחודש הנבחר
                          </td>
                        </tr>
                      ) : (
                        yardLeadsBilling.map((row) => (
                          <tr key={row.yardId}>
                            <td>{row.yardName || row.yardId}</td>
                            <td>
                              <span className={`plan-badge plan-${row.subscriptionPlan.toLowerCase()}`}>
                                {row.subscriptionPlan}
                              </span>
                            </td>
                            <td>{row.totalLeads}</td>
                            <td>{row.freeLeads}</td>
                            <td>
                              <strong>{row.billableLeads}</strong>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

