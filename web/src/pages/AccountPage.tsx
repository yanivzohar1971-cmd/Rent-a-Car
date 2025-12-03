import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AccountPage.css';
import { useAuth } from '../context/AuthContext';
import { getAvailablePersonas, getDefaultPersona } from '../types/Roles';
import type { PersonaView } from '../types/Roles';
import { RoleSwitcher } from '../components/RoleSwitcher';
import YardDashboard from '../components/yard/YardDashboard';

export default function AccountPage() {
  const { firebaseUser, userProfile, loading, error, signIn, signOut, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<PersonaView | null>(null);

  // When profile changes, choose default persona
  useEffect(() => {
    if (userProfile) {
      const def = getDefaultPersona(userProfile);
      setSelectedPersona(def);
    } else {
      setSelectedPersona(null);
    }
  }, [userProfile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await signIn(email, password);
    } catch {
      // error is already set in context
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch {
      // Error is already handled and stored in context (error state)
    }
  };

  const handleLogout = async () => {
    await signOut();
    setEmail('');
    setPassword('');
  };

  if (loading) {
    return (
      <div className="account-page">
        <div className="card">
          <p>טוען את פרטי המשתמש...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="account-page">
        <div className="card">
          <h2>התחברות לאזור האישי</h2>
          <p className="subtitle">הזן דוא״ל וסיסמה כפי שנרשמת באפליקציה / במערכת</p>
          <form onSubmit={handleSubmit} className="login-form">
            <label>
              דוא״ל
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </label>
            <label>
              סיסמה
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary-btn">
              התחבר
            </button>

            <div className="login-separator">
              <span>או</span>
            </div>

            <button
              type="button"
              className="google-btn"
              onClick={handleGoogleLogin}
            >
              התחברות עם Google
            </button>
          </form>
          <p className="note">כרגע תמיכה בהרשמה/ניהול משתמשים נעשית מהאפליקציה. כאן רק התחברות.</p>
        </div>
      </div>
    );
  }

  const personas = getAvailablePersonas(userProfile);
  const activePersona = selectedPersona && personas.includes(selectedPersona)
    ? selectedPersona
    : (getDefaultPersona(userProfile) || null);

  return (
    <div className="account-page">
      <div className="card">
        <div className="account-header">
          <div>
            <h2>האזור האישי</h2>
            <p className="subtitle">
              {userProfile?.fullName || firebaseUser.email} ({userProfile?.status ?? 'ACTIVE'})
            </p>
          </div>
          <button type="button" className="secondary-btn" onClick={handleLogout}>
            יציאה מהחשבון
          </button>
        </div>

        <RoleSwitcher
          personas={personas}
          selected={activePersona}
          onChange={setSelectedPersona}
        />

        <div className="persona-content">
          {activePersona ? (
            <PersonaViewContent persona={activePersona} />
          ) : (
            <p>לא נמצאו תפקידים פעילים עבור משתמש זה.</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface PersonaViewContentProps {
  persona: PersonaView;
}

function PersonaViewContent({ persona }: PersonaViewContentProps) {
  switch (persona) {
    case 'YARD':
      return <YardDashboardView />;
    case 'AGENT':
      return <AgentDashboardView />;
    case 'BUYER':
      return <BuyerDashboardView />;
    case 'SELLER':
      return <SellerDashboardView />;
    default:
      return null;
  }
}

function YardDashboardView() {
  const { userProfile } = useAuth();
  return <YardDashboard userProfile={userProfile} />;
}

function BuyerDashboardView() {
  const navigate = useNavigate();
  return (
    <div className="persona-section">
      <h3>אזור אישי - קונה</h3>
      <p className="muted">
        כאן יוצגו חיפושים שמורים, רכבים שסימנת למעקב וטופסי יצירת קשר ששלחת.
      </p>
      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          className="primary-btn"
          onClick={() => navigate('/account/saved-searches')}
        >
          חיפושים שמורים / התראות
        </button>
      </div>
    </div>
  );
}

function SellerDashboardView() {
  return (
    <div className="persona-section">
      <h3>אזור אישי - מוכר</h3>
      <p className="muted">
        כאן תוכל לנהל מודעות מכירה פרטיות, לראות סטטוס (טיוטה/מפורסם/הסתיים) ולצפות בפניות.
      </p>
      <div className="persona-actions-grid">
        <Link to="/seller/account" className="action-card">
          <h4>המודעות שלי</h4>
          <p>נהל את המודעות שפרסמת - ערוך, השהה, או סמן כנמכר</p>
        </Link>
        <Link to="/sell" className="action-card">
          <h4>פרסם מודעה חדשה</h4>
          <p>הוסף מודעת רכב חדשה למכירה</p>
        </Link>
        <Link to="/account/saved-searches" className="action-card">
          <h4>חיפושים שמורים / התראות</h4>
          <p>נהל את החיפושים השמורים שלך וקבל התראות</p>
        </Link>
      </div>
    </div>
  );
}

function AgentDashboardView() {
  const navigate = useNavigate();
  return (
    <div className="persona-section">
      <h3>אזור אישי - סוכן</h3>
      <p className="muted">
        כאן יופיעו לקוחות וטיפולים בתיקים, כולל רכבים שאתה משווק עבור מוכרים פרטיים ומגרשים.
      </p>
      <div style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          className="primary-btn"
          onClick={() => navigate('/account/saved-searches')}
        >
          חיפושים שמורים / התראות
        </button>
      </div>
    </div>
  );
}

