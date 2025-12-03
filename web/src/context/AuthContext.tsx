import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { auth, db } from '../firebase/firebaseClient';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { doc, getDoc } from 'firebase/firestore';
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
      status: data.status ?? 'ACTIVE',
      primaryRole: data.primaryRole ?? null,
      requestedRole: data.requestedRole ?? null,
      roleStatus: data.roleStatus ?? 'NONE',
    };
  }

  const loadProfile = async (user: FirebaseUser | null) => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    try {
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setError(null);
      await loadProfile(user);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
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
          const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
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
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      await signInWithPopup(auth, provider);
      // onAuthStateChanged will fire and load the user profile as usual
    } catch (err: any) {
      console.error('Google sign-in error', err);
      // Keep a generic but clear error; do NOT override the detailed email/password messages
      setError('שגיאה בהתחברות עם Google. נסה שוב.');
      throw err;
    }
  };

  const handleSignOut = async () => {
    setError(null);
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

