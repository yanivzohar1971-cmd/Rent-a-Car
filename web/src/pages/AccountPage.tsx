import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AccountPage.css';
import { useAuth } from '../context/AuthContext';
import { getAvailablePersonas, getDefaultPersona } from '../types/Roles';
import type { PersonaView } from '../types/Roles';
import { RoleSwitcher } from '../components/RoleSwitcher';
import YardDashboard from '../components/yard/YardDashboard';
import type { UserProfile } from '../types/UserProfile';

// ============================================================
// Role Badge Logic
// ============================================================
type PrimaryRoleCode = 'ADMIN' | 'YARD' | 'AGENT' | 'SELLER' | 'BUYER' | 'UNKNOWN';

const ROLE_LABELS_HE: Record<PrimaryRoleCode, string> = {
  ADMIN: 'מנהל מערכת',
  YARD: 'מגרש',
  AGENT: 'סוכן',
  SELLER: 'מוכר',
  BUYER: 'קונה',
  UNKNOWN: 'משתמש',
};

const ROLE_EMOJIS: Record<PrimaryRoleCode, string> = {
  ADMIN: '🛡️',
  YARD: '🏢',
  AGENT: '🤝',
  SELLER: '💼',
  BUYER: '🧍‍♂️',
  UNKNOWN: '👤',
};

function getPrimaryRoleCode(profile: UserProfile | null | undefined): PrimaryRoleCode {
  if (!profile) return 'UNKNOWN';

  // Use type assertion via unknown for checking legacy fields that may exist on Firestore doc
  const p = profile as unknown as Record<string, unknown>;

  if (profile.isAdmin === true) return 'ADMIN';
  if (profile.isYard === true || p.yard === true) return 'YARD';
  if (profile.isAgent === true || p.agent === true) return 'AGENT';

  // Private "marketplace" roles - prefer SELLER if canSell is true
  if (profile.canSell === true) return 'SELLER';
  if (profile.canBuy === true || p.isPrivateUser === true || p.privateUser === true) {
    return 'BUYER';
  }

  return 'UNKNOWN';
}

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

  // Compute role badge
  const roleCode = getPrimaryRoleCode(userProfile);
  const roleLabel = ROLE_LABELS_HE[roleCode];
  const roleEmoji = ROLE_EMOJIS[roleCode];

  return (
    <div className="account-page">
      <div className="card">
        <div className="account-header">
          <div className="account-header-info">
            <h2>האזור האישי</h2>
            <div className="account-header-meta">
              <span className="account-role-badge" aria-label={`סוג משתמש: ${roleLabel}`}>
                <span className="account-role-emoji">{roleEmoji}</span>
                <span className="account-role-text">{roleLabel}</span>
              </span>
              <span className="account-email">
                {userProfile?.fullName || firebaseUser.email}
                {userProfile?.status && ` (${userProfile.status})`}
              </span>
            </div>
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
          {userProfile?.isAdmin === true ? (
            <AdminDashboardView />
          ) : activePersona ? (
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
        <Link to="/seller/leads" className="action-card">
          <h4>הלידים שלי</h4>
          <p>צפה בפניות שקיבלת על הרכבים שפרסמת כמוכר פרטי</p>
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

function AdminDashboardView() {
  return (
    <div className="persona-section">
      <h3>אזור אישי - מנהל מערכת</h3>
      <p className="muted">
        כאן תוכל לנהל את כל הלידים במערכת, לצפות בסטטיסטיקות של מגרשים ומוכרים פרטיים.
      </p>
      <div className="persona-actions-grid">
        <Link to="/admin/customers" className="action-card">
          <h4>ניהול לקוחות</h4>
          <p>ניהול מגרשים, סוכנים ולקוחות פרטיים, כולל חבילות ודילים</p>
        </Link>
        <Link to="/admin/leads" className="action-card">
          <h4>לידים</h4>
          <p>צפייה וניהול כל הלידים במערכת - מגרשים ומוכרים פרטיים</p>
        </Link>
        <Link to="/admin/plans" className="action-card">
          <h4>חבילות ותכניות</h4>
          <p>ניהול חבילות (FREE/PLUS/PRO) למגרשים ולמוכרים פרטיים</p>
        </Link>
        <Link to="/admin/billing" className="action-card">
          <h4>חיוב ודוחות</h4>
          <p>צפייה בלידים חודשיים, מכסות ולידים לחיוב.</p>
        </Link>
        <Link to="/admin/revenue" className="action-card">
          <h4>דשבורד הכנסות (סגירת חודשים)</h4>
          <p>סיכום הכנסות לפי חודשים ורבעונים מסגירות תקופות חיוב.</p>
        </Link>
        <Link to="/admin/revenue-dashboard" className="action-card">
          <h4>דשבורד הכנסות - זמן אמת</h4>
          <p>צפייה בהכנסות בזמן אמת מלידים וקידומים, כולל ייצוא CSV.</p>
        </Link>
        <Link to="/admin/promotion-products" className="action-card">
          <h4>מוצרי קידום</h4>
          <p>ניהול מוצרי קידום למוכרים פרטיים ולמגרשים (Boost, Highlight, Media+).</p>
        </Link>
        <Link to="/admin/promotion-orders" className="action-card">
          <h4>הזמנות קידום</h4>
          <p>מעקב אחר הזמנות קידום, סימון כשולם ויישום קידומים.</p>
        </Link>
      </div>
    </div>
  );
}

