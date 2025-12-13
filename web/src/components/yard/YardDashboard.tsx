import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchLeadStatsForYard, fetchLeadMonthlyStatsForYardCurrentMonth, type LeadStats } from '../../api/leadsApi';
import { getFreeMonthlyLeadQuota } from '../../config/billingConfig';
import { generateUsageWarning } from '../../utils/usageWarnings';
import { UpgradeWarningBanner } from '../UpgradeWarningBanner';
import type { UserProfile } from '../../types/UserProfile';
import YardQrCard from './YardQrCard';
import YardLogo from './YardLogo';
import './YardDashboard.css';

interface YardDashboardProps {
  userProfile: UserProfile | null;
}

type YardActionCardProps = {
  title: string;
  subtitle: string;
  onClick: () => void;
};

const YardActionCard: React.FC<YardActionCardProps> = ({ title, subtitle, onClick }) => {
  return (
    <button type="button" className="yard-action-card" onClick={onClick}>
      <h4 className="yard-card-title">{title}</h4>
      <p className="yard-card-subtitle">{subtitle}</p>
    </button>
  );
};

/**
 * Extract error reason from Firebase error
 */
function getErrorReason(err: any): string {
  const code = err?.code || err?.errorInfo?.code || '';
  if (code === 'permission-denied') return 'permission-denied';
  if (code === 'failed-precondition' || code?.includes('index')) return 'missing index';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'unavailable';
  return 'unknown';
}

/**
 * Get user-friendly error message in Hebrew
 */
function getErrorMessage(reason: string): string {
  switch (reason) {
    case 'permission-denied':
      return 'אין הרשאה לטעון את נתוני הלידים.';
    case 'missing index':
      return 'נדרש אינדקס במסד הנתונים.';
    case 'unavailable':
      return 'שירות לא זמין כרגע.';
    default:
      return 'לא ניתן לטעון את נתוני הלידים כרגע.';
  }
}

