import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin, type AdminYardSummary } from '../api/adminYardsApi';
import { fetchAllSellersForAdmin, type AdminSellerSummary } from '../api/adminSellersApi';
import { adminUpdateUserSubscriptionPlan } from '../api/adminUsersApi';
import {
  fetchBillingPlansByRole,
  createBillingPlan,
  updateBillingPlan,
  setDefaultBillingPlan,
} from '../api/adminBillingPlansApi';
import type { SubscriptionPlan } from '../types/UserProfile';
import type { BillingPlan, BillingPlanRole } from '../types/BillingPlan';
import './AdminPlansPage.css';

type TabType = 'yards' | 'sellers' | 'agents' | 'plans-yards' | 'plans-agents' | 'plans-sellers';

export default function AdminPlansPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('plans-yards');

  // Billing Plans state
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<BillingPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [currentPlanRole, setCurrentPlanRole] = useState<BillingPlanRole>('YARD');

  // Yards state
  const [yards, setYards] = useState<AdminYardSummary[]>([]);
  const [yardsLoading, setYardsLoading] = useState(false);
  const [yardsError, setYardsError] = useState<string | null>(null);
  const [updatingYardId, setUpdatingYardId] = useState<string | null>(null);
  const [yardUpdateErrors, setYardUpdateErrors] = useState<Record<string, string>>({});

  // Sellers state
  const [sellers, setSellers] = useState<AdminSellerSummary[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);
  const [updatingSellerId, setUpdatingSellerId] = useState<string | null>(null);
  const [sellerUpdateErrors, setSellerUpdateErrors] = useState<Record<string, string>>({});

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Load yards
  useEffect(() => {
    if (!isAdmin) return;

    async function loadYards() {
      setYardsLoading(true);
      setYardsError(null);
      try {
        const yardsList = await fetchAllYardsForAdmin();
        setYards(yardsList);
      } catch (err: any) {
        console.error('Error loading yards:', err);
        setYardsError('אירעה שגיאה בטעינת המגרשים. נסה שוב מאוחר יותר.');
      } finally {
        setYardsLoading(false);
      }
    }

    if (activeTab === 'yards') {
      loadYards();
    }
  }, [isAdmin, activeTab]);

  // Load sellers
  useEffect(() => {
    if (!isAdmin) return;

    async function loadSellers() {
      setSellersLoading(true);
      setSellersError(null);
      try {
        const sellersList = await fetchAllSellersForAdmin();
        setSellers(sellersList);
      } catch (err: any) {
        console.error('Error loading sellers:', err);
        setSellersError('אירעה שגיאה בטעינת המוכרים הפרטיים. נסה שוב מאוחר יותר.');
      } finally {
        setSellersLoading(false);
      }
    }

    if (activeTab === 'sellers') {
      loadSellers();
    }
  }, [isAdmin, activeTab]);

  // Load billing plans
  useEffect(() => {
    if (!isAdmin) return;

    async function loadPlans() {
      if (!activeTab.startsWith('plans-')) return;

      setPlansLoading(true);
      setPlansError(null);
      try {
        const role: BillingPlanRole =
          activeTab === 'plans-yards'
            ? 'YARD'
            : activeTab === 'plans-agents'
            ? 'AGENT'
            : 'PRIVATE_SELLER';
        const plansList = await fetchBillingPlansByRole(role);
        setBillingPlans(plansList);
        setCurrentPlanRole(role);
      } catch (err: any) {
        console.error('Error loading billing plans:', err);
        setPlansError('אירעה שגיאה בטעינת החבילות. נסה שוב מאוחר יותר.');
      } finally {
        setPlansLoading(false);
      }
    }

    loadPlans();
  }, [isAdmin, activeTab]);

  const getPlanLabel = (plan: SubscriptionPlan | undefined): string => {
    switch (plan) {
      case 'FREE':
        return 'חינם';
      case 'PLUS':
        return 'פלוס';
      case 'PRO':
        return 'פרו';
      default:
        return 'חינם';
    }
  };

  const handleYardPlanChange = async (yardId: string, newPlan: SubscriptionPlan) => {
    const yard = yards.find((y) => y.id === yardId);
    const previousPlan = yard?.subscriptionPlan || 'FREE';

    // Optimistic update
    setYards((prev) =>
      prev.map((y) => (y.id === yardId ? { ...y, subscriptionPlan: newPlan } : y))
    );
    setUpdatingYardId(yardId);
    setYardUpdateErrors((prev) => {
      const next = { ...prev };
      delete next[yardId];
      return next;
    });

    try {
      await adminUpdateUserSubscriptionPlan(yardId, newPlan);
    } catch (err: any) {
      console.error('Error updating yard plan:', err);
      // Revert optimistic update
      setYards((prev) =>
        prev.map((y) => (y.id === yardId ? { ...y, subscriptionPlan: previousPlan as SubscriptionPlan } : y))
      );
      setYardUpdateErrors((prev) => ({
        ...prev,
        [yardId]: 'אירעה שגיאה בעדכון התכנית. נסה שוב.',
      }));
    } finally {
      setUpdatingYardId(null);
    }
  };

  const handleSellerPlanChange = async (sellerId: string, newPlan: SubscriptionPlan) => {
    const seller = sellers.find((s) => s.id === sellerId);
    const previousPlan = seller?.subscriptionPlan || 'FREE';

    // Optimistic update
    setSellers((prev) =>
      prev.map((s) => (s.id === sellerId ? { ...s, subscriptionPlan: newPlan } : s))
    );
    setUpdatingSellerId(sellerId);
    setSellerUpdateErrors((prev) => {
      const next = { ...prev };
      delete next[sellerId];
      return next;
    });

    try {
      await adminUpdateUserSubscriptionPlan(sellerId, newPlan);
    } catch (err: any) {
      console.error('Error updating seller plan:', err);
      // Revert optimistic update
      setSellers((prev) =>
        prev.map((s) => (s.id === sellerId ? { ...s, subscriptionPlan: previousPlan as SubscriptionPlan } : s))
      );
      setSellerUpdateErrors((prev) => ({
        ...prev,
        [sellerId]: 'אירעה שגיאה בעדכון התכנית. נסה שוב.',
      }));
    } finally {
      setUpdatingSellerId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-plans-page">
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
    <div className="admin-plans-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול חבילות ותכניות (Admin)</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            type="button"
            className={`tab-button ${activeTab === 'yards' ? 'active' : ''}`}
            onClick={() => setActiveTab('yards')}
          >
            מגרשים
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'sellers' ? 'active' : ''}`}
            onClick={() => setActiveTab('sellers')}
          >
            מוכרים פרטיים
          </button>
        </div>

        {/* Yards Tab */}
        {activeTab === 'yards' && (
          <div className="tab-content">
            {yardsLoading ? (
              <div className="loading-state">
                <p>טוען מגרשים...</p>
              </div>
            ) : yardsError ? (
              <div className="error-state">
                <p>{yardsError}</p>
              </div>
            ) : yards.length === 0 ? (
              <div className="empty-state">
                <p>לא נמצאו מגרשים להצגה.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="admin-plans-table">
                  <thead>
                    <tr>
                      <th>מגרש</th>
                      <th>איש קשר</th>
                      <th>טלפון</th>
                      <th>תכנית נוכחית</th>
                      <th>עדכון תכנית</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yards.map((yard) => {
                      const currentPlan = yard.subscriptionPlan || 'FREE';
                      return (
                        <tr key={yard.id}>
                          <td>
                            <strong>{yard.name}</strong>
                          </td>
                          <td>{yard.contactName || '-'}</td>
                          <td>{yard.contactPhone || '-'}</td>
                          <td>
                            <span className="plan-badge plan-badge-current">
                              {getPlanLabel(currentPlan)}
                            </span>
                          </td>
                          <td>
                            <select
                              className="plan-select"
                              value={currentPlan}
                              onChange={(e) =>
                                handleYardPlanChange(yard.id, e.target.value as SubscriptionPlan)
                              }
                              disabled={updatingYardId === yard.id}
                            >
                              <option value="FREE">חינם</option>
                              <option value="PLUS">פלוס</option>
                              <option value="PRO">פרו</option>
                            </select>
                            {updatingYardId === yard.id && (
                              <span className="updating-indicator">מעדכן...</span>
                            )}
                            {yardUpdateErrors[yard.id] && (
                              <div className="inline-error">{yardUpdateErrors[yard.id]}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sellers Tab */}
        {activeTab === 'sellers' && (
          <div className="tab-content">
            {sellersLoading ? (
              <div className="loading-state">
                <p>טוען מוכרים פרטיים...</p>
              </div>
            ) : sellersError ? (
              <div className="error-state">
                <p>{sellersError}</p>
              </div>
            ) : sellers.length === 0 ? (
              <div className="empty-state">
                <p>לא נמצאו מוכרים פרטיים להצגה.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="admin-plans-table">
                  <thead>
                    <tr>
                      <th>מוכר</th>
                      <th>אימייל</th>
                      <th>תכנית נוכחית</th>
                      <th>עדכון תכנית</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((seller) => {
                      const currentPlan = seller.subscriptionPlan || 'FREE';
                      return (
                        <tr key={seller.id}>
                          <td>
                            <strong>{seller.displayName || seller.email || 'ללא שם'}</strong>
                          </td>
                          <td>{seller.email || '-'}</td>
                          <td>
                            <span className="plan-badge plan-badge-current">
                              {getPlanLabel(currentPlan)}
                            </span>
                          </td>
                          <td>
                            <select
                              className="plan-select"
                              value={currentPlan}
                              onChange={(e) =>
                                handleSellerPlanChange(seller.id, e.target.value as SubscriptionPlan)
                              }
                              disabled={updatingSellerId === seller.id}
                            >
                              <option value="FREE">חינם</option>
                              <option value="PLUS">פלוס</option>
                              <option value="PRO">פרו</option>
                            </select>
                            {updatingSellerId === seller.id && (
                              <span className="updating-indicator">מעדכן...</span>
                            )}
                            {sellerUpdateErrors[seller.id] && (
                              <div className="inline-error">{sellerUpdateErrors[seller.id]}</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Billing Plans Tabs */}
        {(activeTab === 'plans-yards' || activeTab === 'plans-agents' || activeTab === 'plans-sellers') && (
          <div className="tab-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>
                {currentPlanRole === 'YARD'
                  ? 'חבילות למגרשים'
                  : currentPlanRole === 'AGENT'
                  ? 'חבילות לסוכנים'
                  : 'חבילות ללקוחות פרטיים'}
              </h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsCreatingPlan(true);
                  setEditingPlan(null);
                }}
              >
                יצירת חבילה חדשה
              </button>
            </div>

            {plansLoading ? (
              <div className="loading-state">
                <p>טוען חבילות...</p>
              </div>
            ) : plansError ? (
              <div className="error-state">
                <p>{plansError}</p>
              </div>
            ) : billingPlans.length === 0 ? (
              <div className="empty-state">
                <p>עדיין לא הוגדרו חבילות. צור חבילה חדשה.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="admin-plans-table">
                  <thead>
                    <tr>
                      <th>קוד חבילה</th>
                      <th>שם תצוגה</th>
                      <th>תיאור</th>
                      <th>מכסה חינם</th>
                      <th>מחיר לליד</th>
                      <th>עמלה חודשית</th>
                      <th>מטבע</th>
                      <th>ברירת מחדל</th>
                      <th>פעיל</th>
                      <th>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingPlans.map((plan) => (
                      <tr key={plan.id}>
                        <td>
                          <strong>{plan.planCode}</strong>
                        </td>
                        <td>{plan.displayName}</td>
                        <td>{plan.description || '—'}</td>
                        <td>{plan.freeMonthlyLeadQuota}</td>
                        <td>{plan.leadPrice} ₪</td>
                        <td>{plan.fixedMonthlyFee} ₪</td>
                        <td>{plan.currency}</td>
                        <td>
                          {plan.isDefault ? (
                            <span className="badge badge-success">✓</span>
                          ) : (
                            <span className="badge">—</span>
                          )}
                        </td>
                        <td>
                          {plan.isActive ? (
                            <span className="badge badge-success">פעיל</span>
                          ) : (
                            <span className="badge badge-inactive">לא פעיל</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setEditingPlan(plan);
                                setIsCreatingPlan(false);
                              }}
                            >
                              עריכה
                            </button>
                            {!plan.isDefault && (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                onClick={async () => {
                                  try {
                                    await setDefaultBillingPlan(currentPlanRole, plan.planCode);
                                    // Reload plans
                                    const plansList = await fetchBillingPlansByRole(currentPlanRole);
                                    setBillingPlans(plansList);
                                  } catch (err: any) {
                                    console.error('Error setting default plan:', err);
                                    setPlansError('אירעה שגיאה בהגדרת חבילת ברירת מחדל.');
                                  }
                                }}
                              >
                                הגדר ברירת מחדל
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Edit/Create Plan Modal */}
        {(editingPlan || isCreatingPlan) && (
          <PlanEditModal
            plan={editingPlan}
            role={currentPlanRole}
            onClose={() => {
              setEditingPlan(null);
              setIsCreatingPlan(false);
            }}
            onSave={async (planData) => {
              try {
                if (isCreatingPlan) {
                  await createBillingPlan(planData);
                } else if (editingPlan) {
                  await updateBillingPlan(editingPlan.id, planData);
                }
                // Reload plans
                const plansList = await fetchBillingPlansByRole(currentPlanRole);
                setBillingPlans(plansList);
                setEditingPlan(null);
                setIsCreatingPlan(false);
              } catch (err: any) {
                console.error('Error saving plan:', err);
                setPlansError('אירעה שגיאה בשמירת החבילה.');
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// Plan Edit Modal Component
interface PlanEditModalProps {
  plan: BillingPlan | null;
  role: BillingPlanRole;
  onClose: () => void;
  onSave: (planData: Omit<BillingPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

function PlanEditModal({ plan, role, onSave, onClose }: PlanEditModalProps) {
  const [displayName, setDisplayName] = useState(plan?.displayName || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [planCode, setPlanCode] = useState<'FREE' | 'PLUS' | 'PRO'>(plan?.planCode || 'FREE');
  const [freeQuota, setFreeQuota] = useState(plan?.freeMonthlyLeadQuota.toString() || '0');
  const [leadPrice, setLeadPrice] = useState(plan?.leadPrice.toString() || '0');
  const [fixedFee, setFixedFee] = useState(plan?.fixedMonthlyFee.toString() || '0');
  const [currency, setCurrency] = useState(plan?.currency || 'ILS');
  const [isActive, setIsActive] = useState(plan?.isActive !== false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        role,
        planCode,
        displayName,
        description: description || undefined,
        freeMonthlyLeadQuota: parseInt(freeQuota, 10),
        leadPrice: parseFloat(leadPrice),
        fixedMonthlyFee: parseFloat(fixedFee),
        currency,
        isDefault: plan?.isDefault || false,
        isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{plan ? 'עריכת חבילה' : 'יצירת חבילה חדשה'}</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>קוד חבילה:</label>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value as 'FREE' | 'PLUS' | 'PRO')}
                className="form-control"
                disabled={!!plan}
                required
              >
                <option value="FREE">FREE</option>
                <option value="PLUS">PLUS</option>
                <option value="PRO">PRO</option>
              </select>
            </div>
            <div className="form-group">
              <label>שם תצוגה:</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>תיאור:</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-control"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>מכסה חינם (לידים/חודש):</label>
              <input
                type="number"
                value={freeQuota}
                onChange={(e) => setFreeQuota(e.target.value)}
                className="form-control"
                min="0"
                required
              />
            </div>
            <div className="form-group">
              <label>מחיר לליד (₪):</label>
              <input
                type="number"
                value={leadPrice}
                onChange={(e) => setLeadPrice(e.target.value)}
                className="form-control"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="form-group">
              <label>עמלה חודשית קבועה (₪):</label>
              <input
                type="number"
                value={fixedFee}
                onChange={(e) => setFixedFee(e.target.value)}
                className="form-control"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="form-group">
              <label>מטבע:</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="form-control" required>
                <option value="ILS">ILS (₪)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                {' '}פעיל
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              ביטול
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

