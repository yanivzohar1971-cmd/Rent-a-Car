import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchBillingPeriods, fetchBillingSnapshotsForPeriod } from '../api/adminBillingSnapshotsApi';
import type { BillingSnapshot } from '../types/BillingSnapshot';
import type { SubscriptionPlan } from '../types/UserProfile';
import './AdminRevenuePage.css';

type ViewMode = 'month' | 'quarter' | 'year';

interface RevenueRow {
  sellerId: string;
  sellerType: 'YARD' | 'PRIVATE';
  name: string;
  subscriptionPlan: SubscriptionPlan;
  hasDeal: boolean;
  totalBillableLeads: number;
  totalFixedFees: number;
  totalAmountToCharge: number;
}

export default function AdminRevenuePage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [snapshots, setSnapshots] = useState<BillingSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Load periods list
  useEffect(() => {
    if (!isAdmin) return;

    async function loadPeriods() {
      setError(null); // Clear any previous errors
      try {
        const periodsList = await fetchBillingPeriods();
        setPeriods(periodsList);
        if (periodsList.length > 0 && !selectedPeriod) {
          setSelectedPeriod(periodsList[0]); // Default to latest period
        }
        // If no periods, that's fine - we'll show empty state, not an error
      } catch (err: any) {
        console.error('Error loading periods:', err);
        // Only set error for real failures (permissions, network, etc.)
        setError('אירעה שגיאה בטעינת תקופות החיוב.');
      }
    }

    loadPeriods();
  }, [isAdmin]); // Remove selectedPeriod from dependencies to avoid infinite loop

  // Load snapshots based on selected period and view mode
  useEffect(() => {
    if (!isAdmin || !selectedPeriod) return;

    async function loadSnapshots() {
      setLoading(true);
      setError(null);
      try {
        let periodsToLoad: string[] = [];

        if (viewMode === 'month') {
          periodsToLoad = [selectedPeriod];
        } else if (viewMode === 'quarter') {
          // Load selected period and 2 previous months
          const currentIndex = periods.indexOf(selectedPeriod);
          periodsToLoad = periods.slice(currentIndex, currentIndex + 3);
        } else if (viewMode === 'year') {
          // Load selected period and 11 previous months
          const currentIndex = periods.indexOf(selectedPeriod);
          periodsToLoad = periods.slice(currentIndex, currentIndex + 12);
        }

        // Fetch snapshots for all periods
        // Use Promise.allSettled to handle individual period failures gracefully
        const snapshotResults = await Promise.allSettled(
          periodsToLoad.map((periodId) => fetchBillingSnapshotsForPeriod(periodId))
        );

        // Collect successful results and log failures
        const allSnapshots: BillingSnapshot[] = [];
        snapshotResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            allSnapshots.push(...result.value);
          } else {
            console.warn(`Failed to load snapshots for period ${periodsToLoad[index]}:`, result.reason);
            // Don't treat individual period failures as global error - continue with other periods
          }
        });

        // Flatten array
        setSnapshots(allSnapshots);
        // If we have periods but no snapshots, that's fine - show empty state
      } catch (err: any) {
        console.error('Error loading snapshots:', err);
        // Only set error for real failures (permissions, network, etc.)
        setError('אירעה שגיאה בטעינת נתוני ההכנסות.');
      } finally {
        setLoading(false);
      }
    }

    loadSnapshots();
  }, [isAdmin, selectedPeriod, viewMode, periods]);

  // Calculate KPIs
  const totalRevenue = snapshots.reduce((sum, s) => sum + (s.amountToCharge || 0), 0);
  const totalBillableLeads = snapshots.reduce((sum, s) => sum + (s.billableLeads || 0), 0);
  const totalFixedFees = snapshots.reduce((sum, s) => sum + (s.fixedMonthlyFee || 0), 0);
  const yardsWithPayment = snapshots.filter((s) => s.sellerType === 'YARD' && s.amountToCharge > 0).length;
  const sellersWithPayment = snapshots.filter((s) => s.sellerType === 'PRIVATE' && s.amountToCharge > 0).length;

  // Aggregate revenue rows by entity
  const revenueRows: RevenueRow[] = [];
  const entityMap = new Map<string, RevenueRow>();

  snapshots.forEach((snapshot) => {
    const key = `${snapshot.sellerType}-${snapshot.sellerId}`;
    const existing = entityMap.get(key);

    if (existing) {
      existing.totalBillableLeads += snapshot.billableLeads || 0;
      existing.totalFixedFees += snapshot.fixedMonthlyFee || 0;
      existing.totalAmountToCharge += snapshot.amountToCharge || 0;
      // Update hasDeal if any snapshot has a deal
      if (snapshot.hasCustomDeal || snapshot.billingDealName) {
        existing.hasDeal = true;
      }
    } else {
      const row: RevenueRow = {
        sellerId: snapshot.sellerId,
        sellerType: snapshot.sellerType,
        name: snapshot.name,
        subscriptionPlan: snapshot.subscriptionPlan || 'FREE',
        hasDeal: !!(snapshot.hasCustomDeal || snapshot.billingDealName),
        totalBillableLeads: snapshot.billableLeads || 0,
        totalFixedFees: snapshot.fixedMonthlyFee || 0,
        totalAmountToCharge: snapshot.amountToCharge || 0,
      };
      entityMap.set(key, row);
      revenueRows.push(row);
    }
  });

  // Sort by totalAmountToCharge descending
  revenueRows.sort((a, b) => b.totalAmountToCharge - a.totalAmountToCharge);

  // Get view mode label
  const getViewModeLabel = (mode: ViewMode): string => {
    switch (mode) {
      case 'month':
        return 'חודש נבחר';
      case 'quarter':
        return '3 חודשים אחרונים';
      case 'year':
        return '12 חודשים אחרונים';
    }
  };

  // Get type display name
  const getTypeDisplayName = (type: 'YARD' | 'PRIVATE'): string => {
    return type === 'YARD' ? 'מגרש' : 'מוכר פרטי';
  };

  if (!isAdmin) {
    return (
      <div className="admin-revenue-page">
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
    <div className="admin-revenue-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">דשבורד הכנסות (Admin)</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {/* Controls */}
        <div className="revenue-controls">
          <div className="control-group">
            <label htmlFor="period-selector">תקופה:</label>
            <select
              id="period-selector"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="control-select"
              disabled={periods.length === 0}
            >
              {periods.length === 0 ? (
                <option value="">אין תקופות זמינות</option>
              ) : (
                periods.map((periodId) => (
                  <option key={periodId} value={periodId}>
                    {new Date(periodId + '-01').toLocaleDateString('he-IL', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="control-group">
            <label>מצב צפייה:</label>
            <div className="view-mode-buttons">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                חודש נבחר
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'quarter' ? 'active' : ''}`}
                onClick={() => setViewMode('quarter')}
              >
                3 חודשים אחרונים
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'year' ? 'active' : ''}`}
                onClick={() => setViewMode('year')}
              >
                12 חודשים אחרונים
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="loading-state">
            <p>טוען נתוני חיוב...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
          </div>
        ) : periods.length === 0 ? (
          <div className="empty-state">
            <p>עדיין אין תקופות חיוב סגורות להצגה.</p>
            <p className="empty-state-hint">לא נוצרו עדיין דוחות חיוב. סגור חודש אחד לפחות כדי לראות נתונים.</p>
          </div>
        ) : selectedPeriod && snapshots.length === 0 && !loading ? (
          <div className="empty-state">
            <p>לא נמצאו נתונים לתקופה הנבחרת.</p>
            <p className="empty-state-hint">התקופה נבחרה אך אין snapshots זמינים עבורה.</p>
          </div>
        ) : (
          <>
            {/* Summary KPIs */}
            <div className="revenue-kpis">
              <div className="kpi-card">
                <div className="kpi-value">{totalRevenue.toLocaleString('he-IL')} ₪</div>
                <div className="kpi-label">סה״כ הכנסות</div>
                <div className="kpi-subtitle">{getViewModeLabel(viewMode)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{totalBillableLeads.toLocaleString('he-IL')}</div>
                <div className="kpi-label">סה״כ לידים לחיוב</div>
                <div className="kpi-subtitle">{getViewModeLabel(viewMode)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{totalFixedFees.toLocaleString('he-IL')} ₪</div>
                <div className="kpi-label">סה״כ עמלות חודשיות</div>
                <div className="kpi-subtitle">{getViewModeLabel(viewMode)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{yardsWithPayment}</div>
                <div className="kpi-label">סה״כ מגרשים בתשלום</div>
                <div className="kpi-subtitle">{getViewModeLabel(viewMode)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{sellersWithPayment}</div>
                <div className="kpi-label">סה״כ מוכרים פרטיים בתשלום</div>
                <div className="kpi-subtitle">{getViewModeLabel(viewMode)}</div>
              </div>
            </div>

            {/* Top Customers Table */}
            {revenueRows.length > 0 ? (
              <>
                <div className="revenue-section">
                  <h2 className="section-title">לקוחות מובילים</h2>
                  <div className="table-container desktop-only">
                    <table className="revenue-table">
                      <thead>
                        <tr>
                          <th>שם</th>
                          <th>סוג</th>
                          <th>תכנית</th>
                          <th>דיל</th>
                          <th>סך לידים לחיוב</th>
                          <th>סך עמלות חודשיות</th>
                          <th>סך סכום לחיוב</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueRows.map((row) => (
                          <tr key={`${row.sellerType}-${row.sellerId}`}>
                            <td>
                              <strong>{row.name}</strong>
                            </td>
                            <td>{getTypeDisplayName(row.sellerType)}</td>
                            <td>
                              <span className={`plan-badge plan-${row.subscriptionPlan.toLowerCase()}`}>
                                {row.subscriptionPlan}
                              </span>
                            </td>
                            <td>
                              {row.hasDeal ? (
                                <span className="deal-badge">כן</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{row.totalBillableLeads.toLocaleString('he-IL')}</td>
                            <td>{row.totalFixedFees > 0 ? `${row.totalFixedFees.toLocaleString('he-IL')} ₪` : '—'}</td>
                            <td>
                              <strong>{row.totalAmountToCharge.toLocaleString('he-IL')} ₪</strong>
                            </td>
                            <td>
                              <Link
                                to={`/admin/customers?highlight=${row.sellerId}`}
                                className="btn btn-sm btn-secondary"
                                title="לפרטי לקוח"
                              >
                                פרטים
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="mobile-cards mobile-only">
                    {revenueRows.map((row) => (
                      <div key={`${row.sellerType}-${row.sellerId}`} className="revenue-card">
                        <div className="card-header">
                          <h3>{row.name}</h3>
                          <span className="type-badge">{getTypeDisplayName(row.sellerType)}</span>
                        </div>
                        <div className="card-body">
                          <div className="card-row">
                            <span className="card-label">תכנית:</span>
                            <span className={`plan-badge plan-${row.subscriptionPlan.toLowerCase()}`}>
                              {row.subscriptionPlan}
                            </span>
                          </div>
                          {row.hasDeal && (
                            <div className="card-row">
                              <span className="card-label">דיל:</span>
                              <span className="deal-badge">כן</span>
                            </div>
                          )}
                          <div className="card-row">
                            <span className="card-label">סך לידים לחיוב:</span>
                            <strong>{row.totalBillableLeads.toLocaleString('he-IL')}</strong>
                          </div>
                          {row.totalFixedFees > 0 && (
                            <div className="card-row">
                              <span className="card-label">סך עמלות חודשיות:</span>
                              <strong>{row.totalFixedFees.toLocaleString('he-IL')} ₪</strong>
                            </div>
                          )}
                          <div className="card-row">
                            <span className="card-label">סך סכום לחיוב:</span>
                            <strong>{row.totalAmountToCharge.toLocaleString('he-IL')} ₪</strong>
                          </div>
                          <div className="card-actions" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                            <Link
                              to={`/admin/customers?highlight=${row.sellerId}`}
                              className="btn btn-sm btn-secondary"
                              style={{ width: '100%' }}
                            >
                              לפרטי לקוח
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>לא נמצאו נתונים לתקופה הנבחרת.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

