import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthAsync, getFirestoreAsync } from '../firebase/firebaseClientLazy';
import type { User as FirebaseUser } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import type { UserProfile } from '../types/UserProfile';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper: map raw Firestore data to UserProfile
  function mapUserProfile(uid: string, data: any | undefined | null): UserProfile | null {
    if (!data) return null;

    // Validate subscriptionPlan
    let subscriptionPlan: 'FREE' | 'PLUS' | 'PRO' | undefined = undefined;
    if (data.subscriptionPlan && ['FREE', 'PLUS', 'PRO'].includes(data.subscriptionPlan)) {
      subscriptionPlan = data.subscriptionPlan as 'FREE' | 'PLUS' | 'PRO';
    }

    return {
      uid,
      email: data.email ?? '',
      fullName: data.fullName ?? '',
      phone: data.phone ?? '',
      role: data.role ?? null,
      canBuy: data.canBuy ?? true,
      canSell: data.canSell ?? true,
      isAgent: data.isAgent ?? false,
      isYard: data.isYard ?? false,
      isAdmin: data.isAdmin === true, // Explicit boolean check
      status: data.status ?? 'ACTIVE',
      primaryRole: data.primaryRole ?? null,
      requestedRole: data.requestedRole ?? null,
      roleStatus: data.roleStatus ?? 'NONE',
      subscriptionPlan,
      yardLogoUrl: data.yardLogoUrl ?? null,
    };
  }

  const loadProfile = async (user: FirebaseUser | null) => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    try {
      // Lazy-load Firestore only when needed
      const db = await getFirestoreAsync();
      const { doc, getDoc } = await import('firebase/firestore');
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setUserProfile(null);
        return;
      }
      const profile = mapUserProfile(user.uid, snap.data());
      setUserProfile(profile);
    } catch (err: any) {
      console.error('Failed to load user profile', err);
      setError('שגיאה בטעינת פרטי המשתמש');
    }
  };

  useEffect(() => {
    setLoading(true);
    
    // Delay auth initialization on homepage to prevent auth/iframe.js from blocking render
    // Only delay if we're on the homepage (pathname === '/')
    const isHomepage = window.location.pathname === '/';
    
    const initAuth = async () => {
      // Lazy-load Firebase Auth only when needed
      const auth = await getAuthAsync();
      const { onAuthStateChanged } = await import('firebase/auth');
      
      const unsub = onAuthStateChanged(auth, async (user) => {
        setFirebaseUser(user);
        setError(null);
        await loadProfile(user);
        setLoading(false);
      });
      return unsub;
    };

    let unsub: (() => void) | null = null;
    let initPromise: Promise<() => void> | null = null;

    if (isHomepage) {
      // Delay auth initialization until after first paint on homepage
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          initPromise = initAuth();
          initPromise.then((unsubscribe) => {
            unsub = unsubscribe;
          }).catch((err) => {
            console.error('Failed to initialize auth', err);
            setLoading(false);
          });
        }, { timeout: 1000 });
      } else {
        setTimeout(() => {
          initPromise = initAuth();
          initPromise.then((unsubscribe) => {
            unsub = unsubscribe;
          }).catch((err) => {
            console.error('Failed to initialize auth', err);
            setLoading(false);
          });
        }, 100);
      }
    } else {
      // Non-homepage: initialize immediately (but still lazy-load Firebase)
      initPromise = initAuth();
      initPromise.then((unsubscribe) => {
        unsub = unsubscribe;
      }).catch((err) => {
        console.error('Failed to initialize auth', err);
        setLoading(false);
      });
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Lazy-load Firebase Auth
      const auth = await getAuthAsync();
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // onAuthStateChanged will fire and load profile
    } catch (err: any) {
      const fbErr = err as FirebaseError;
      console.error('signIn error', fbErr.code, fbErr.message);

      let msg = 'שגיאה בהתחברות. נסה שוב.';

      if (fbErr.code === 'auth/invalid-email') {
        msg = 'כתובת הדוא״ל אינה תקינה.';
      } else if (fbErr.code === 'auth/user-disabled') {
        msg = 'המשתמש חסום או לא פעיל במערכת.';
      } else if (fbErr.code === 'auth/user-not-found') {
        msg = 'לא נמצא משתמש רשום עם הדוא״ל הזה בפרויקט הנוכחי.';
      } else if (fbErr.code === 'auth/wrong-password') {
        msg = 'הסיסמה שגויה.';
      } else if (fbErr.code === 'auth/too-many-requests') {
        msg = 'יותר מדי ניסיונות כושלים. נסה שוב מאוחר יותר.';
      } else if (fbErr.code === 'auth/invalid-credential') {
        msg = 'לא ניתן לאמת את פרטי ההתחברות.';

        try {
          // Check which sign-in methods exist for this email
          const authInstance = await getAuthAsync();
          const { fetchSignInMethodsForEmail: fetchMethods } = await import('firebase/auth');
          const methods = await fetchMethods(authInstance, normalizedEmail);
          console.info('signIn methods for', normalizedEmail, methods);

          if (methods.includes('google.com') && !methods.includes('password')) {
            msg = 'המשתמש הזה מוגדר להתחברות עם Google בלבד. התחבר באמצעות כפתור Google.';
          }
        } catch (methodsErr) {
          console.error('fetchSignInMethodsForEmail failed', methodsErr);
        }
      }

      setError(msg);
      throw err;
    }
  };

  const handleSignInWithGoogle = async () => {
    setError(null);

    try {
      // Lazy-load Firebase Auth
      const auth = await getAuthAsync();
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account", // let the user choose between multiple Google accounts
      });

      await signInWithPopup(auth, provider);
      // onAuthStateChanged will fire and load the user profile from Firestore
    } catch (err: any) {
      const fbErr = err as FirebaseError;
      console.error("Google sign-in error", fbErr.code, fbErr.message);

      let msg = "שגיאה בהתחברות עם Google. נסה שוב.";

      switch (fbErr.code) {
        case "auth/popup-closed-by-user":
          msg = "סגרת את חלון ההתחברות של Google לפני סיום התהליך.";
          break;

        case "auth/popup-blocked":
          msg =
            "הדפדפן חסם את חלון ההתחברות של Google. בטל חסימת פופ-אפים עבור האתר ואז נסה שוב.";
          break;

        case "auth/unauthorized-domain":
          msg =
            "הדומיין הזה אינו מאושר להתחברות עם Google. ודא שכתובת האתר נוספה לרשימת Authorized domains במסך Authentication → Settings ב-Firebase.";
          break;

        case "auth/operation-not-allowed":
          msg =
            "ההתחברות עם Google אינה מופעלת בפרויקט Firebase. יש להפעיל את ספק Google במסך Authentication → Sign-in method בקונסולת Firebase.";
          break;

        case "auth/cancelled-popup-request":
          msg = "בקשת ההתחברות הקודמת בוטלה בגלל פתיחת חלון התחברות נוסף.";
          break;

        default:
          msg = `שגיאה בהתחברות עם Google (${fbErr.code}). נסה שוב.`;
          break;
      }

      setError(msg);
      throw err;
    }
  };

  const handleSignOut = async () => {
    setError(null);
    // Lazy-load Firebase Auth
    const auth = await getAuthAsync();
    const { signOut: firebaseSignOut } = await import('firebase/auth');
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    await loadProfile(firebaseUser);
  };

  const value: AuthContextValue = {
    firebaseUser,
    userProfile,
    loading,
    error,
    signIn: handleSignIn,
    signOut: handleSignOut,
    refreshProfile,
    signInWithGoogle: handleSignInWithGoogle,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

