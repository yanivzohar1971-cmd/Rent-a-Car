import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types/UserProfile';
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

  const yardDisplayName = userProfile?.fullName || userProfile?.email || 'מגרש רכבים';

  return (
    <div className="yard-dashboard">
      <div className="yard-dashboard-header">
        <h3>מגרש רכבים</h3>
        <p className="yard-display-name">{yardDisplayName}</p>
      </div>

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
      </div>
    </div>
  );
}

