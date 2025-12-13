import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import YardPageHeader from '../components/yard/YardPageHeader';
import {
  fetchActivePromotionProducts,
  createPromotionOrderDraft,
  applyYardBrandPromotion,
} from '../api/promotionApi';
import { loadYardProfile, type YardProfileData } from '../api/yardProfileApi';
import { fetchBillingPlansByRole } from '../api/adminBillingPlansApi';
import { fetchLeadMonthlyStatsForYardCurrentMonth } from '../api/leadsApi';
import { getFreeMonthlyLeadQuota } from '../config/billingConfig';
import { generateUsageWarning } from '../utils/usageWarnings';
import { UpgradeWarningBanner } from '../components/UpgradeWarningBanner';
import type { BillingPlan } from '../types/BillingPlan';
import type { PromotionProduct } from '../types/Promotion';
import type { Timestamp } from 'firebase/firestore';
import './YardPromotionsPage.css';

export default function YardPromotionsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yardProfile, setYardProfile] = useState<YardProfileData | null>(null);
  const [billingPlan, setBillingPlan] = useState<BillingPlan | null>(null);
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [applyingProductId, setApplyingProductId] = useState<string | null>(null);
  
  // Usage stats for warnings
  const [currentMonthLeads, setCurrentMonthLeads] = useState<number | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  // Dev-only logging for debugging hook order issues
  if (import.meta.env.DEV) {
    console.log('[YardPromotionsPage] Render - loading:', loading, 'userProfile:', !!userProfile, 'yardProfile:', !!yardProfile);
  }

  // Redirect if not authenticated or not a yard
  useEffect(() => {
    if (!firebaseUser || !userProfile?.isYard) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, userProfile, navigate]);

  // Load data
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;

      setLoading(true);
      setError(null);

      try {
        // Load yard profile
        const profile = await loadYardProfile();
        setYardProfile(profile);

        // Load billing plan
        const plan = userProfile?.subscriptionPlan || 'FREE';
        const plans = await fetchBillingPlansByRole('YARD');
        const yardPlan = plans.find((p) => p.planCode === plan) || plans.find((p) => p.isDefault);
        setBillingPlan(yardPlan || null);

        // Load YARD_BRAND products
        const yardProducts = await fetchActivePromotionProducts('YARD_BRAND');
        setProducts(yardProducts);

        // Load current month lead usage for warnings
        setLoadingUsage(true);
        try {
          const monthlyStats = await fetchLeadMonthlyStatsForYardCurrentMonth(firebaseUser.uid);
          setCurrentMonthLeads(monthlyStats.total);
        } catch (err) {
          console.warn('Error loading monthly lead stats:', err);
          // Don't show error, just leave as null
        } finally {
          setLoadingUsage(false);
        }
      } catch (err: any) {
        console.error('Error loading yard promotions data:', err);
        setError('שגיאה בטעינת נתוני קידום');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [firebaseUser, userProfile]);

  const handlePurchaseProduct = async (product: PromotionProduct) => {
    if (!firebaseUser) {
      if (import.meta.env.DEV) {
        console.error('[YardPromotionsPage] handlePurchaseProduct called without firebaseUser');
      }
      return;
    }

    if (import.meta.env.DEV) {
      console.log('[YardPromotionsPage] handlePurchaseProduct called for product:', product.id, product.name);
    }

    setIsApplying(true);
    setApplyingProductId(product.id);
    setError(null);

    try {
      const order = await createPromotionOrderDraft(
        firebaseUser.uid,
        null, // No carId for brand promotions
        [{ productId: product.id, quantity: 1 }],
        true // Auto-mark as PAID (simulated)
      );

      // Apply yard brand promotion
      await applyYardBrandPromotion(order);

      // Reload profile to see updated promotion state
      const updatedProfile = await loadYardProfile();
      setYardProfile(updatedProfile);

      alert('הקידום יושם בהצלחה!');
    } catch (err: any) {
      console.error('Error purchasing promotion:', err);
      setError(err.message || 'שגיאה ברכישת הקידום');
    } finally {
      setIsApplying(false);
      setApplyingProductId(null);
    }
  };

  const formatDate = (timestamp: Timestamp | null | undefined): string => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const isPromotionActive = (until: Timestamp | null | undefined): boolean => {
    if (!until) return false;
    try {
      const date = until.toDate();
      return date > new Date();
    } catch {
      return false;
    }
  };

  const getPlanLabel = (plan: string): string => {
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

  // Compute plan and promotion - must be before any early returns to ensure hooks are called consistently
  const plan = userProfile?.subscriptionPlan || 'FREE';
  const promotion = yardProfile?.promotion;

  // Generate usage warnings - MUST be called before early return to avoid hook order violation
  const usageWarning = useMemo(() => {
    if (!userProfile || currentMonthLeads === null || loadingUsage) {
      return null;
    }

    const quota = getFreeMonthlyLeadQuota('YARD', plan);
    return generateUsageWarning({
      currentUsage: currentMonthLeads,
      quota,
      subscriptionPlan: plan,
      sellerType: 'YARD',
    });
  }, [userProfile, currentMonthLeads, plan, loadingUsage]);

  // Early return AFTER all hooks have been called
  if (loading) {
    return (
      <div className="yard-promotions-page">
        <div className="page-container">
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  // Use usage warning directly (promotion warnings can be added later if needed)
  const displayWarning = usageWarning;

  return (
    <div className="yard-promotions-page">
      <div className="page-container">
        <YardPageHeader
          title="קידום המגרש והצי שלי"
          actions={
            <button className="btn btn-secondary" onClick={() => navigate('/account')}>
              חזרה לאזור האישי
            </button>
          }
        />

        {error && <div className="error-message">{error}</div>}

        {/* Usage Warning Banner */}
        {displayWarning && <UpgradeWarningBanner warning={displayWarning} />}

        {/* Yard Brand Status */}
        <div className="promotion-status-section">
          <h2>סטטוס קידום המגרש</h2>
          
          <div className="plan-info-card">
            <h3>התכנית שלך: {getPlanLabel(plan)}</h3>
            {billingPlan && (
              <div className="plan-benefits">
                {billingPlan.includedBranding && (
                  <div className="plan-benefit-item">
                    <span className="benefit-icon">✓</span>
                    <span>קידום מגרש בסיסי כלול</span>
                  </div>
                )}
                {billingPlan.includedFeaturedCarSlots && billingPlan.includedFeaturedCarSlots > 0 && (
                  <div className="plan-benefit-item">
                    <span className="benefit-icon">✓</span>
                    <span>{billingPlan.includedFeaturedCarSlots} רכבי דגל כלולים</span>
                  </div>
                )}
                {billingPlan.includedBoostedCarSlots && billingPlan.includedBoostedCarSlots > 0 && (
                  <div className="plan-benefit-item">
                    <span className="benefit-icon">✓</span>
                    <span>{billingPlan.includedBoostedCarSlots} רכבים מוקפצים כלולים</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {promotion && (
            <div className="current-promotion-card">
              <h3>קידום פעיל</h3>
              {promotion.isPremium && (
                <div className="promotion-status-item">
                  <span className="promotion-badge premium">מגרש פרמיום</span>
                  {promotion.premiumUntil && isPromotionActive(promotion.premiumUntil) ? (
                    <span>עד {formatDate(promotion.premiumUntil)}</span>
                  ) : promotion.premiumUntil === null ? (
                    <span>ללא הגבלת זמן</span>
                  ) : null}
                </div>
              )}
              {promotion.showRecommendedBadge && (
                <div className="promotion-status-item">
                  <span className="promotion-badge recommended">מגרש מומלץ</span>
                  {promotion.premiumUntil && isPromotionActive(promotion.premiumUntil) && (
                    <span>עד {formatDate(promotion.premiumUntil)}</span>
                  )}
                </div>
              )}
              {promotion.featuredInStrips && (
                <div className="promotion-status-item">
                  <span className="promotion-badge featured">מופיע בסטריפים</span>
                  {promotion.premiumUntil && isPromotionActive(promotion.premiumUntil) && (
                    <span>עד {formatDate(promotion.premiumUntil)}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Brand-Level Promotion Products */}
        <div className="promotion-products-section">
          <h2>קידום נוסף למגרש</h2>
          <p className="section-description">
            רכוש חבילות קידום נוספות כדי להגדיל את החשיפה של המגרש שלך
          </p>

          {products.length === 0 ? (
            <div className="empty-state">
              <p>אין מוצרי קידום זמינים כרגע</p>
            </div>
          ) : (
            <div className="products-grid">
              {products.map((product) => (
                <div key={product.id} className="product-card">
                  <div className="product-header">
                    <h3 className="product-name">{product.name}</h3>
                    <div className="product-price">₪{product.price.toLocaleString()}</div>
                  </div>
                  {product.description && (
                    <p className="product-description">{product.description}</p>
                  )}
                  {product.durationDays && (
                    <p className="product-meta">
                      משך: {product.durationDays} יום{product.durationDays !== 1 ? 'ים' : ''}
                    </p>
                  )}
                  <button
                    className="btn btn-primary product-purchase-btn"
                    onClick={() => handlePurchaseProduct(product)}
                    disabled={isApplying}
                  >
                    {isApplying && applyingProductId === product.id
                      ? 'מיישם...'
                      : 'רכש קידום'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