export default function YardDashboard({ userProfile }: YardDashboardProps) {
  const navigate = useNavigate();
  const { firebaseUser, userProfile: currentUserProfile } = useAuth();
  const logoUrl = currentUserProfile?.yardLogoUrl ?? null;
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [leadStatsLoading, setLeadStatsLoading] = useState(false);
  const [leadStatsError, setLeadStatsError] = useState<string | null>(null);
  
  // Monthly leads stats for quota display
  const [monthlyLeads, setMonthlyLeads] = useState<number | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  const yardDisplayName = userProfile?.fullName || userProfile?.email || 'מגרש רכבים';

  // Load lead stats
  useEffect(() => {
    async function loadStats() {
      if (!firebaseUser?.uid) {
        return;
      }

      setLeadStatsLoading(true);
      setLeadStatsError(null);
      try {
        const stats = await fetchLeadStatsForYard(firebaseUser.uid);
        setLeadStats(stats);
      } catch (err: any) {
        const code = err?.code || err?.errorInfo?.code || '';
        const message = err?.message || err?.errorInfo?.message || '';
        const name = err?.name || '';
        const stack = err?.stack || '';
        const fullError = err;
        
        console.error('[LeadsLoad]', { code, message, name, stack, fullError });
        
        const reason = getErrorReason(err);
        setLeadStatsError(getErrorMessage(reason));
      } finally {
        setLeadStatsLoading(false);
      }
    }

    loadStats();
  }, [firebaseUser]);

  // Load monthly leads for quota display
  useEffect(() => {
    async function loadMonthlyStats() {
      if (!firebaseUser?.uid) {
        return;
      }

      setMonthlyLoading(true);
      setMonthlyError(null);
      try {
        const stats = await fetchLeadMonthlyStatsForYardCurrentMonth(firebaseUser.uid);
        setMonthlyLeads(stats.total);
      } catch (err: any) {
        const code = err?.code || err?.errorInfo?.code || '';
        const message = err?.message || err?.errorInfo?.message || '';
        const name = err?.name || '';
        const stack = err?.stack || '';
        const fullError = err;
        
        console.error('[LeadsLoad]', { code, message, name, stack, fullError });
        
        const reason = getErrorReason(err);
        setMonthlyError(getErrorMessage(reason));
      } finally {
        setMonthlyLoading(false);
      }
    }

    loadMonthlyStats();
  }, [firebaseUser]);

  // Compute plan and quota info
  const plan = currentUserProfile?.subscriptionPlan ?? 'FREE';
  const freeQuota = getFreeMonthlyLeadQuota('YARD', plan);
  const used = monthlyLeads ?? 0;

  // Generate usage warning using the helper
  const usageWarning = useMemo(() => {
    if (!currentUserProfile || monthlyLeads === null || monthlyLoading) {
      return null;
    }

    return generateUsageWarning({
      currentUsage: used,
      quota: freeQuota,
      subscriptionPlan: plan,
      sellerType: 'YARD',
    });
  }, [currentUserProfile, monthlyLeads, used, freeQuota, plan, monthlyLoading]);

  const getPlanLabel = (plan: string): string => {
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

  return (
    <div className="yard-dashboard">
      <div className="yard-dashboard-header">
        <div className="yard-dashboard-header-title-row">
          <h3>מגרש רכבים</h3>
          <YardLogo url={logoUrl} size={44} />
        </div>
        <p className="yard-display-name">{yardDisplayName}</p>
      </div>

      {/* QR Card */}
      {firebaseUser && (
        <YardQrCard yardId={firebaseUser.uid} yardName={yardDisplayName} />
      )}

      {/* Usage Warning Banner */}
      {usageWarning && <UpgradeWarningBanner warning={usageWarning} />}

      {/* Plan & Quota Card */}
      {firebaseUser && (
        <div className="yard-plan-quota-card">
          <h4 className="yard-plan-quota-title">התכנית שלך</h4>
          <div className="yard-plan-quota-content">
            <div className="yard-plan-quota-line">
              <span className="yard-plan-quota-label">תכנית:</span>
              <span className="yard-plan-quota-value">{getPlanLabel(plan)}</span>
            </div>
            {monthlyLoading ? (
              <div className="yard-plan-quota-line">
                <span className="yard-plan-quota-loading">טוען נתוני לידים לחודש הנוכחי...</span>
              </div>
            ) : (monthlyError || leadStatsError) ? (
              <div className="yard-plan-quota-line">
                <span className="yard-plan-quota-error">{monthlyError || leadStatsError}</span>
              </div>
            ) : (
              <>
                <div className="yard-plan-quota-line">
                  <span className="yard-plan-quota-label">לידים בחודש הנוכחי:</span>
                  <span className="yard-plan-quota-value">{used} מתוך {freeQuota} בחינם</span>
                </div>
                </>
              )}
            </div>
          </div>
        )}

      {/* Leads Summary Card */}
      {firebaseUser && (
        <div className="yard-leads-summary-card">
          <div className="yard-leads-summary-header">
            <h4 className="yard-leads-summary-title">לידים מהמגרש</h4>
            <button
              type="button"
              className="yard-leads-summary-button"
              onClick={() => navigate('/yard/leads')}
            >
              צפייה בכל הלידים
            </button>
          </div>
          <div className="yard-leads-summary-content">
            {leadStatsLoading ? (
              <p className="yard-leads-summary-loading">טוען...</p>
            ) : (leadStatsError || monthlyError) ? (
              <p className="yard-leads-summary-error">{leadStatsError || monthlyError}</p>
            ) : leadStats ? (
              <div className="yard-leads-summary-stats">
                <div className="yard-leads-stat-item">
                  <span className="yard-leads-stat-label">סה״כ:</span>
                  <span className="yard-leads-stat-value">{leadStats.total}</span>
                </div>
                <div className="yard-leads-stat-item">
                  <span className="yard-leads-stat-label">חדשים:</span>
                  <span className="yard-leads-stat-value yard-leads-stat-new">{leadStats.newCount}</span>
                </div>
                <div className="yard-leads-stat-item">
                  <span className="yard-leads-stat-label">בטיפול:</span>
                  <span className="yard-leads-stat-value yard-leads-stat-in-progress">{leadStats.inProgressCount}</span>
                </div>
                <div className="yard-leads-stat-item">
                  <span className="yard-leads-stat-label">נסגרו:</span>
                  <span className="yard-leads-stat-value yard-leads-stat-closed">{leadStats.closedCount}</span>
                </div>
                {leadStats.lostCount > 0 && (
                  <div className="yard-leads-stat-item">
                    <span className="yard-leads-stat-label">לא רלוונטי:</span>
                    <span className="yard-leads-stat-value yard-leads-stat-lost">{leadStats.lostCount}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="yard-actions-grid">
        <YardActionCard
          title="פרטי המגרש"
          subtitle="שם, כתובת, טלפון, לוגו"
          onClick={() => navigate('/yard/profile')}
        />
        <YardActionCard
          title="צי הרכב שלי"
          subtitle="ניהול רכבים במגרש – הוספה, עריכה, פרסום"
          onClick={() => navigate('/yard/fleet')}
        />
        <YardActionCard
          title="יבוא צי מקובץ Excel"
          subtitle="יבוא רכבים מהמחשב למערכת"
          onClick={() => navigate('/yard/import')}
        />
        <YardActionCard
          title="פרסום חכם"
          subtitle="פרסם, הסתר וטייוטה לפי פילטרים"
          onClick={() => navigate('/yard/smart-publish')}
        />
        <YardActionCard
          title="לידים"
          subtitle="פניות על רכבים – ניהול וטיפול"
          onClick={() => navigate('/yard/leads')}
        />
        <YardActionCard
          title="ביקושים חמים"
          subtitle="צפייה בביקושים בשוק לפי דגמים"
          onClick={() => navigate('/yard/demand')}
        />
        <YardActionCard
          title="סטטיסטיקות"
          subtitle="צפיות, לידים וימים באוויר לכל רכב"
          onClick={() => navigate('/yard/stats')}
        />
        <YardActionCard
          title="קידום המגרש והצי שלי"
          subtitle="הגדרת מגרש מומלץ, רכבי דגל, וקידום מודעות בצי"
          onClick={() => navigate('/yard/promotions')}
        />
        <YardActionCard
          title="היסטוריית מכירות"
          subtitle="צפייה בכל הרכבים שנמכרו"
          onClick={() => navigate('/yard/sales-history')}
        />
      </div>
    </div>
  );
}

