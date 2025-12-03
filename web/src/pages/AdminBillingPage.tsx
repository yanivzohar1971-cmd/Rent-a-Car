import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin } from '../api/adminYardsApi';
import { fetchAllSellersForAdmin } from '../api/adminSellersApi';
import { fetchLeadMonthlyStatsForYardCurrentMonth, fetchLeadMonthlyStatsForSellerCurrentMonth } from '../api/leadsApi';
import { getFreeMonthlyLeadQuota } from '../config/billingConfig';
import type { SubscriptionPlan } from '../types/UserProfile';
import './AdminBillingPage.css';

interface BillingRow {
  id: string;
  type: 'YARD' | 'PRIVATE';
  name: string;
  subscriptionPlan: SubscriptionPlan;
  monthlyTotal: number;
  freeQuota: number;
  billableLeads: number;
}

type TypeFilter = 'all' | 'YARD' | 'PRIVATE';

export default function AdminBillingPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [billingRows, setBillingRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

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
              const plan = yard.subscriptionPlan ?? 'FREE';
              const freeQuota = getFreeMonthlyLeadQuota('YARD', plan);
              const billableLeads = Math.max(0, monthlyStats.total - freeQuota);

              rows.push({
                id: yard.id,
                type: 'YARD',
                name: yard.name,
                subscriptionPlan: plan,
                monthlyTotal: monthlyStats.total,
                freeQuota,
                billableLeads,
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
              const plan = seller.subscriptionPlan ?? 'FREE';
              const freeQuota = getFreeMonthlyLeadQuota('PRIVATE', plan);
              const billableLeads = Math.max(0, monthlyStats.total - freeQuota);

              rows.push({
                id: seller.id,
                type: 'PRIVATE',
                name: seller.displayName || seller.email || 'מוכר ללא שם',
                subscriptionPlan: plan,
                monthlyTotal: monthlyStats.total,
                freeQuota,
                billableLeads,
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

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
          ) : filteredRows.length === 0 ? (
            <div className="empty-state">
              <p>לא נמצאו נתונים להצגה.</p>
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
                      <th>לידים בחודש</th>
                      <th>מכסה בחינם</th>
                      <th>לידים לחיוב</th>
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

