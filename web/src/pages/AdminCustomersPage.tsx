import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin } from '../api/adminYardsApi';
import { fetchAllAgentsForAdmin } from '../api/adminAgentsApi';
import { fetchAllSellersForAdmin } from '../api/adminSellersApi';
import { doc, getDocFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { updateUserSubscriptionAndDeal, clearUserDeal, type UpdateUserSubscriptionAndDealPayload } from '../api/adminUsersApi';
import { getEffectivePlanForUser } from '../config/billingConfig';
import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';
import type { BillingPlan } from '../types/BillingPlan';
import './AdminCustomersPage.css';

type TabType = 'yards' | 'agents' | 'sellers' | 'deals';

interface CustomerRow {
  id: string;
  type: 'YARD' | 'AGENT' | 'PRIVATE_SELLER';
  name: string;
  email?: string;
  phone?: string;
  subscriptionPlan: SubscriptionPlan;
  billingDealName?: string | null;
  billingDealValidUntil?: Timestamp | null;
  hasCustomDeal: boolean;
}

export default function AdminCustomersPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('yards');

  // Data state
  const [yards, setYards] = useState<CustomerRow[]>([]);
  const [agents, setAgents] = useState<CustomerRow[]>([]);
  const [sellers, setSellers] = useState<CustomerRow[]>([]);
  const [deals, setDeals] = useState<CustomerRow[]>([]);

  // Loading & error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected customer for editing
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [selectedCustomerFull, setSelectedCustomerFull] = useState<UserProfile | null>(null);
  const [selectedCustomerPlan, setSelectedCustomerPlan] = useState<BillingPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // Edit form state
  const [editSubscriptionPlan, setEditSubscriptionPlan] = useState<SubscriptionPlan>('FREE');
  const [editDealName, setEditDealName] = useState<string>('');
  const [editDealValidUntil, setEditDealValidUntil] = useState<string>('');
  const [editCustomFreeQuota, setEditCustomFreeQuota] = useState<string>('');
  const [editCustomLeadPrice, setEditCustomLeadPrice] = useState<string>('');
  const [editCustomFixedFee, setEditCustomFixedFee] = useState<string>('');
  const [editCustomCurrency, setEditCustomCurrency] = useState<string>('ILS');

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Load customers based on active tab
  useEffect(() => {
    if (!isAdmin) return;

    async function loadCustomers() {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === 'yards') {
          const yardsList = await fetchAllYardsForAdmin();
          const rows: CustomerRow[] = yardsList.map((yard) => ({
            id: yard.id,
            type: 'YARD',
            name: yard.name,
            email: yard.email || undefined,
            phone: yard.contactPhone || undefined,
            subscriptionPlan: yard.subscriptionPlan || 'FREE',
            hasCustomDeal: false, // Will be updated when we load full user data
          }));
          setYards(rows);
        } else if (activeTab === 'agents') {
          const agentsList = await fetchAllAgentsForAdmin();
          const rows: CustomerRow[] = agentsList.map((agent) => ({
            id: agent.id,
            type: 'AGENT',
            name: agent.name,
            email: agent.email || undefined,
            phone: agent.contactPhone || undefined,
            subscriptionPlan: agent.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setAgents(rows);
        } else if (activeTab === 'sellers') {
          const sellersList = await fetchAllSellersForAdmin();
          const rows: CustomerRow[] = sellersList.map((seller) => ({
            id: seller.id,
            type: 'PRIVATE_SELLER',
            name: seller.displayName || seller.email || 'מוכר ללא שם',
            email: seller.email || undefined,
            subscriptionPlan: seller.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setSellers(rows);
        } else if (activeTab === 'deals') {
          // Load all users with deals (combine all types)
          const [yardsList, agentsList, sellersList] = await Promise.all([
            fetchAllYardsForAdmin(),
            fetchAllAgentsForAdmin(),
            fetchAllSellersForAdmin(),
          ]);

          const allRows: CustomerRow[] = [
            ...yardsList.map((y) => ({ id: y.id, type: 'YARD' as const, name: y.name, email: y.email, phone: y.contactPhone, subscriptionPlan: y.subscriptionPlan || 'FREE', hasCustomDeal: false })),
            ...agentsList.map((a) => ({ id: a.id, type: 'AGENT' as const, name: a.name, email: a.email, phone: a.contactPhone, subscriptionPlan: a.subscriptionPlan || 'FREE', hasCustomDeal: false })),
            ...sellersList.map((s) => ({ id: s.id, type: 'PRIVATE_SELLER' as const, name: s.displayName || s.email || 'מוכר ללא שם', email: s.email, subscriptionPlan: s.subscriptionPlan || 'FREE', hasCustomDeal: false })),
          ];

          // Load full user data to check for deals
          const rowsWithDeals: CustomerRow[] = [];
          for (const row of allRows) {
            try {
              const userDoc = await getDocFromServer(doc(db, 'users', row.id));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const hasDeal = !!(userData.billingDealName || userData.customFreeMonthlyLeadQuota || userData.customLeadPrice || userData.customFixedMonthlyFee);
                if (hasDeal) {
                  rowsWithDeals.push({
                    ...row,
                    billingDealName: userData.billingDealName || null,
                    billingDealValidUntil: userData.billingDealValidUntil || null,
                    hasCustomDeal: true,
                  });
                }
              }
            } catch (err) {
              console.error(`Error loading user ${row.id}:`, err);
            }
          }
          setDeals(rowsWithDeals);
        }
      } catch (err: any) {
        console.error('Error loading customers:', err);
        setError('אירעה שגיאה בטעינת הלקוחות. נסה שוב מאוחר יותר.');
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, [isAdmin, activeTab]);

  // Get current tab data
  const getCurrentTabData = (): CustomerRow[] => {
    switch (activeTab) {
      case 'yards':
        return yards;
      case 'agents':
        return agents;
      case 'sellers':
        return sellers;
      case 'deals':
        return deals;
      default:
        return [];
    }
  };

  // Handle customer row click (open edit panel)
  const handleCustomerClick = async (customer: CustomerRow) => {
    try {
      setEditLoading(true);
      // Load full user profile
      const userDoc = await getDocFromServer(doc(db, 'users', customer.id));
      if (!userDoc.exists()) {
        setError('משתמש לא נמצא.');
        return;
      }

      const userData = userDoc.data();
      const fullUser: UserProfile = {
        uid: userDoc.id,
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

      setSelectedCustomerFull(fullUser);
      setSelectedCustomer(customer);

      // Load effective plan
      const plan = await getEffectivePlanForUser(fullUser);
      setSelectedCustomerPlan(plan);

      // Populate edit form
      setEditSubscriptionPlan(fullUser.subscriptionPlan || 'FREE');
      setEditDealName(fullUser.billingDealName || '');
      setEditDealValidUntil(
        fullUser.billingDealValidUntil
          ? new Date(fullUser.billingDealValidUntil.toMillis()).toISOString().split('T')[0]
          : ''
      );
      setEditCustomFreeQuota(fullUser.customFreeMonthlyLeadQuota?.toString() || '');
      setEditCustomLeadPrice(fullUser.customLeadPrice?.toString() || '');
      setEditCustomFixedFee(fullUser.customFixedMonthlyFee?.toString() || '');
      setEditCustomCurrency(fullUser.customCurrency || 'ILS');

      setIsEditing(true);
    } catch (err: any) {
      console.error('Error loading customer details:', err);
      setError('אירעה שגיאה בטעינת פרטי הלקוח.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle save deal
  const handleSaveDeal = async () => {
    if (!selectedCustomer) return;

    try {
      setEditLoading(true);
      const payload: UpdateUserSubscriptionAndDealPayload = {
        subscriptionPlan: editSubscriptionPlan,
      };

      // Only include deal fields if deal name is provided or custom fields are set
      if (editDealName.trim() || editCustomFreeQuota || editCustomLeadPrice || editCustomFixedFee) {
        payload.billingDealName = editDealName.trim() || null;
        payload.billingDealValidUntil = editDealValidUntil
          ? Timestamp.fromDate(new Date(editDealValidUntil))
          : null;
        payload.customFreeMonthlyLeadQuota = editCustomFreeQuota ? parseFloat(editCustomFreeQuota) : null;
        payload.customLeadPrice = editCustomLeadPrice ? parseFloat(editCustomLeadPrice) : null;
        payload.customFixedMonthlyFee = editCustomFixedFee ? parseFloat(editCustomFixedFee) : null;
        payload.customCurrency = editCustomCurrency || null;
      }

      await updateUserSubscriptionAndDeal(selectedCustomer.id, payload);

      // Refresh data
      setActiveTab(activeTab); // Trigger reload
      setIsEditing(false);
      setSelectedCustomer(null);
      setSelectedCustomerFull(null);
      setSelectedCustomerPlan(null);
    } catch (err: any) {
      console.error('Error saving deal:', err);
      setError('אירעה שגיאה בשמירת הדיל.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle clear deal
  const handleClearDeal = async () => {
    if (!selectedCustomer) return;

    try {
      setEditLoading(true);
      await clearUserDeal(selectedCustomer.id);

      // Refresh data
      setActiveTab(activeTab); // Trigger reload
      setIsEditing(false);
      setSelectedCustomer(null);
      setSelectedCustomerFull(null);
      setSelectedCustomerPlan(null);
    } catch (err: any) {
      console.error('Error clearing deal:', err);
      setError('אירעה שגיאה בביטול הדיל.');
    } finally {
      setEditLoading(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const currentData = getCurrentTabData();

  return (
    <div className="admin-customers-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול לקוחות</h1>
        </div>

        {/* Tabs */}
        <div className="tabs-container">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'yards' ? 'active' : ''}`}
            onClick={() => setActiveTab('yards')}
          >
            מגרשים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => setActiveTab('agents')}
          >
            סוכנים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'sellers' ? 'active' : ''}`}
            onClick={() => setActiveTab('sellers')}
          >
            לקוחות פרטיים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'deals' ? 'active' : ''}`}
            onClick={() => setActiveTab('deals')}
          >
            דילים
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="loading-state">
            <p>טוען לקוחות...</p>
          </div>
        ) : currentData.length === 0 ? (
          <div className="empty-state">
            <p>
              {activeTab === 'deals'
                ? 'לא נמצאו דילים פעילים.'
                : `לא נמצאו ${activeTab === 'yards' ? 'מגרשים' : activeTab === 'agents' ? 'סוכנים' : 'לקוחות פרטיים'}.`}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="customers-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>אימייל</th>
                  <th>טלפון</th>
                  <th>סוג משתמש</th>
                  <th>חבילה</th>
                  <th>דיל</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {currentData.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.email || '—'}</td>
                    <td>{customer.phone || '—'}</td>
                    <td>
                      {customer.type === 'YARD'
                        ? 'מגרש'
                        : customer.type === 'AGENT'
                        ? 'סוכן'
                        : 'לקוח פרטי'}
                    </td>
                    <td>
                      <span className={`plan-badge plan-${customer.subscriptionPlan.toLowerCase()}`}>
                        {customer.subscriptionPlan}
                      </span>
                    </td>
                    <td>
                      {customer.billingDealName ? (
                        <span className="deal-badge">{customer.billingDealName}</span>
                      ) : customer.hasCustomDeal ? (
                        <span className="deal-badge">דיל מותאם</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => handleCustomerClick(customer)}
                      >
                        ניהול
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Side Panel / Modal */}
      {isEditing && selectedCustomer && selectedCustomerFull && (
        <div className="edit-panel-overlay" onClick={() => setIsEditing(false)}>
          <div className="edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="edit-panel-header">
              <h2>ניהול לקוח: {selectedCustomer.name}</h2>
              <button type="button" className="close-btn" onClick={() => setIsEditing(false)}>
                ✕
              </button>
            </div>

            {editLoading ? (
              <div className="loading-state">
                <p>טוען...</p>
              </div>
            ) : (
              <div className="edit-panel-content">
                {/* Basic Info (read-only) */}
                <div className="info-section">
                  <h3>מידע בסיסי</h3>
                  <div className="info-grid">
                    <div>
                      <label>שם:</label>
                      <p>{selectedCustomerFull.fullName || selectedCustomer.name}</p>
                    </div>
                    <div>
                      <label>אימייל:</label>
                      <p>{selectedCustomerFull.email}</p>
                    </div>
                    <div>
                      <label>טלפון:</label>
                      <p>{selectedCustomerFull.phone || '—'}</p>
                    </div>
                    <div>
                      <label>תפקיד:</label>
                      <p>
                        {selectedCustomer.type === 'YARD'
                          ? 'מגרש'
                          : selectedCustomer.type === 'AGENT'
                          ? 'סוכן'
                          : 'לקוח פרטי'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Package / Plan */}
                <div className="form-section">
                  <h3>חבילה / תכנית</h3>
                  <div className="form-group">
                    <label>תכנית מנוי:</label>
                    <select
                      value={editSubscriptionPlan}
                      onChange={(e) => setEditSubscriptionPlan(e.target.value as SubscriptionPlan)}
                      className="form-control"
                    >
                      <option value="FREE">FREE</option>
                      <option value="PLUS">PLUS</option>
                      <option value="PRO">PRO</option>
                    </select>
                  </div>

                  {selectedCustomerPlan && (
                    <div className="plan-info">
                      <h4>תצורת התכנית הנוכחית:</h4>
                      <ul>
                        <li>מכסה חינם: {selectedCustomerPlan.freeMonthlyLeadQuota} לידים/חודש</li>
                        <li>מחיר לליד: {selectedCustomerPlan.leadPrice} ₪</li>
                        <li>עמלה חודשית קבועה: {selectedCustomerPlan.fixedMonthlyFee} ₪</li>
                        <li>מטבע: {selectedCustomerPlan.currency}</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Deal Override */}
                <div className="form-section">
                  <h3>דיל / התאמה אישית</h3>
                  <div className="form-group">
                    <label>שם הדיל:</label>
                    <input
                      type="text"
                      value={editDealName}
                      onChange={(e) => setEditDealName(e.target.value)}
                      className="form-control"
                      placeholder="לדוגמה: דיל VIP"
                    />
                  </div>
                  <div className="form-group">
                    <label>תוקף עד:</label>
                    <input
                      type="date"
                      value={editDealValidUntil}
                      onChange={(e) => setEditDealValidUntil(e.target.value)}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label>מכסה חינם מותאמת:</label>
                    <input
                      type="number"
                      value={editCustomFreeQuota}
                      onChange={(e) => setEditCustomFreeQuota(e.target.value)}
                      className="form-control"
                      placeholder="השאר ריק לשימוש בתצורת התכנית"
                    />
                  </div>
                  <div className="form-group">
                    <label>מחיר לליד מותאם:</label>
                    <input
                      type="number"
                      value={editCustomLeadPrice}
                      onChange={(e) => setEditCustomLeadPrice(e.target.value)}
                      className="form-control"
                      placeholder="השאר ריק לשימוש בתצורת התכנית"
                    />
                  </div>
                  <div className="form-group">
                    <label>עמלה חודשית קבועה מותאמת:</label>
                    <input
                      type="number"
                      value={editCustomFixedFee}
                      onChange={(e) => setEditCustomFixedFee(e.target.value)}
                      className="form-control"
                      placeholder="השאר ריק לשימוש בתצורת התכנית"
                    />
                  </div>
                  <div className="form-group">
                    <label>מטבע:</label>
                    <select
                      value={editCustomCurrency}
                      onChange={(e) => setEditCustomCurrency(e.target.value)}
                      className="form-control"
                    >
                      <option value="ILS">ILS (₪)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="edit-panel-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveDeal}
                    disabled={editLoading}
                  >
                    שמירת דיל
                  </button>
                  {selectedCustomerFull.billingDealName && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleClearDeal}
                      disabled={editLoading}
                    >
                      ביטול דיל
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsEditing(false)}
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

