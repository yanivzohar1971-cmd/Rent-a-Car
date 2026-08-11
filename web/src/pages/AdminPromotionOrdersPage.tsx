import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { markPromotionOrderAsPaid, applyPromotionOrderToCar } from '../api/promotionApi';
import { collection, query, orderBy, getDocsFromServer, where, documentId } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { PromotionOrder, PromotionScope } from '../types/Promotion';
import { getYardCarById } from '../api/carsMasterApi';
import './AdminPromotionOrdersPage.css';

/**
 * Shorten a UID for display (first 4 chars + last 4 chars)
 */
function shortUid(uid: string): string {
  if (!uid || uid.length <= 8) return uid;
  return `${uid.substring(0, 4)}…${uid.substring(uid.length - 4)}`;
}

/**
 * Shorten a car ID for display
 */
function shortCarId(carId: string): string {
  if (!carId || carId.length <= 8) return carId;
  return `${carId.substring(0, 4)}…${carId.substring(carId.length - 4)}`;
}

/**
 * Create composite key for order deduplication (fallback when doc.id unavailable)
 */
function compositeOrderKey(order: PromotionOrder): string {
  const createdAtMillis = order.createdAt?.toMillis?.() ?? 
    (typeof order.createdAt === 'number' ? order.createdAt : 0);
  return `${order.userId}|${order.carId || ''}|${createdAtMillis}|${order.totalAmount}|${order.status}`;
}


