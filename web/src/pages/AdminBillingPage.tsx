import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin } from '../api/adminYardsApi';
import { fetchAllSellersForAdmin } from '../api/adminSellersApi';
import { fetchLeadMonthlyStatsForYardCurrentMonth, fetchLeadMonthlyStatsForSellerCurrentMonth } from '../api/leadsApi';
import { getEffectivePlanForUser } from '../config/billingConfig';
import { closeBillingPeriod, formatToYYYYMM } from '../api/adminBillingSnapshotsApi';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';
import './AdminBillingPage.css';

interface BillingRow {
  id: string;
  type: 'YARD' | 'PRIVATE';
  name: string;
  subscriptionPlan: SubscriptionPlan;
  monthlyTotal: number;
  freeQuota: number;
  billableLeads: number;
  leadPrice: number;
  fixedMonthlyFee: number;
  amountToCharge: number;
  billingDealName?: string | null;
  hasCustomDeal: boolean;
}

type TypeFilter = 'all' | 'YARD' | 'PRIVATE';

export default function AdminBillingPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [billingRows, setBillingRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [isClosingPeriod, setIsClosingPeriod] = useState(false);
  const [closeSuccessMessage, setCloseSuccessMessage] = useState<string | null>(null);

  // Month selector state (for now, just visual - uses current month under the hood)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Load billing data
  useEffect(() => {
    if (!isAdmin) return;

    async function loadBillingData() {
      setLoading(true);
      setError(null);
      try {
        const rows: BillingRow[] = [];

        // Load yards
        const yards = await fetchAllYardsForAdmin();
        await Promise.all(
          yards.map(async (yard) => {
            try {
              const monthlyStats = await fetchLeadMonthlyStatsForYardCurrentMonth(yard.id);
              
              // Load full user profile to get deal info
              const userDoc = await getDocFromServer(doc(db, 'users', yard.id));
              const userData = userDoc.exists() ? userDoc.data() : {};
              const userProfile: UserProfile = {
                uid: yard.id,
                email: userData.email || '',
                fullName: userData.fullName || '',
                phone: userData.phone || '',
                role: userData.role || null,
                canBuy: userData.canBuy || false,
                canSell: userData.canSell || false,
                isAgent: userData.isAgent || false,
                isYard: userData.isYard || false,
                isAdmin: userData.isAdmin || false,
                status: userData.status || 'ACTIVE',
                primaryRole: userData.primaryRole || null,
                requestedRole: userData.requestedRole || null,
                roleStatus: userData.roleStatus || null,
                subscriptionPlan: userData.subscriptionPlan || 'FREE',
                billingDealName: userData.billingDealName || null,
                billingDealValidUntil: userData.billingDealValidUntil || null,
                customFreeMonthlyLeadQuota: userData.customFreeMonthlyLeadQuota || null,
                customLeadPrice: userData.customLeadPrice || null,
                customFixedMonthlyFee: userData.customFixedMonthlyFee || null,
                customCurrency: userData.customCurrency || null,
              };

              // Get effective plan
              const effectivePlan = await getEffectivePlanForUser(userProfile);
              
              // Determine effective values (considering deal overrides)
              const freeQuota = userProfile.customFreeMonthlyLeadQuota ?? effectivePlan?.freeMonthlyLeadQuota ?? 0;
              const leadPrice = userProfile.customLeadPrice ?? effectivePlan?.leadPrice ?? 0;
              const fixedMonthlyFee = userProfile.customFixedMonthlyFee ?? effectivePlan?.fixedMonthlyFee ?? 0;
              const billableLeads = Math.max(0, monthlyStats.total - freeQuota);
              const amountToCharge = (billableLeads * leadPrice) + fixedMonthlyFee;
              const hasCustomDeal = !!(userProfile.billingDealName || userProfile.customFreeMonthlyLeadQuota || userProfile.customLeadPrice || userProfile.customFixedMonthlyFee);

              rows.push({
                id: yard.id,
                type: 'YARD',
                name: yard.name,
                subscriptionPlan: userProfile.subscriptionPlan || 'FREE',
                monthlyTotal: monthlyStats.total,
                freeQuota,
                billableLeads,
                leadPrice,
                fixedMonthlyFee,
                amountToCharge,
                billingDealName: userProfile.billingDealName,
                hasCustomDeal,
              });
            } catch (err) {
              console.error(`Error loading stats for yard ${yard.id}:`, err);
            }
          })
        );

        // Load private sellers
        const sellers = await fetchAllSellersForAdmin();
        await Promise.all(
          sellers.map(async (seller) => {
            try {
              const monthlyStats = await fetchLeadMonthlyStatsForSellerCurrentMonth(seller.id);
              
              // Load full user profile to get deal info
              const userDoc = await getDocFromServer(doc(db, 'users', seller.id));
              const userData = userDoc.exists() ? userDoc.data() : {};
              const userProfile: UserProfile = {
                uid: seller.id,
                email: userData.email || '',
                fullName: userData.fullName || '',
                phone: userData.phone || '',
                role: userData.role || null,
                canBuy: userData.canBuy || false,
                canSell: userData.canSell || false,
                isAgent: userData.isAgent || false,
                isYard: userData.isYard || false,
                isAdmin: userData.isAdmin || false,
                status: userData.status || 'ACTIVE',
                primaryRole: userData.primaryRole || null,
                requestedRole: userData.requestedRole || null,
                roleStatus: userData.roleStatus || null,
                subscriptionPlan: userData.subscriptionPlan || 'FREE',
                billingDealName: userData.billingDealName || null,
                billingDealValidUntil: userData.billingDealValidUntil || null,
                customFreeMonthlyLeadQuota: userData.customFreeMonthlyLeadQuota || null,
                customLeadPrice: userData.customLeadPrice || null,
                customFixedMonthlyFee: userData.customFixedMonthlyFee || null,
                customCurrency: userData.customCurrency || null,
              };

              // Get effective plan
              const effectivePlan = await getEffectivePlanForUser(userProfile);
              
              // Determine effective values (considering deal overrides)
              const freeQuota = userProfile.customFreeMonthlyLeadQuota ?? effectivePlan?.freeMonthlyLeadQuota ?? 0;
              const leadPrice = userProfile.customLeadPrice ?? effectivePlan?.leadPrice ?? 0;
              const fixedMonthlyFee = userProfile.customFixedMonthlyFee ?? effectivePlan?.fixedMonthlyFee ?? 0;
              const billableLeads = Math.max(0, monthlyStats.total - freeQuota);
              const amountToCharge = (billableLeads * leadPrice) + fixedMonthlyFee;
              const hasCustomDeal = !!(userProfile.billingDealName || userProfile.customFreeMonthlyLeadQuota || userProfile.customLeadPrice || userProfile.customFixedMonthlyFee);

              rows.push({
                id: seller.id,
                type: 'PRIVATE',
                name: seller.displayName || seller.email || 'מוכר ללא שם',
                subscriptionPlan: userProfile.subscriptionPlan || 'FREE',
                monthlyTotal: monthlyStats.total,
                freeQuota,
                billableLeads,
                leadPrice,
                fixedMonthlyFee,
                amountToCharge,
                billingDealName: userProfile.billingDealName,
                hasCustomDeal,
              });
            } catch (err) {
              console.error(`Error loading stats for seller ${seller.id}:`, err);
            }
          })
        );

        setBillingRows(rows);
      } catch (err: any) {
        console.error('Error loading billing data:', err);
        setError('אירעה שגיאה בטעינת נתוני החיוב.');
      } finally {
        setLoading(false);
      }
    }

    loadBillingData();
  }, [isAdmin]);

  // Filter rows by type
  const filteredRows = billingRows.filter((row) => {
    if (typeFilter === 'all') return true;
    return row.type === typeFilter;
  });

  // Get plan display name
  const getPlanDisplayName = (plan: SubscriptionPlan): string => {
    switch (plan) {
      case 'FREE':
        return 'חינם';
      case 'PLUS':
        return 'פלוס';
      case 'PRO':
        return 'פרו';
      default:
        return plan;
    }
  };

  // Get type display name
  const getTypeDisplayName = (type: 'YARD' | 'PRIVATE'): string => {
    return type === 'YARD' ? 'מגרש' : 'מוכר פרטי';
  };

  // Generate CSV content from billing rows
  const generateCSV = (rows: BillingRow[], month: string): string => {
    // CSV headers
    const headers = [
      'billingMonth',
      'sellerType',
      'userId',
      'displayName',
      'plan',
      'billingDealName',
      'monthlyTotal',
      'freeQuota',
      'billableLeads',
      'leadPrice',
      'fixedMonthlyFee',
      'amountToCharge',
    ];

    // Create CSV rows
    const csvRows = [headers.join(',')];

    // Add data rows
    rows.forEach((row) => {
      const csvRow = [
        month, // billingMonth
        row.type, // sellerType
        row.id, // userId
        `"${row.name.replace(/"/g, '""')}"`, // displayName (escape quotes)
        row.subscriptionPlan, // plan
        row.billingDealName ? `"${row.billingDealName.replace(/"/g, '""')}"` : '', // billingDealName
        row.monthlyTotal.toString(), // monthlyTotal
        row.freeQuota.toString(), // freeQuota
        row.billableLeads.toString(), // billableLeads
        row.leadPrice.toString(), // leadPrice
        row.fixedMonthlyFee.toString(), // fixedMonthlyFee
        row.amountToCharge.toString(), // amountToCharge
      ];
      csvRows.push(csvRow.join(','));
    });

    return csvRows.join('\n');
  };

  // Handle closing billing period
  const handleClosePeriod = async () => {
    if (!window.confirm('האם לסגור את החודש הקודם וליצור דוח חיוב? פעולה זו תצור snapshot של כל המגרשים והמוכרים.')) {
      return;
    }

    setIsClosingPeriod(true);
    setCloseSuccessMessage(null);
    setError(null);

    try {
      // Get last month (not current month)
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodId = formatToYYYYMM(lastMonth);

      await closeBillingPeriod(periodId);
      setCloseSuccessMessage(`דוח החיוב לחודש ${periodId} נסגר ונשמר.`);
    } catch (err: any) {
      console.error('Error closing period:', err);
      setError('אירעה שגיאה בסגירת תקופת החיוב.');
    } finally {
      setIsClosingPeriod(false);
    }
  };

  // Handle CSV export
  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      // Still allow export even if empty - CSV will contain only header
      const csvContent = generateCSV([], selectedMonth);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `billing-${selectedMonth}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const csvContent = generateCSV(filteredRows, selectedMonth);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `billing-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className="admin-billing-page">
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
    <div className="admin-billing-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">דוח חיוב חודשי (Admin)</h1>
          <div className="header-actions">
            <button
              type="button"
              className="btn btn-primary close-period-btn"
              onClick={handleClosePeriod}
              disabled={isClosingPeriod}
            >
              {isClosingPeriod ? 'סוגר תקופה...' : 'סגור חודש נוכחי (יצירת דוח חיוב)'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/account')}
            >
              חזרה לאזור האישי
            </button>
          </div>
        </div>

        {closeSuccessMessage && (
          <div className="success-message">
            {closeSuccessMessage}
          </div>
        )}

        {/* Filters */}
        <div className="billing-filters">
          <div className="filter-group">
            <label htmlFor="month-selector">חודש:</label>
            <select
              id="month-selector"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="filter-select"
            >
              {/* For now, just show current month - later can extend to support date ranges */}
              <option value={selectedMonth}>
                {new Date(selectedMonth + '-01').toLocaleDateString('he-IL', {
                  year: 'numeric',
                  month: 'long',
                })}
              </option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="type-filter">סוג:</label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="filter-select"
            >
              <option value="all">הכל</option>
              <option value="YARD">מגרשים</option>
              <option value="PRIVATE">מוכרים פרטיים</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="billing-content">
          {loading ? (
            <div className="loading-state">
              <p>טוען נתוני חיוב...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Export CSV Button */}
              <div className="export-section">
                <button
                  type="button"
                  className="btn btn-primary export-csv-btn"
                  onClick={handleExportCSV}
                  disabled={loading}
                >
                  יצוא CSV לחודש הנבחר
                </button>
                {filteredRows.length === 0 && (
                  <p className="export-note">אין נתונים ליצוא</p>
                )}
              </div>

              {filteredRows.length === 0 ? (
                <div className="empty-state">
                  <p>לא נמצאו נתונים להצגה לחודש הנבחר.</p>
                  <p className="empty-state-hint">נסה לשנות את הסינון או לבדוק חודש אחר.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="table-container desktop-only">
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>שם</th>
                      <th>סוג</th>
                      <th>תכנית</th>
                      <th>דיל</th>
                      <th>לידים בחודש</th>
                      <th>מכסה בחינם</th>
                      <th>לידים לחיוב</th>
                      <th>מחיר לליד</th>
                      <th>עמלה חודשית</th>
                      <th>סכום לחיוב</th>
                      <th>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={`${row.type}-${row.id}`}
                        className={row.billableLeads > 0 ? 'has-billable' : ''}
                      >
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td>{getTypeDisplayName(row.type)}</td>
                        <td>
                          <span className={`plan-badge plan-${row.subscriptionPlan.toLowerCase()}`}>
                            {getPlanDisplayName(row.subscriptionPlan)}
                          </span>
                        </td>
                        <td>
                          {row.billingDealName ? (
                            <span className="deal-badge" title="דיל מותאם">{row.billingDealName}</span>
                          ) : row.hasCustomDeal ? (
                            <span className="deal-badge" title="דיל מותאם">דיל מותאם</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <strong>{row.monthlyTotal}</strong>
                        </td>
                        <td>{row.freeQuota}</td>
                        <td>
                          {row.billableLeads > 0 ? (
                            <span className="billable-badge">{row.billableLeads}</span>
                          ) : (
                            <span className="no-billable">0</span>
                          )}
                        </td>
                        <td>{row.leadPrice} ₪</td>
                        <td>{row.fixedMonthlyFee > 0 ? `${row.fixedMonthlyFee.toLocaleString('he-IL')} ₪` : '—'}</td>
                        <td>
                          <strong>{row.amountToCharge.toLocaleString('he-IL')} ₪</strong>
                        </td>
                        <td>
                          <Link
                            to={`/admin/customers?highlight=${row.id}`}
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
                {filteredRows.map((row) => (
                  <div
                    key={`${row.type}-${row.id}`}
                    className={`billing-card ${row.billableLeads > 0 ? 'has-billable' : ''}`}
                  >
                    <div className="card-header">
                      <h3>{row.name}</h3>
                      <span className="type-badge">{getTypeDisplayName(row.type)}</span>
                    </div>
                    <div className="card-body">
                      <div className="card-row">
                        <span className="card-label">תכנית:</span>
                        <span className={`plan-badge plan-${row.subscriptionPlan.toLowerCase()}`}>
                          {getPlanDisplayName(row.subscriptionPlan)}
                        </span>
                      </div>
                      {row.billingDealName || row.hasCustomDeal ? (
                        <div className="card-row">
                          <span className="card-label">דיל:</span>
                          <span className="deal-badge">
                            {row.billingDealName || 'דיל מותאם'}
                          </span>
                        </div>
                      ) : null}
                      <div className="card-row">
                        <span className="card-label">לידים בחודש:</span>
                        <strong>{row.monthlyTotal}</strong>
                      </div>
                      <div className="card-row">
                        <span className="card-label">מכסה בחינם:</span>
                        <span>{row.freeQuota}</span>
                      </div>
                      <div className="card-row">
                        <span className="card-label">לידים לחיוב:</span>
                        {row.billableLeads > 0 ? (
                          <span className="billable-badge">{row.billableLeads}</span>
                        ) : (
                          <span className="no-billable">0</span>
                        )}
                      </div>
                      <div className="card-row">
                        <span className="card-label">מחיר לליד:</span>
                        <span>{row.leadPrice} ₪</span>
                      </div>
                      {row.fixedMonthlyFee > 0 && (
                        <div className="card-row">
                          <span className="card-label">עמלה חודשית:</span>
                          <span>{row.fixedMonthlyFee.toLocaleString('he-IL')} ₪</span>
                        </div>
                      )}
                      <div className="card-row">
                        <span className="card-label">סכום לחיוב:</span>
                        <strong>{row.amountToCharge.toLocaleString('he-IL')} ₪</strong>
                      </div>
                      <div className="card-actions" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                        <Link
                          to={`/admin/customers?highlight=${row.id}`}
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
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

