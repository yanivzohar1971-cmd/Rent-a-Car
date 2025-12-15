/**
 * Yard Sales History Page
 * 
 * Displays all sold cars for the authenticated yard user with:
 * - Year/Month filtering
 * - Table footer totals
 * - Profitability fields (cost, profit, commission, net profit) with snapshot calculations
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocsFromServer, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { YardCarMaster } from '../types/cars';
import './YardSalesHistoryPage.css';

interface SoldCar extends YardCarMaster {
  soldAt: number | null;
  soldPrice: number | null;
  // Profitability fields (optional, backward compatible)
  costPrice?: number | null;
  profitSnapshot?: number | null;
  commissionSnapshot?: number | null;
  netProfitSnapshot?: number | null;
  commissionType?: 'FIXED' | 'PERCENT_OF_SALE' | 'PERCENT_OF_PROFIT' | null;
  commissionValue?: number | null;
}

export default function YardSalesHistoryPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allSoldCars, setAllSoldCars] = useState<SoldCar[]>([]);
  
  // Filter state
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // null = "All months"
  
  // UI state
  const [showProfitability, setShowProfitability] = useState(false);

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
            try {
              const fallbackQ = query(
                carSalesRef,
                orderBy('soldAt', 'desc')
              );
              snapshot = await getDocsFromServer(fallbackQ);
            } catch (fallbackErr: any) {
              // If fallback query also fails, fetch without orderBy
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
          
          // Extract soldAt as number (milliseconds)
          let soldAtMs: number | null = null;
          if (data.soldAt) {
            if (typeof data.soldAt === 'number') {
              soldAtMs = data.soldAt;
            } else if (data.soldAt.toMillis) {
              soldAtMs = data.soldAt.toMillis();
            } else if (data.soldAt.seconds) {
              soldAtMs = data.soldAt.seconds * 1000;
            }
          }
          
          return {
            id: carId,
            yardUid: data.yardUid || firebaseUser.uid,
            ownerType: 'yard' as const,
            status: 'archived' as const, // Sold cars are archived
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
            soldAt: soldAtMs,
            soldPrice: typeof data.soldPrice === 'number' ? data.soldPrice : null,
            soldNote: data.soldNote || null,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : (data.createdAt?.toMillis ? data.createdAt.toMillis() : null),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : null),
            // Profitability fields (backward compatible - may be missing)
            costPrice: typeof data.costPrice === 'number' ? data.costPrice : null,
            profitSnapshot: typeof data.profitSnapshot === 'number' ? data.profitSnapshot : null,
            commissionSnapshot: typeof data.commissionSnapshot === 'number' ? data.commissionSnapshot : null,
            netProfitSnapshot: typeof data.netProfitSnapshot === 'number' ? data.netProfitSnapshot : null,
            commissionType: data.commissionType || null,
            commissionValue: typeof data.commissionValue === 'number' ? data.commissionValue : null,
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
        setAllSoldCars(cars);
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

  // Filter cars by year/month
  const filteredCars = useMemo(() => {
    if (!selectedYear) return allSoldCars;
    
    return allSoldCars.filter((car) => {
      if (!car.soldAt) return false;
      
      const soldDate = new Date(car.soldAt);
      const carYear = soldDate.getFullYear();
      const carMonth = soldDate.getMonth() + 1; // 1-12
      
      if (carYear !== selectedYear) return false;
      if (selectedMonth !== null && carMonth !== selectedMonth) return false;
      
      return true;
    });
  }, [allSoldCars, selectedYear, selectedMonth]);

  // Calculate statistics from filtered cars
  const stats = useMemo(() => {
    const totalSold = filteredCars.length;
    const totalRevenue = filteredCars.reduce((sum, car) => {
      const price = car.soldPrice || car.price || 0;
      return sum + price;
    }, 0);
    const avgSalePrice = totalSold > 0 ? totalRevenue / totalSold : 0;
    
    const carsWithKm = filteredCars.filter(c => c.mileageKm !== null && c.mileageKm !== undefined);
    const totalKm = carsWithKm.reduce((sum, car) => sum + (car.mileageKm || 0), 0);
    const avgKm = carsWithKm.length > 0 ? totalKm / carsWithKm.length : 0;
    
    const averageDaysToSell = filteredCars.length > 0
      ? filteredCars.reduce((sum, car) => {
          if (car.soldAt && car.createdAt) {
            const days = Math.floor((car.soldAt - car.createdAt) / (1000 * 60 * 60 * 24));
            return sum + days;
          }
          return sum;
        }, 0) / filteredCars.filter(c => c.soldAt && c.createdAt).length
      : 0;
    
    // Profitability totals (only include cars with snapshots)
    const carsWithProfit = filteredCars.filter(c => 
      c.profitSnapshot !== null && c.profitSnapshot !== undefined
    );
    const totalProfit = carsWithProfit.reduce((sum, c) => sum + (c.profitSnapshot || 0), 0);
    
    const carsWithCommission = filteredCars.filter(c => 
      c.commissionSnapshot !== null && c.commissionSnapshot !== undefined
    );
    const totalCommission = carsWithCommission.reduce((sum, c) => sum + (c.commissionSnapshot || 0), 0);
    
    const carsWithNetProfit = filteredCars.filter(c => 
      c.netProfitSnapshot !== null && c.netProfitSnapshot !== undefined
    );
    const totalNetProfit = carsWithNetProfit.reduce((sum, c) => sum + (c.netProfitSnapshot || 0), 0);
    
    return {
      totalSold,
      totalRevenue,
      avgSalePrice,
      totalKm,
      avgKm,
      averageDaysToSell,
      totalProfit,
      totalCommission,
      totalNetProfit,
      carsWithProfit: carsWithProfit.length,
      carsWithCommission: carsWithCommission.length,
      carsWithNetProfit: carsWithNetProfit.length,
    };
  }, [filteredCars]);

  // Generate year options (current year down to 10 years ago)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 10; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Month labels in Hebrew
  const monthLabels = [
    'כל השנה',
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

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

  const formatCurrency = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return `₪${value.toLocaleString('he-IL')}`;
  };

  const handleClearFilters = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(null);
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

        {/* Filters */}
        <div className="sales-filters">
          <div className="filter-group">
            <label htmlFor="year-filter">שנה:</label>
            <select
              id="year-filter"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                // Reset month when year changes
                setSelectedMonth(null);
              }}
              className="filter-select"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label htmlFor="month-filter">חודש:</label>
            <select
              id="month-filter"
              value={selectedMonth === null ? '' : selectedMonth}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMonth(val === '' ? null : Number(val));
              }}
              className="filter-select"
            >
              {monthLabels.map((label, idx) => (
                <option key={idx} value={idx === 0 ? '' : idx}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          
          {(selectedYear !== currentYear || selectedMonth !== null) && (
            <button className="btn btn-small btn-secondary" onClick={handleClearFilters}>
              נקה פילטרים
            </button>
          )}
        </div>

        {/* Statistics Cards */}
        <div className="sales-stats">
          <div className="stat-card">
            <div className="stat-label">סה"כ מכירות</div>
            <div className="stat-value">{stats.totalSold}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ערך כולל</div>
            <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ממוצע מחיר מכירה</div>
            <div className="stat-value">{formatCurrency(stats.avgSalePrice)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ממוצע ימים למכירה</div>
            <div className="stat-value">{isNaN(stats.averageDaysToSell) ? '-' : Math.round(stats.averageDaysToSell)}</div>
          </div>
        </div>

        {/* Profitability Toggle */}
        <div className="profitability-toggle">
          <label>
            <input
              type="checkbox"
              checked={showProfitability}
              onChange={(e) => setShowProfitability(e.target.checked)}
            />
            <span>הצג רווחיות</span>
          </label>
        </div>

        {/* Sold Cars Table */}
        {filteredCars.length === 0 ? (
          <div className="empty-state">
            <p>אין מכירות בתקופה שנבחרה</p>
            {(selectedYear !== currentYear || selectedMonth !== null) && (
              <button className="btn btn-primary" onClick={handleClearFilters}>
                נקה פילטרים
              </button>
            )}
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
                  {showProfitability && <th>עלות</th>}
                  {showProfitability && <th>רווח</th>}
                  {showProfitability && <th>עמלה</th>}
                  {showProfitability && <th>רווח נקי</th>}
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {filteredCars.map((car) => {
                  const salePrice = car.soldPrice || car.price || 0;
                  const costPrice = car.costPrice ?? null;
                  const profit = car.profitSnapshot ?? (costPrice !== null ? salePrice - costPrice : null);
                  const commission = car.commissionSnapshot ?? null;
                  const netProfit = car.netProfitSnapshot ?? (profit !== null && commission !== null ? profit - commission : null);
                  
                  return (
                    <tr key={car.id}>
                      <td>{formatDate(car.soldAt)}</td>
                      <td>
                        {car.brand || ''} {car.model || ''}
                      </td>
                      <td>{car.year || '-'}</td>
                      <td>{car.mileageKm ? `${car.mileageKm.toLocaleString('he-IL')} ק"מ` : '-'}</td>
                      <td>{formatCurrency(salePrice)}</td>
                      {showProfitability && <td>{formatCurrency(costPrice)}</td>}
                      {showProfitability && <td>{formatCurrency(profit)}</td>}
                      {showProfitability && <td>{formatCurrency(commission)}</td>}
                      {showProfitability && <td>{formatCurrency(netProfit)}</td>}
                      <td>{car.soldNote || car.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="table-footer">
                  <td colSpan={4}><strong>סה"כ:</strong></td>
                  <td><strong>{formatCurrency(stats.totalRevenue)}</strong></td>
                  {showProfitability && (
                    <>
                      <td><strong>{formatCurrency(stats.carsWithProfit > 0 ? stats.totalProfit : null)}</strong></td>
                      <td><strong>{formatCurrency(stats.carsWithCommission > 0 ? stats.totalCommission : null)}</strong></td>
                      <td><strong>{formatCurrency(stats.carsWithNetProfit > 0 ? stats.totalNetProfit : null)}</strong></td>
                    </>
                  )}
                  <td colSpan={showProfitability ? 0 : 1}></td>
                </tr>
                <tr className="table-footer-secondary">
                  <td colSpan={4}><strong>ממוצע:</strong></td>
                  <td><strong>{formatCurrency(stats.avgSalePrice)}</strong></td>
                  {showProfitability && (
                    <>
                      <td>
                        <strong>
                          {stats.carsWithProfit > 0 
                            ? formatCurrency(stats.totalProfit / stats.carsWithProfit)
                            : '-'}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {stats.carsWithCommission > 0
                            ? formatCurrency(stats.totalCommission / stats.carsWithCommission)
                            : '-'}
                        </strong>
                      </td>
                      <td>
                        <strong>
                          {stats.carsWithNetProfit > 0
                            ? formatCurrency(stats.totalNetProfit / stats.carsWithNetProfit)
                            : '-'}
                        </strong>
                      </td>
                    </>
                  )}
                  <td colSpan={showProfitability ? 0 : 1}></td>
                </tr>
                {stats.totalKm > 0 && (
                  <tr className="table-footer-secondary">
                    <td colSpan={4}><strong>סה"כ ק"מ:</strong></td>
                    <td colSpan={showProfitability ? 5 : 1}>
                      <strong>{stats.totalKm.toLocaleString('he-IL')} ק"מ</strong>
                    </td>
                    <td colSpan={showProfitability ? 0 : 1}></td>
                  </tr>
                )}
                {stats.avgKm > 0 && (
                  <tr className="table-footer-secondary">
                    <td colSpan={4}><strong>ממוצע ק"מ:</strong></td>
                    <td colSpan={showProfitability ? 5 : 1}>
                      <strong>{Math.round(stats.avgKm).toLocaleString('he-IL')} ק"מ</strong>
                    </td>
                    <td colSpan={showProfitability ? 0 : 1}></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
