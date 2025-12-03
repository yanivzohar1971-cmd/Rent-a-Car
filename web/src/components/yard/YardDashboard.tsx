import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchLeadStatsForYard, fetchLeadMonthlyStatsForYardCurrentMonth, type LeadStats } from '../../api/leadsApi';
import { getFreeMonthlyLeadQuota } from '../../config/billingConfig';
import type { UserProfile } from '../../types/UserProfile';
import YardQrCard from './YardQrCard';
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

export default function YardDashboard({ userProfile }: YardDashboardProps) {
  const navigate = useNavigate();
  const { firebaseUser, userProfile: currentUserProfile } = useAuth();
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
        console.error('Error loading lead stats:', err);
        setLeadStatsError('לא ניתן לטעון את נתוני הלידים כרגע.');
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
        console.error('Error loading monthly lead stats:', err);
        setMonthlyError('אירעה שגיאה בטעינת נתוני הלידים לחודש הנוכחי.');
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
  
  // Compute usage ratio for contextual messages
  // Usage level thresholds (can be adjusted for better UX):
  // - LOW: usageRatio < 0.5 (shows positive message)
  // - NEAR LIMIT: 0.8 <= usageRatio <= 1.0 (shows warning)
  // - OVER LIMIT: usageRatio > 1.0 (shows over-quota message)
  // - Between 0.5 and 0.8: no message (normal usage range)
  const usageRatio = freeQuota > 0 ? used / freeQuota : 0;
  
  // Determine usage level and message based on thresholds
  const getUsageMessage = (): string | null => {
    if (freeQuota === 0) {
      return null; // No quota defined, skip warnings
    }
    
    if (usageRatio < 0.5) {
      // Level 1: LOW usage - positive reinforcement
      return 'יש לך עוד הרבה לידים זמינים החודש.';
    } else if (usageRatio >= 0.8 && usageRatio <= 1.0) {
      // Level 2: NEAR LIMIT - gentle warning
      return 'אתה מתקרב לסיום מכסת הלידים בחבילה הנוכחית.';
    } else if (usageRatio > 1.0) {
      // Level 3: OVER LIMIT - inform about potential charges
      return 'עברתם את מכסת הלידים הכלולים בחבילה. לידים נוספים עשויים להיות בתשלום לפי תנאי ההתקשרות.';
    }
    
    return null; // Between 0.5 and 0.8 - no message needed (normal usage)
  };
  
  const usageMessage = getUsageMessage();

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
        <h3>מגרש רכבים</h3>
        <p className="yard-display-name">{yardDisplayName}</p>
      </div>

      {/* QR Card */}
      {firebaseUser && (
        <YardQrCard yardId={firebaseUser.uid} yardName={yardDisplayName} />
      )}

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
            ) : monthlyError ? (
              <div className="yard-plan-quota-line">
                <span className="yard-plan-quota-error">{monthlyError}</span>
              </div>
            ) : (
              <>
                <div className="yard-plan-quota-line">
                  <span className="yard-plan-quota-label">לידים בחודש הנוכחי:</span>
                  <span className="yard-plan-quota-value">{used} מתוך {freeQuota} בחינם</span>
                </div>
                  {usageMessage && (
                    <div className={`yard-plan-quota-hint ${
                      usageRatio > 1.0 
                        ? 'yard-plan-quota-over' 
                        : usageRatio >= 0.8 
                          ? 'yard-plan-quota-warning' 
                          : 'yard-plan-quota-info'
                    }`}>
                      {usageMessage}
                    </div>
                  )}
                  {/* Upgrade CTA for high usage - shown when usageRatio >= 0.8 (near or over limit) */}
                  {usageRatio >= 0.8 && freeQuota > 0 && (
                    <div className="yard-plan-quota-cta">
                      <p className="yard-plan-quota-cta-text">
                        רוצה יותר לידים בחודש? דבר איתנו על שדרוג לחבילת PLUS/PRO.
                      </p>
                      {/* TODO: Replace with actual contact route or email when available */}
                      <a
                        href="mailto:YANIV_EMAIL_HERE"
                        className="yard-plan-quota-cta-button"
                      >
                        צור קשר
                      </a>
                    </div>
                  )}
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
            ) : leadStatsError ? (
              <p className="yard-leads-summary-error">{leadStatsError}</p>
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
      </div>
    </div>
  );
}

