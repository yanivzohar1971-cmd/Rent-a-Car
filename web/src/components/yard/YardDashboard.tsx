import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchLeadStatsForYard, type LeadStats } from '../../api/leadsApi';
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
  const { firebaseUser } = useAuth();
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [leadStatsLoading, setLeadStatsLoading] = useState(false);
  const [leadStatsError, setLeadStatsError] = useState<string | null>(null);

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

