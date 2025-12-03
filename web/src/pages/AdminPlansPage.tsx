import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin, type AdminYardSummary } from '../api/adminYardsApi';
import { fetchAllSellersForAdmin, type AdminSellerSummary } from '../api/adminSellersApi';
import { adminUpdateUserSubscriptionPlan } from '../api/adminUsersApi';
import type { SubscriptionPlan } from '../types/UserProfile';
import './AdminPlansPage.css';

type TabType = 'yards' | 'sellers';

export default function AdminPlansPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('yards');

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
      </div>
    </div>
  );
}