export default function AdminPromotionOrdersPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<PromotionScope | 'ALL'>('ALL');
  const [labelsVersion, setLabelsVersion] = useState(0);

  // Caches for resolved labels
  const userLabelById = useRef(new Map<string, string>());
  const carLabelById = useRef(new Map<string, string>());

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (authLoading) return; // Wait for auth/profile to load
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadOrders();
  }, [authLoading, isAdmin, scopeFilter]);

  /**
   * Fetch user labels in batches (chunk by 10 due to Firestore IN limit)
   * Always sets a label for every requested ID (even if doc is missing)
   * Updates cache and triggers re-render via labelsVersion
   */
  async function fetchUserLabels(userIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    
    if (uniqueIds.length === 0) return;

    let didChange = false;

    // Process in chunks of 10
    for (let i = 0; i < uniqueIds.length; i += 10) {
      const chunk = uniqueIds.slice(i, i + 10);
      
      try {
        // Use documentId() in query for batch fetch
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where(documentId(), 'in', chunk));
        const snapshot = await getDocsFromServer(q);
        
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const uid = docSnap.id;
          
          // Priority: businessName/yardName > displayName > fullName > email > shortUid
          const label = 
            data.businessName || 
            data.yardName || 
            data.displayName || 
            data.fullName || 
            data.email || 
            shortUid(uid);
          
          // Update cache if changed
          const existing = userLabelById.current.get(uid);
          if (existing !== label) {
            userLabelById.current.set(uid, label);
            didChange = true;
          }
        });
      } catch (err) {
        console.error('Error fetching user labels chunk:', err);
        // On error, ensure all chunk IDs have fallback in cache
        chunk.forEach((uid) => {
          const fallback = shortUid(uid);
          const existing = userLabelById.current.get(uid);
          if (existing !== fallback) {
            userLabelById.current.set(uid, fallback);
            didChange = true;
          }
        });
      }
      
      // Ensure all chunk IDs are in cache (even if missing from query)
      chunk.forEach((uid) => {
        if (!userLabelById.current.has(uid)) {
          userLabelById.current.set(uid, shortUid(uid));
          didChange = true;
        }
      });
    }
    
    // Trigger re-render once per batch if any changes
    if (didChange) {
      setLabelsVersion((v) => v + 1);
    }
  }

  /**
   * Fetch car labels grouped by yard UID
   * Always sets a label for every requested car (even if doc is missing)
   * Updates cache and triggers re-render via labelsVersion
   */
  async function fetchCarLabels(orders: PromotionOrder[]): Promise<void> {
    // Group orders by userId (yardUid) and collect unique carIds per yard
    const byYard: Record<string, string[]> = {};
    orders.forEach((order) => {
      if (order.carId && order.userId) {
        if (!byYard[order.userId]) {
          byYard[order.userId] = [];
        }
        if (!byYard[order.userId].includes(order.carId)) {
          byYard[order.userId].push(order.carId);
        }
      }
    });

    let didChange = false;

    // Fetch cars for each yard in batches
    for (const [yardUid, carIds] of Object.entries(byYard)) {
      // Process carIds in chunks of 10
      for (let i = 0; i < carIds.length; i += 10) {
        const chunk = carIds.slice(i, i + 10);
        
        await Promise.all(
          chunk.map(async (carId) => {
            const key = `${yardUid}:${carId}`;
            
            // Ensure key exists in cache with fallback
            if (!carLabelById.current.has(key)) {
              carLabelById.current.set(key, shortCarId(carId));
              didChange = true;
            }
            
            try {
              const car = await getYardCarById(yardUid, carId);
              if (car) {
                // Priority: brand+model+year > plate > title/notes > shortCarId
                const parts: string[] = [];
                if (car.brand) parts.push(car.brand);
                if (car.model) parts.push(car.model);
                if (car.year) parts.push(String(car.year));
                
                const label = 
                  (parts.length > 0 ? parts.join(' ') : null) ||
                  (car.licensePlatePartial ? `מס' רישוי ${car.licensePlatePartial}` : null) ||
                  car.notes ||
                  shortCarId(carId);
                
                // Update cache if changed
                const existing = carLabelById.current.get(key);
                if (existing !== label) {
                  carLabelById.current.set(key, label);
                  didChange = true;
                }
              }
            } catch (err) {
              // Silently continue - already has shortCarId from initialization
              // Only log if it's not a "not found" type error
              if (err && typeof err === 'object' && 'code' in err && err.code !== 'not-found') {
                console.error(`Error fetching car ${carId} for yard ${yardUid}:`, err);
              }
              // Ensure fallback is set
              const fallback = shortCarId(carId);
              const existing = carLabelById.current.get(key);
              if (existing !== fallback) {
                carLabelById.current.set(key, fallback);
                didChange = true;
              }
            }
          })
        );
      }
    }
    
    // Trigger re-render once per batch if any changes
    if (didChange) {
      setLabelsVersion((v) => v + 1);
    }
  }

  async function loadOrders() {
    setLoading(true);
    setError(null);
    // Clear caches to avoid stale labels
    userLabelById.current.clear();
    carLabelById.current.clear();
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
      
      // De-duplicate orders: use Map keyed by doc.id (order.id), keep newest if duplicates
      const ordersMap = new Map<string, PromotionOrder>();
      filtered.forEach((order) => {
        // Use order.id (Firestore doc.id) as primary key, fallback to composite key
        const key = order.id || compositeOrderKey(order);
        const existing = ordersMap.get(key);
        if (!existing) {
          ordersMap.set(key, order);
        } else {
          // If duplicate by key, keep the one with newer createdAt
          const existingTime = existing.createdAt?.toMillis?.() ?? 
            (typeof existing.createdAt === 'number' ? existing.createdAt : 0);
          const newTime = order.createdAt?.toMillis?.() ?? 
            (typeof order.createdAt === 'number' ? order.createdAt : 0);
          if (newTime > existingTime) {
            ordersMap.set(key, order);
          }
        }
      });
      
      // Convert back to array, sorted by createdAt desc
      const deduplicated = Array.from(ordersMap.values()).sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() ?? (typeof a.createdAt === 'number' ? a.createdAt : 0);
        const timeB = b.createdAt?.toMillis?.() ?? (typeof b.createdAt === 'number' ? b.createdAt : 0);
        return timeB - timeA;
      });
      
      setOrders(deduplicated);

      // Resolve labels after orders are loaded (background, non-blocking)
      // Always sets cache values, so cells can render immediately
      (async () => {
        try {
          // Collect unique userIds from deduplicated orders
          const userIds = Array.from(new Set(deduplicated.map((o) => o.userId).filter(Boolean)));
          
          // Fetch user labels (always sets a value for every ID, updates cache, triggers version bump)
          await fetchUserLabels(userIds);

          // Fetch car labels (always sets a value for every car, updates cache, triggers version bump)
          await fetchCarLabels(deduplicated);
        } catch (labelErr) {
          console.error('Error resolving labels:', labelErr);
          // Non-fatal: caches already have short IDs as fallback
        }
      })();
    } catch (err: any) {
      console.error('AdminPromotionOrdersPage load error:', err);
      console.error('Error code:', err?.code);
      console.error('Error message:', err?.message);
      console.error('Full error:', JSON.stringify(err, null, 2));
      const errorMessage = err?.code === 'permission-denied' 
        ? 'אין הרשאה לטעון הזמנות קידום. ודא שהמשתמש שלך מסומן כמנהל במערכת.'
        : err?.message || 'שגיאה בטעינת הזמנות';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const handleMarkAsPaid = async (order: PromotionOrder) => {
    try {
      setError(null);
      await markPromotionOrderAsPaid(order.id);
      await loadOrders();
    } catch (err: any) {
      console.error('Error marking order as paid:', err);
      setError('שגיאה בסימון הזמנה כשולמה');
    }
  };

  const handleReapply = async (order: PromotionOrder) => {
    try {
      setError(null);
      if (order.carId) {
        await applyPromotionOrderToCar(order);
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

  // Show loading while auth is being checked
  if (authLoading) {
    return (
      <div className="admin-promotion-orders-page">
        <div className="page-container">
          <div className="loading-state">
            <p>בודק הרשאות...</p>
          </div>
        </div>
      </div>
    );
  }

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
              onClick={() => {
                setError(null);
                setScopeFilter(scope);
              }}
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
          <div className="promo-orders-table-wrap">
            <table className="promo-orders-table orders-table">
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
                {orders.map((order) => {
                  // Use labelsVersion to trigger re-render when labels update (read it to subscribe)
                  void labelsVersion;
                  
                  // Always render immediately: resolved label or short ID (no "טוען…")
                  const userLabel = userLabelById.current.get(order.userId) || shortUid(order.userId);
                  const userShortId = shortUid(order.userId);
                  const showUserShortId = userLabel !== userShortId;
                  
                  const carKey = order.carId ? `${order.userId}:${order.carId}` : null;
                  const carLabel = carKey 
                    ? (carLabelById.current.get(carKey) || (order.carId ? shortCarId(order.carId) : '-'))
                    : '-';
                  const carShortId = order.carId ? shortCarId(order.carId) : null;
                  const showCarShortId = carShortId && carLabel !== carShortId;
                  
                  // Use stable key: order.id (doc.id) or composite key fallback
                  const rowKey = order.id || compositeOrderKey(order);
                  
                  return (
                    <tr key={rowKey}>
                      <td>
                        {order.createdAt?.toDate
                          ? order.createdAt.toDate().toLocaleDateString('he-IL')
                          : '-'}
                      </td>
                      <td>
                        <span 
                          className="cell-ellipsis" 
                          title={userLabel}
                        >
                          <span className="primary-text">{userLabel}</span>
                          {showUserShortId && (
                            <span className="secondary-id"> · {userShortId}</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="cell-ellipsis" 
                          title={carLabel}
                        >
                          <span className="primary-text">{carLabel}</span>
                          {showCarShortId && (
                            <span className="secondary-id"> · {carShortId}</span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span 
                          className="cell-ellipsis" 
                          title={order.items.map((item) => item.name).join(', ')}
                        >
                          {order.items.map((item) => item.name).join(', ')}
                        </span>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

