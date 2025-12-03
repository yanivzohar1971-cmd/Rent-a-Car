import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllYardsForAdmin } from '../api/adminYardsApi';
import { fetchAllSellersForAdmin } from '../api/adminSellersApi';
import { fetchLeadStatsForYard, fetchLeadStatsForSeller } from '../api/leadsApi';
import './AdminLeadsPage.css';

interface AdminYardLeadRow {
  yardId: string;
  yardName: string;
  total: number;
  newCount: number;
  inProgressCount: number;
  closedCount: number;
  lostCount: number;
}

interface AdminSellerLeadRow {
  sellerId: string;
  displayName?: string;
  email?: string;
  total: number;
  newCount: number;
  inProgressCount: number;
  closedCount: number;
  lostCount: number;
}

type TabType = 'yards' | 'sellers';

export default function AdminLeadsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('yards');

  // Yards state
  const [yards, setYards] = useState<AdminYardLeadRow[]>([]);
  const [yardsLoading, setYardsLoading] = useState(false);
  const [yardsError, setYardsError] = useState<string | null>(null);

  // Sellers state
  const [sellers, setSellers] = useState<AdminSellerLeadRow[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellersError, setSellersError] = useState<string | null>(null);

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  // Load yards with lead stats
  useEffect(() => {
    if (!isAdmin) return;

    async function loadYards() {
      setYardsLoading(true);
      setYardsError(null);
      try {
        const yardsList = await fetchAllYardsForAdmin();
        const yardsWithStats: AdminYardLeadRow[] = [];

        // Fetch stats for each yard (in parallel for better performance)
        await Promise.all(
          yardsList.map(async (yard) => {
            try {
              const stats = await fetchLeadStatsForYard(yard.id);
              yardsWithStats.push({
                yardId: yard.id,
                yardName: yard.name,
                total: stats.total,
                newCount: stats.newCount,
                inProgressCount: stats.inProgressCount,
                closedCount: stats.closedCount,
                lostCount: stats.lostCount,
              });
            } catch (err) {
              console.error(`Error fetching stats for yard ${yard.id}:`, err);
              // Still add the yard with zero stats
              yardsWithStats.push({
                yardId: yard.id,
                yardName: yard.name,
                total: 0,
                newCount: 0,
                inProgressCount: 0,
                closedCount: 0,
                lostCount: 0,
              });
            }
          })
        );

        setYards(yardsWithStats);
      } catch (err: any) {
        console.error('Error loading yards:', err);
        setYardsError('אירעה שגיאה בטעינת נתוני הלידים. נסה שוב מאוחר יותר.');
      } finally {
        setYardsLoading(false);
      }
    }

    if (activeTab === 'yards') {
      loadYards();
    }
  }, [isAdmin, activeTab]);

  // Load sellers with lead stats
  useEffect(() => {
    if (!isAdmin) return;

    async function loadSellers() {
      setSellersLoading(true);
      setSellersError(null);
      try {
        const sellersList = await fetchAllSellersForAdmin();
        const sellersWithStats: AdminSellerLeadRow[] = [];

        // Fetch stats for each seller (in parallel for better performance)
        await Promise.all(
          sellersList.map(async (seller) => {
            try {
              const stats = await fetchLeadStatsForSeller(seller.id);
              sellersWithStats.push({
                sellerId: seller.id,
                displayName: seller.displayName,
                email: seller.email,
                total: stats.total,
                newCount: stats.newCount,
                inProgressCount: stats.inProgressCount,
                closedCount: stats.closedCount,
                lostCount: stats.lostCount,
              });
            } catch (err) {
              console.error(`Error fetching stats for seller ${seller.id}:`, err);
              // Still add the seller with zero stats
              sellersWithStats.push({
                sellerId: seller.id,
                displayName: seller.displayName,
                email: seller.email,
                total: 0,
                newCount: 0,
                inProgressCount: 0,
                closedCount: 0,
                lostCount: 0,
              });
            }
          })
        );

        // Filter out sellers with zero leads (optional - can be removed if we want to show all)
        const sellersWithLeads = sellersWithStats.filter((s) => s.total > 0);
        setSellers(sellersWithLeads);
      } catch (err: any) {
        console.error('Error loading sellers:', err);
        setSellersError('אירעה שגיאה בטעינת נתוני הלידים. נסה שוב מאוחר יותר.');
      } finally {
        setSellersLoading(false);
      }
    }

    if (activeTab === 'sellers') {
      loadSellers();
    }
  }, [isAdmin, activeTab]);

  if (!isAdmin) {
    return (
      <div className="admin-leads-page">
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
    <div className="admin-leads-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול לידים (Admin)</h1>
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
                <p>טוען נתוני לידים למגרשים...</p>
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
                <table className="admin-leads-table">
                  <thead>
                    <tr>
                      <th>מגרש</th>
                      <th>סה״כ לידים</th>
                      <th>חדשים</th>
                      <th>בטיפול</th>
                      <th>נסגרו</th>
                      <th>לא רלוונטיים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yards.map((yard) => (
                      <tr key={yard.yardId}>
                        <td>
                          <strong>{yard.yardName}</strong>
                        </td>
                        <td>{yard.total}</td>
                        <td>
                          <span className="stat-badge stat-new">{yard.newCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-in-progress">{yard.inProgressCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-closed">{yard.closedCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-lost">{yard.lostCount}</span>
                        </td>
                      </tr>
                    ))}
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
                <p>טוען נתוני לידים למוכרים פרטיים...</p>
              </div>
            ) : sellersError ? (
              <div className="error-state">
                <p>{sellersError}</p>
              </div>
            ) : sellers.length === 0 ? (
              <div className="empty-state">
                <p>לא נמצאו נתוני לידים להצגה.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="admin-leads-table">
                  <thead>
                    <tr>
                      <th>מוכר</th>
                      <th>אימייל</th>
                      <th>סה״כ לידים</th>
                      <th>חדשים</th>
                      <th>בטיפול</th>
                      <th>נסגרו</th>
                      <th>לא רלוונטיים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((seller) => (
                      <tr key={seller.sellerId}>
                        <td>
                          <strong>{seller.displayName || seller.email || 'ללא שם'}</strong>
                        </td>
                        <td>{seller.email || '-'}</td>
                        <td>{seller.total}</td>
                        <td>
                          <span className="stat-badge stat-new">{seller.newCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-in-progress">{seller.inProgressCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-closed">{seller.closedCount}</span>
                        </td>
                        <td>
                          <span className="stat-badge stat-lost">{seller.lostCount}</span>
                        </td>
                      </tr>
                    ))}
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

