import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthAsync, getFirestoreAsync } from '../firebase/firebaseClientLazy';
import type { User as FirebaseUser } from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import type { UserProfile } from '../types/UserProfile';
import { buildUserProfileForWrite, ensureUserDocExistsOrMerge, type PrimaryRole } from '../services/auth/userProfile';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string, phoneNumber?: string, primaryRole?: PrimaryRole) => Promise<void>;
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

    // Map Android schema (displayName, phoneNumber) to web schema (fullName, phone)
    return {
      uid,
      email: data.email ?? '',
      fullName: data.fullName ?? data.displayName ?? '', // Support both schemas
      phone: data.phone ?? data.phoneNumber ?? '', // Support both schemas
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
        
        // Do NOT auto-create Firestore doc here - missing doc must remain missing
        // so RequireProfileGuard can redirect to /complete-profile for role selection
        if (user) {
          // Just log if doc is missing - let the app handle it via CompleteProfilePage
          try {
            const db = await getFirestoreAsync();
            const { doc, getDoc } = await import('firebase/firestore');
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              console.log(`[AuthContext] User doc missing on auth state change: ${user.uid} - will redirect to /complete-profile`);
            }
          } catch (docErr: any) {
            // Log but don't block - profile loading will handle the error
            console.error('[AuthContext] Failed to check user doc on auth state change:', {
              uid: user.uid,
              errorCode: docErr.code,
              errorMessage: docErr.message,
            });
          }
        }
        
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
      // Public routes (/, /cars, etc.): delay auth initialization to avoid blocking critical path
      // Only initialize auth when user interacts (login button) or visits protected routes
      const isPublicRoute = ['/', '/cars', '/blog', '/car/', '/yard/'].some(route => 
        window.location.pathname === route || window.location.pathname.startsWith(route)
      );
      
      if (isPublicRoute) {
        // Delay auth initialization on public routes to prevent auth/iframe.js from blocking render
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            initPromise = initAuth();
            initPromise.then((unsubscribe) => {
              unsub = unsubscribe;
            }).catch((err) => {
              console.error('Failed to initialize auth', err);
              setLoading(false);
            });
          }, { timeout: 2000 });
        } else {
          setTimeout(() => {
            initPromise = initAuth();
            initPromise.then((unsubscribe) => {
              unsub = unsubscribe;
            }).catch((err) => {
              console.error('Failed to initialize auth', err);
              setLoading(false);
            });
          }, 500);
        }
      } else {
        // Protected routes: initialize immediately (but still lazy-load Firebase)
        initPromise = initAuth();
        initPromise.then((unsubscribe) => {
          unsub = unsubscribe;
        }).catch((err) => {
          console.error('Failed to initialize auth', err);
          setLoading(false);
        });
      }
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
      const { signInWithEmailAndPassword, reload } = await import('firebase/auth');
      
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;
      
      // Reload user to get latest emailVerified status (matching Android behavior)
      await reload(user);
      
      // Do NOT auto-create Firestore doc here - missing doc must remain missing
      // so the app can redirect to /complete-profile for role selection
      // onAuthStateChanged will fire and load profile (or return null if missing)
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

      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;
      
      // Do NOT auto-create Firestore doc here - missing doc must remain missing
      // so the app can redirect to /complete-profile for role selection
      // onAuthStateChanged will fire and load the user profile from Firestore (or return null if missing)
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

  const handleSignUp = async (
    email: string,
    password: string,
    displayName?: string,
    phoneNumber?: string,
    primaryRole: PrimaryRole = 'PRIVATE_USER'
  ) => {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Lazy-load Firebase Auth
      const auth = await getAuthAsync();
      const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
      
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;
      
      console.log(`[AuthContext] User created in Firebase Auth: ${user.uid}`);
      
      // Send email verification (matching Android behavior)
      try {
        await sendEmailVerification(user);
        console.log(`[AuthContext] Email verification sent to: ${normalizedEmail}`);
      } catch (verifyErr: any) {
        // Don't fail signup if verification email fails (matching Android behavior)
        console.warn('[AuthContext] Failed to send email verification (signup continues):', verifyErr);
      }
      
      // Ensure user document exists in Firestore with full profile (matching Android signup)
      try {
        const db = await getFirestoreAsync();
        const profilePayload = buildUserProfileForWrite(user, displayName, phoneNumber, primaryRole);
        await ensureUserDocExistsOrMerge(db, user.uid, profilePayload);
        console.log(`[AuthContext] User profile created in Firestore: ${user.uid}, primaryRole=${profilePayload.primaryRole}, requestedRole=${profilePayload.requestedRole || 'null'}`);
      } catch (docErr: any) {
        // Firestore write failure is critical for signup - fail the signup
        console.error('[AuthContext] Failed to create user doc during signup:', {
          uid: user.uid,
          projectId: auth.app.options.projectId,
          errorCode: docErr.code,
          errorMessage: docErr.message,
        });
        
        // Delete the auth user since we couldn't create the Firestore doc
        try {
          await user.delete();
        } catch (deleteErr) {
          console.error('[AuthContext] Failed to delete auth user after Firestore failure:', deleteErr);
        }
        
        throw new Error(
          `נכשל יצירת פרופיל המשתמש במסד הנתונים. ` +
          `אנא נסה שוב או פנה לתמיכה. ` +
          `(uid=${user.uid}, projectId=${auth.app.options.projectId})`
        );
      }
      
      // onAuthStateChanged will fire and load profile
    } catch (err: any) {
      const fbErr = err as FirebaseError;
      console.error('signUp error', fbErr.code, fbErr.message);

      let msg = 'שגיאה בהרשמה. נסה שוב.';

      if (fbErr.code === 'auth/email-already-in-use') {
        msg = 'כתובת האימייל כבר בשימוש.';
      } else if (fbErr.code === 'auth/invalid-email') {
        msg = 'כתובת הדוא״ל אינה תקינה.';
      } else if (fbErr.code === 'auth/weak-password') {
        msg = 'הסיסמה חייבת להכיל לפחות 6 תווים.';
      } else if (fbErr.message && fbErr.message.includes('נכשל יצירת פרופיל')) {
        msg = fbErr.message; // Use the detailed error from Firestore failure
      }

      setError(msg);
      throw err;
    }
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
    signUp: handleSignUp,
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

