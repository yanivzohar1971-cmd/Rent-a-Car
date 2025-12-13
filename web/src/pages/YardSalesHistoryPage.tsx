/**
 * Yard Sales History Page
 * 
 * Displays all sold cars for the authenticated yard user
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocsFromServer, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardCarMaster } from '../types/cars';
import './YardSalesHistoryPage.css';

interface SoldCar extends YardCarMaster {
  soldAt: number | null;
  soldPrice: number | null;
}

export default function YardSalesHistoryPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soldCars, setSoldCars] = useState<SoldCar[]>([]);

  // Redirect if not authenticated or not a yard user
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load sold cars
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;

      setIsLoading(true);
      setError(null);

      try {
        const carSalesRef = collection(db, 'users', firebaseUser.uid, 'carSales');
        
        // Try the indexed query first (saleStatus + soldAt orderBy)
        let snapshot;
        let useFallback = false;
        
        try {
          const q = query(
            carSalesRef,
            where('saleStatus', '==', 'SOLD'),
            orderBy('soldAt', 'desc')
          );
          snapshot = await getDocsFromServer(q);
        } catch (queryErr: any) {
          // If index is missing (FAILED_PRECONDITION), use fallback approach
          if (queryErr?.code === 'failed-precondition' || queryErr?.message?.includes('index')) {
            console.warn('[SalesHistory] Firestore index not found, using client-side filter fallback:', queryErr);
            useFallback = true;
            
            // Fallback: fetch all cars ordered by soldAt, then filter client-side
            // This works because it's scoped to the yard's own carSales subcollection (small dataset)
            try {
              const fallbackQ = query(
                carSalesRef,
                orderBy('soldAt', 'desc')
              );
              snapshot = await getDocsFromServer(fallbackQ);
            } catch (fallbackErr: any) {
              // If fallback query also fails (e.g., soldAt field missing or no index), fetch without orderBy
              console.warn('[SalesHistory] Fallback query failed, fetching all cars without orderBy:', fallbackErr);
              const simpleQ = query(carSalesRef);
              snapshot = await getDocsFromServer(simpleQ);
            }
          } else {
            // Re-throw other errors (permission-denied, etc.)
            throw queryErr;
          }
        }
        
        const allDocs = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const carId = docSnap.id;
          
          return {
            id: carId,
            yardUid: data.yardUid || firebaseUser.uid,
            ownerType: 'yard',
            status: 'archived', // Sold cars are archived
            brand: data.brand || data.brandText || null,
            model: data.model || data.modelText || null,
            year: typeof data.year === 'number' ? data.year : null,
            mileageKm: typeof data.mileageKm === 'number' ? data.mileageKm : null,
            price: typeof data.price === 'number' ? data.price : (typeof data.salePrice === 'number' ? data.salePrice : null),
            currency: data.currency || null,
            gearType: data.gearType || data.gearboxType || null,
            fuelType: data.fuelType || null,
            bodyType: data.bodyType || null,
            color: data.color || null,
            imageUrls: [], // Images are deleted when sold
            mainImageUrl: null,
            city: data.city || null,
            cityNameHe: data.cityNameHe || null,
            saleStatus: data.saleStatus || null,
            soldAt: data.soldAt ? (typeof data.soldAt === 'number' ? data.soldAt : data.soldAt.toMillis()) : null,
            soldPrice: typeof data.soldPrice === 'number' ? data.soldPrice : null,
            soldNote: data.soldNote || null,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : (data.createdAt?.toMillis ? data.createdAt.toMillis() : null),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null),
          } as SoldCar;
        });
        
        // Filter by saleStatus === 'SOLD' if using fallback
        const cars: SoldCar[] = useFallback
          ? allDocs.filter((car) => car.saleStatus === 'SOLD')
          : allDocs;
        
        // Sort by soldAt desc (handle null soldAt gracefully)
        cars.sort((a, b) => {
          if (!a.soldAt && !b.soldAt) return 0;
          if (!a.soldAt) return 1; // null soldAt goes to end
          if (!b.soldAt) return -1;
          return b.soldAt - a.soldAt; // desc order
        });
        
        console.log(`[SalesHistory] Loaded ${cars.length} sold cars${useFallback ? ' (using client-side filter fallback)' : ''}`);
        setSoldCars(cars);
      } catch (err: any) {
        console.error('[SalesHistory] Error loading sold cars:', {
          code: err?.code,
          message: err?.message,
          error: err,
        });
        const errorMsg = err?.code === 'permission-denied'
          ? 'אין הרשאה לטעון היסטוריית מכירות. אנא ודא שאתה מחובר כמגרש.'
          : 'שגיאה בטעינת היסטוריית מכירות';
        setError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [firebaseUser]);

  // Calculate statistics
  const totalSold = soldCars.length;
  const totalSoldValue = soldCars.reduce((sum, car) => sum + (car.soldPrice || car.price || 0), 0);
  const averageDaysToSell = soldCars.length > 0
    ? soldCars.reduce((sum, car) => {
        if (car.soldAt && car.createdAt) {
          const days = Math.floor((car.soldAt - car.createdAt) / (1000 * 60 * 60 * 24));
          return sum + days;
        }
        return sum;
      }, 0) / soldCars.filter(c => c.soldAt && c.createdAt).length
    : 0;

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return '-';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  if (isLoading) {
    return (
      <div className="yard-sales-history-page">
        <div className="page-container">
          <p>טוען היסטוריית מכירות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-sales-history-page">
      <div className="page-container">
        <div className="page-header">
          <h1>היסטוריית מכירות</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/yard/fleet')}>
            חזרה לצי הרכב
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Statistics Cards */}
        <div className="sales-stats">
          <div className="stat-card">
            <div className="stat-label">סה"כ מכירות</div>
            <div className="stat-value">{totalSold}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ערך כולל</div>
            <div className="stat-value">₪{totalSoldValue.toLocaleString('he-IL')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ממוצע ימים למכירה</div>
            <div className="stat-value">{isNaN(averageDaysToSell) ? '-' : Math.round(averageDaysToSell)}</div>
          </div>
        </div>

        {/* Sold Cars Table */}
        {soldCars.length === 0 ? (
          <div className="empty-state">
            <p>אין מכירות עדיין</p>
          </div>
        ) : (
          <div className="sales-table-container">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>תאריך מכירה</th>
                  <th>דגם</th>
                  <th>שנה</th>
                  <th>קילומטראז'</th>
                  <th>מחיר מכירה</th>
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {soldCars.map((car) => (
                  <tr key={car.id}>
                    <td>{formatDate(car.soldAt)}</td>
                    <td>
                      {car.brand || ''} {car.model || ''}
                    </td>
                    <td>{car.year || '-'}</td>
                    <td>{car.mileageKm ? `${car.mileageKm.toLocaleString()} ק"מ` : '-'}</td>
                    <td>
                      {car.soldPrice
                        ? `₪${car.soldPrice.toLocaleString('he-IL')}`
                        : car.price
                        ? `₪${car.price.toLocaleString('he-IL')}`
                        : '-'}
                    </td>
                    <td>{car.soldNote || car.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
