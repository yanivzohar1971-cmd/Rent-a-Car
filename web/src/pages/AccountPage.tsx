import { FormEvent, useEffect, useState } from 'react';
import './AccountPage.css';
import { useAuth } from '../context/AuthContext';
import { getAvailablePersonas, getDefaultPersona, PersonaView } from '../types/Roles';
import { RoleSwitcher } from '../components/RoleSwitcher';

export default function AccountPage() {
  const { firebaseUser, userProfile, loading, error, signIn, signOut } = useAuth();
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
  return (
    <div className="persona-section">
      <h3>אזור אישי - מגרש</h3>
      <ul className="quick-links">
        <li><a href="/yard/cars/new">הוסף רכב למגרש</a></li>
        <li><a href="/yard/cars">צי הרכב שלי (בפיתוח בהמשך מצד WEB)</a></li>
        <li><span className="muted">פרסום חכם (כרגע מנוהל בעיקר מהאפליקציה)</span></li>
      </ul>
    </div>
  );
}

function BuyerDashboardView() {
  return (
    <div className="persona-section">
      <h3>אזור אישי - קונה</h3>
      <p className="muted">
        כאן יוצגו חיפושים שמורים, רכבים שסימנת למעקב וטופסי יצירת קשר ששלחת.
      </p>
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
    </div>
  );
}

function AgentDashboardView() {
  return (
    <div className="persona-section">
      <h3>אזור אישי - סוכן</h3>
      <p className="muted">
        כאן יופיעו לקוחות וטיפולים בתיקים, כולל רכבים שאתה משווק עבור מוכרים פרטיים ומגרשים.
      </p>
    </div>
  );
}

