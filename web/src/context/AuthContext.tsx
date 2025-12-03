import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../firebase/firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, User as FirebaseUser } from 'firebase/auth';
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
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      // onAuthStateChanged will fire and load profile
    } catch (err: any) {
      console.error('signIn error', err);
      setError('שם משתמש או סיסמה לא נכונים');
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

