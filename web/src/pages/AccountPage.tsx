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
  const { firebaseUser, userProfile, loading, error, signIn, signUp, signOut, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedRole, setSelectedRole] = useState<'PRIVATE_USER' | 'AGENT' | 'YARD'>('PRIVATE_USER');
  const [isSignupMode, setIsSignupMode] = useState(false);
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

  // Redirect to /complete-profile if authenticated but missing profile/role
  useEffect(() => {
    if (!loading && firebaseUser) {
      const hasRole = userProfile?.primaryRole && userProfile.primaryRole.trim() !== '';
      if (!userProfile || !hasRole) {
        // User is authenticated but missing profile or role - redirect to complete profile
        navigate('/complete-profile', { replace: true });
      }
    }
  }, [firebaseUser, userProfile, loading, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      if (isSignupMode) {
        await signUp(email, password, displayName || undefined, phoneNumber || undefined, selectedRole);
      } else {
        await signIn(email, password);
      }
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
    const isPrivilegedRole = selectedRole === 'AGENT' || selectedRole === 'YARD';
    
    return (
      <div className="account-page">
        <div className="card">
          <h2>{isSignupMode ? 'הרשמה לאזור האישי' : 'התחברות לאזור האישי'}</h2>
          <p className="subtitle">
            {isSignupMode 
              ? 'צור חשבון חדש או התחבר לחשבון קיים'
              : 'הזן דוא״ל וסיסמה כפי שנרשמת באפליקציה / במערכת'}
          </p>
          <form onSubmit={handleSubmit} className="login-form">
            {isSignupMode && (
              <>
                <label>
                  שם מלא (אופציונלי)
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="הכנס את שמך המלא"
                    dir="rtl"
                  />
                </label>
                <label>
                  מספר טלפון (אופציונלי)
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="05X-XXXXXXX"
                    dir="ltr"
                  />
                </label>
              </>
            )}
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
                minLength={6}
              />
            </label>
            
            {isSignupMode && (
              <label>
                סוג משתמש <span className="required">*</span>
                <div className="role-selector-inline">
                  <label className="role-option-inline">
                    <input
                      type="radio"
                      name="role"
                      value="PRIVATE_USER"
                      checked={selectedRole === 'PRIVATE_USER'}
                      onChange={() => setSelectedRole('PRIVATE_USER')}
                    />
                    <span>משתמש פרטי</span>
                  </label>
                  <label className="role-option-inline">
                    <input
                      type="radio"
                      name="role"
                      value="AGENT"
                      checked={selectedRole === 'AGENT'}
                      onChange={() => setSelectedRole('AGENT')}
                    />
                    <span>סוכן</span>
                  </label>
                  <label className="role-option-inline">
                    <input
                      type="radio"
                      name="role"
                      value="YARD"
                      checked={selectedRole === 'YARD'}
                      onChange={() => setSelectedRole('YARD')}
                    />
                    <span>מגרש רכבים</span>
                  </label>
                </div>
                {isPrivilegedRole && (
                  <p className="role-warning-inline">
                    <strong>שים לב:</strong> תפקיד זה דורש אישור מנהל. החשבון שלך יהיה פעיל כמשתמש פרטי עד לאישור.
                  </p>
                )}
              </label>
            )}
            
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary-btn">
              {isSignupMode ? 'הירשם' : 'התחבר'}
            </button>

            <div className="login-separator">
              <span>או</span>
            </div>

            <button
              type="button"
              className="google-btn"
              onClick={handleGoogleLogin}
            >
              {isSignupMode ? 'הרשמה עם Google' : 'התחברות עם Google'}
            </button>
            
            <div className="auth-mode-toggle">
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setIsSignupMode(!isSignupMode);
                }}
              >
                {isSignupMode 
                  ? 'יש לך כבר חשבון? התחבר'
                  : 'אין לך חשבון? הירשם'}
              </button>
            </div>
          </form>
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
        <Link to="/admin/sellers/exposure" className="action-card">
          <h4>חשיפת מוכרים</h4>
          <p>בקרת מה שכל מוכר מציג בפומבי: שם, לוגו, טלפון, וואטסאפ</p>
        </Link>
        <Link to="/admin/rental-companies" className="action-card">
          <h4>חברות השכרה (לוגואים)</h4>
          <p>ניהול לוגו, פרסום בדף הבית, סדר תצוגה ואתרי חברות.</p>
        </Link>
        <Link to="/admin/content-wizard" className="action-card">
          <h4>מחולל תוכן</h4>
          <p>יצירת Brief JSON עבור תוכן SEO ובלוג באמצעות שאלון מובנה</p>
        </Link>
        <Link to="/admin/debug" className="action-card">
          <h4>DEBUG</h4>
          <p>אבחון ובדיקות בריאות - Publish/Projection/Queries</p>
        </Link>
        <Link to="/admin/feature-flags" className="action-card">
          <h4>Feature Flags (Debug)</h4>
          <p>הפעלה/כיבוי של כפתורי דיבאג ואינדיקטורים לציבור</p>
        </Link>
        <Link to="/admin/tenants" className="action-card">
          <h4>לקוחות SaaS (Tenants)</h4>
          <p>יצירת לקוח, מנוי וניסיון, חסימה, דומיינים והפניה ל-Website Builder</p>
        </Link>
        <Link to="/admin/tenant-domains" className="action-card">
          <h4>Tenant Domains</h4>
          <p>ניהול מיפוי דומיינים ל-tenant ועדכון מצב enabled ללא עבודה ידנית ב-Firestore</p>
        </Link>
        <Link to="/admin/tenant-site-builder" className="action-card">
          <h4>Website Builder</h4>
          <p>בניית אתר לקוח: תצוגה מקדימה, סדר סקשנים, העלאת מדיה, tenantSiteConfigs ו-dataScope</p>
        </Link>
        <Link to="/admin/clone-editor" className="action-card">
          <h4>Clone Website (WYSIWYG)</h4>
          <p>ייבוא אתר קיים, עריכת טקסטים/תמונות/קישורים ושמירה כ-template.</p>
        </Link>
      </div>
    </div>
  );
}

