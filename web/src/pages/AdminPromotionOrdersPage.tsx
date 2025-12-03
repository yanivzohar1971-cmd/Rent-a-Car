import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchAllPromotionProducts } from '../api/promotionApi';
import { markPromotionOrderAsPaid, applyPromotionOrderToCar } from '../api/promotionApi';
import { collection, query, orderBy, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { PromotionOrder, PromotionScope } from '../types/Promotion';
import './AdminPromotionOrdersPage.css';

export default function AdminPromotionOrdersPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<PromotionScope | 'ALL'>('ALL');

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    loadOrders();
  }, [isAdmin, scopeFilter]);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const ordersRef = collection(db, 'promotionOrders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocsFromServer(q);
      const loadedOrders: PromotionOrder[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || '',
          carId: data.carId || null,
          items: data.items || [],
          totalAmount: data.totalAmount || 0,
          currency: data.currency || 'ILS',
          status: data.status || 'DRAFT',
          paymentMethod: data.paymentMethod || 'OFFLINE_SIMULATED',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      const filtered = scopeFilter === 'ALL' 
        ? loadedOrders 
        : loadedOrders.filter((o) => o.items.some((item) => item.scope === scopeFilter));
      setOrders(filtered);
    } catch (err: any) {
      console.error('Error loading orders:', err);
      setError('שגיאה בטעינת הזמנות');
    } finally {
      setLoading(false);
    }
  }

  const handleMarkAsPaid = async (order: PromotionOrder) => {
    try {
      await markPromotionOrderAsPaid(order.id);
      await loadOrders();
    } catch (err: any) {
      console.error('Error marking order as paid:', err);
      setError('שגיאה בסימון הזמנה כשולמה');
    }
  };

  const handleReapply = async (order: PromotionOrder) => {
    try {
      if (order.carId) {
        await applyPromotionOrderToCar(order);
        setError(null);
        alert('הקידום יושם מחדש בהצלחה');
      }
    } catch (err: any) {
      console.error('Error reapplying promotion:', err);
      setError('שגיאה ביישום מחדש של הקידום');
    }
  };

  const scopeLabels: Record<PromotionScope | 'ALL', string> = {
    ALL: 'הכל',
    PRIVATE_SELLER_AD: 'מוכרים פרטיים',
    YARD_CAR: 'רכבי מגרש',
    YARD_BRAND: 'מגרש',
  };

  if (!isAdmin) return null;

  return (
    <div className="admin-promotion-orders-page">
      <div className="page-container">
        <div className="page-header">
          <h1>הזמנות קידום</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/account')}>
            חזרה
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="filters">
          {(Object.keys(scopeLabels) as Array<PromotionScope | 'ALL'>).map((scope) => (
            <button
              key={scope}
              className={`filter-btn ${scopeFilter === scope ? 'active' : ''}`}
              onClick={() => setScopeFilter(scope)}
            >
              {scopeLabels[scope]}
            </button>
          ))}
        </div>

        {loading ? (
          <p>טוען...</p>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <p>אין הזמנות קידום</p>
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>משתמש</th>
                <th>רכב</th>
                <th>מוצרים</th>
                <th>סכום</th>
                <th>סטטוס</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    {order.createdAt?.toDate
                      ? order.createdAt.toDate().toLocaleDateString('he-IL')
                      : '-'}
                  </td>
                  <td>{order.userId}</td>
                  <td>{order.carId || '-'}</td>
                  <td>
                    {order.items.map((item) => item.name).join(', ')}
                  </td>
                  <td>
                    {order.totalAmount.toLocaleString()} {order.currency}
                  </td>
                  <td>
                    <span className={`status-${order.status.toLowerCase()}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      {order.status !== 'PAID' && (
                        <button
                          className="btn btn-small btn-primary"
                          onClick={() => handleMarkAsPaid(order)}
                        >
                          סמן כשולם
                        </button>
                      )}
                      {order.carId && (
                        <button
                          className="btn btn-small btn-secondary"
                          onClick={() => handleReapply(order)}
                        >
                          יישם מחדש
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

