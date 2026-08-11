# Google Sign-In Mechanism — Rent A Car / CarExperts4u — Extract & Implementation Spec

**Document purpose:** Extract the entire Google registration / Google Sign-In mechanism from the Rent A Car (CarExperts4u) project for porting to another project (e.g. SWIMMING). Bit-level detail: files, functions, Firestore/Storage rules, schema, failure modes, and step-by-step porting guide.

---

## 0. Executive Summary

| Item | Detail |
|------|--------|
| **Auth method** | Firebase Auth with **Google** provider; **popup** only (no redirect flow in codebase). |
| **Email/password** | Yes. Email/password sign-in and sign-up are enabled alongside Google. |
| **Custom claims** | Yes. Admin is determined by **custom claims** (`admin` or `isAdmin`) and/or Firestore `config/admins` allowlist. Storage rules use **claims only** (no Firestore read). |
| **User profile document** | **Not** created automatically on first Google login. User doc is created only when: (1) **Email/password sign-up** in `AuthContext.handleSignUp` → `ensureUserDocExistsOrMerge`, or (2) **Complete profile** step after any sign-in → `CompleteProfilePage` calls `ensureUserDocExistsOrMerge`. New Google users without a doc are redirected to `/complete-profile` to choose role and complete profile (name, phone, role). |
| **Role model** | **Firestore-first.** Role lives in `users/{uid}` (e.g. `primaryRole`, `requestedRole`, `roleStatus`, `isYard`, `isAgent`, `isAdmin`). Admin **authorization** uses custom claims for rules; admin **identity** in the app uses `userProfile.isAdmin` (from Firestore) and `AdminRoute` / `isAdmin()` in Functions. |

---

## 1. Firebase Console Configuration — EXACT CHECKLIST

- [ ] **Project:** Create or select Firebase project (e.g. for SWIMMING).
- [ ] **Authentication → Sign-in method:** Enable **Google**. No additional scopes configured in client (only default profile).
- [ ] **Authentication → Settings → Authorized domains:** Add every origin used for sign-in:
  - `localhost` (development)
  - Your hosting domain(s), e.g. `yourapp.web.app`, `yourapp.firebaseapp.com`
  - Any custom domain (e.g. `www.yourapp.com`) if used.
- [ ] **OAuth client IDs (Web):** In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials, ensure the **Web client** for this project is present. Firebase Console → Project Settings → Your apps shows the same. No redirect URI needed for **popup** flow.
- [ ] **Redirect URIs:** Only needed if you add **redirect** flow later. For current Rent A Car implementation (popup only), no redirect URIs are set in code.
- [ ] **Firebase Hosting:** If using Hosting, the default `*.web.app` and `*.firebaseapp.com` are auto-authorized. For custom domain, add it under Authorized domains.
- [ ] **PWA:** No special configuration in repo; same domains apply. No service worker used for auth in this project (service workers are unregistered on load).

---

## 2. Client Implementation — FILE-BY-FILE

### 2.1 Firebase init

| File | Purpose | Exports / key behavior |
|------|--------|------------------------|
| `web/src/firebase/firebaseClient.ts` | Eager gateway: single Firebase app, Auth/Firestore/Storage/Functions initialized at import. | `db`, `auth`, `storage`, `functions`; re-exports from `firebase/*`. Used by admin/authenticated code paths. |
| `web/src/firebase/firebaseClientLazy.ts` | Lazy gateway: app created on first use; Auth/Firestore/Storage/Functions loaded via **async** getters to avoid loading `auth/iframe.js` on homepage. | `getApp()`, `getAuthAsync()`, `getFirestoreAsync()`, `getStorageAsync()`, `getFunctionsAsync()`. **AuthContext and all auth flows use this lazy module.** |

- **Config:** Firebase config is **hardcoded** in both files (no `VITE_*` or `.env` for Firebase in this repo). Same object in both:
  - `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`.
- **Singleton:** One `FirebaseApp`; Auth/Firestore/Storage/Functions are singletons (lazy-initialized in lazy module).

### 2.2 Auth layer

| File | Purpose | Exports / key behavior |
|------|--------|------------------------|
| `web/src/context/AuthContext.tsx` | Holds Firebase user, user profile (from Firestore `users/{uid}`), loading, error; exposes `signIn`, `signUp`, `signOut`, `signInWithGoogle`, `refreshProfile`. | `AuthProvider`, `useAuth()`. |
| `web/src/services/auth/userProfile.ts` | Builds and merges user doc payload; ensures `users/{uid}` exists. | `buildUserProfileForWrite`, `ensureUserDocExistsOrMerge`, type `PrimaryRole`, `UserProfileWrite`. |
| `web/src/types/UserProfile.ts` | Read model for profile (used in UI). | `UserProfile`, `SubscriptionPlan`. |

**Flow: user clicks Google → provider → Firebase Auth → auth state → Firestore doc (or redirect to complete-profile):**

1. User clicks "התחברות עם Google" / "הרשמה עם Google" on **AccountPage**.
2. **AccountPage** calls `signInWithGoogle()` from `useAuth()`.
3. **AuthContext** `handleSignInWithGoogle`:
   - `auth = await getAuthAsync()` (lazy).
   - `GoogleAuthProvider` with `setCustomParameters({ prompt: "select_account" })`.
   - `signInWithPopup(auth, provider)`.
   - No Firestore write here; comment states missing doc is intentional so app can redirect to `/complete-profile`.
4. **onAuthStateChanged** (in AuthContext) runs: sets `firebaseUser`, then loads profile by `getDoc(users/{uid})`. If doc missing, `userProfile` stays null (and logs that user will be redirected to complete-profile).
5. **RequireProfileGuard** (on protected routes): if `firebaseUser` but no `userProfile` or no `primaryRole`, redirects to `/complete-profile`.
6. **CompleteProfilePage**: user chooses role (PRIVATE_USER / AGENT / YARD), optional name/phone; on submit calls `buildUserProfileForWrite` + `ensureUserDocExistsOrMerge` → creates/merges `users/{uid}`. Then full reload to refresh context.

**Popup vs redirect:** Only **popup** is used. No `signInWithRedirect` or `getRedirectResult`; no mobile/redirect branching.

**Google provider config:**
- Scopes: default (no extra scopes).
- Custom params: `prompt: "select_account"` (choose account each time).

**Error handling (Google):**
- `auth/popup-closed-by-user` → "סגרת את חלון ההתחברות..."
- `auth/popup-blocked` → "הדפדפן חסם את חלון ההתחברות..."
- `auth/unauthorized-domain` → "הדומיין הזה אינו מאושר..."
- `auth/operation-not-allowed` → "ההתחברות עם Google אינה מופעלת..."
- `auth/cancelled-popup-request` → "בקשת ההתחברות הקודמת בוטלה..."
- Default → generic message with `fbErr.code`.

### 2.3 UI and routing

| File | Purpose |
|------|--------|
| `web/src/pages/AccountPage.tsx` | Login/signup form (email/password) + **Google button**; when authenticated and profile complete, shows account dashboard and role switcher. |
| `web/src/pages/CompleteProfilePage.tsx` | Role selection + optional name/phone; submits via `ensureUserDocExistsOrMerge`; then `window.location.reload()`. |
| `web/src/router.tsx` | React Router; `/account` unguarded; `/complete-profile` wrapped in **RequireAuthGuard** only; seller/yard/admin routes wrapped in **RequireProfileGuard** or **AdminRoute**. |
| `web/src/components/common/RequireAuthGuard.tsx` | If not authenticated → redirect to `/account` (replace, state `returnTo`). |
| `web/src/components/common/RequireProfileGuard.tsx` | If not authenticated → `/account`; if authenticated but no profile or no `primaryRole` → `/complete-profile`. |
| `web/src/components/common/AdminRoute.tsx` | If not authenticated or `userProfile.isAdmin !== true` → `<Navigate to="/account" />`. |

**Role separation:** Different route trees for yard (`/yard/*`), seller (`/seller/*`, `/sell`), admin (`/admin/*`), account (`/account`, `/complete-profile`). Same **AccountPage** for login/signup; after login, role-specific screens are separate (no shared screen across roles).

### 2.4 App bootstrap

| File | Purpose |
|------|--------|
| `web/src/main.tsx` | Renders `AuthProvider` wrapping app; then `RouterProvider` with `router`. No env-based Firebase config. |

---

## 3. "User Document" (Firestore) — KISS Schema

- **Collection:** `users`.
- **Document ID:** `uid` (Firebase Auth UID).

**Fields written by client (from `buildUserProfileForWrite` / `ensureUserDocExistsOrMerge`):**

| Field | Type | When set |
|-------|------|----------|
| `uid` | string | Always (in payload). |
| `email` | string | Normalized (trim, lowercase). |
| `displayName` | string \| null | From form or `firebaseUser.displayName`. |
| `phoneNumber` | string \| null | From form (optional). |
| `createdAt` | number (ms) | Only when **creating** new doc. |
| `lastLoginAt` | number (ms) | Every merge. |
| `emailVerified` | boolean | From Auth. |
| `role` | string | Legacy: `"AGENT"` or `"USER"`. |
| `isPrivateUser`, `canBuy`, `canSell`, `isAgent`, `isYard` | boolean | From selected role. |
| `status` | string | `"ACTIVE"` or `"PENDING_APPROVAL"` (for AGENT/YARD request). |
| `primaryRole` | string | `"PRIVATE_USER"` \| `"AGENT"` \| `"YARD"` \| `"ADMIN"`. |
| `requestedRole` | string \| null | Set when user requests AGENT/YARD. |
| `roleStatus` | string | `"NONE"` \| `"PENDING"` \| `"APPROVED"` \| `"REJECTED"`. |

**Read path (AuthContext `mapUserProfile`):**
- `fullName` = `data.fullName ?? data.displayName` (Android uses `displayName`, web exposes `fullName` in UI).
- `phone` = `data.phone ?? data.phoneNumber`.
- `isAdmin` = `data.isAdmin === true` (Firestore field; admin can also be via custom claims for rules).

**Writes:**
- **Create:** `setDoc(ref, payload, { merge: true })` when doc does not exist.
- **Update:** Same ref; merge only "safe" fields (`lastLoginAt`, `emailVerified`, optional displayName/phoneNumber if missing; role fields only if not already set).
- **Who writes:** Email/password sign-up in AuthContext; CompleteProfilePage after Google (or any) sign-in when doc is missing or role empty.

**Cloud Function:** `adminUsersIndex` trigger on `users/{uid}` **onWrite** updates `adminUsersIndex/{uid}` (roles, primaryRole, etc.) for admin dashboard. It does **not** create `users/{uid}`.

---

## 4. Role & Authorization Model

- **Source of truth for role (app UI/routing):** Firestore `users/{uid}`: `primaryRole`, `requestedRole`, `roleStatus`, `isYard`, `isAgent`, `isAdmin`.
- **Admin for Firestore rules:** Custom claims **or** `config/admins` allowlist. Rule helper `isAdmin()` uses `isAdminClaim() || get(config/admins).data.uids`.
- **Admin for Storage rules:** **Custom claims only** (`request.auth.token.admin` or `request.auth.token.isAdmin`). Storage cannot read Firestore; allowlist admins must have claim set (e.g. via `setAdminCustomClaim` callable).
- **Admin in client:** `userProfile.isAdmin === true` (from Firestore). **AdminRoute** and admin-only UI use this.
- **How role is set:** User chooses on sign-up (email/password) or on **CompleteProfilePage** (Google or any first-time). AGENT/YARD start as `primaryRole: "PRIVATE_USER"`, `requestedRole: "AGENT"|"YARD"`, `roleStatus: "PENDING"`. Admin can later update `users/{uid}` (and optionally set custom claims via `setAdminCustomClaim`).
- **Route gating:**
  - **RequireAuthGuard:** must have `firebaseUser`.
  - **RequireProfileGuard:** must have `firebaseUser` and `userProfile` with non-empty `primaryRole`.
  - **AdminRoute:** must have `userProfile.isAdmin === true`.
- **Role separation:** Enforced by separate routes and guards; no shared screens between YARD / AGENT / ADMIN / USER.

---

## 5. Firestore Security Rules — FULL

**File:** `firestore.rules` (project root).

**Relevant blocks for auth/profile:**

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdminClaim() {
      return request.auth != null
        && (request.auth.token.admin == true || request.auth.token.isAdmin == true);
    }

    function isAdmin() {
      return request.auth != null
        && (
          isAdminClaim()
          || (request.auth.uid in get(/databases/$(database)/documents/config/admins).data.uids)
        );
    }

    match /users/{userId} {
      allow read: if isAuthenticated()
                  && (request.auth.uid == userId || isAdmin());
      allow write: if isAuthenticated()
                   && (request.auth.uid == userId || isAdmin());
    }

    match /users/{userId}/{subcollection}/{docId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
    match /users/{userId}/{subcollection}/{docId}/{nestedCollection}/{nestedDocId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }

    // ... other collections (publicCars, leads, config/admins, etc.) ...

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- **users/{userId}:** Read/write if authenticated and (owner or admin). So: user can create/update own doc; admin can read/update any user.
- **users/{userId}/...** subcollections: Only owner.
- **config/admins:** Authenticated read (so `isAdmin()` can `get()`); write only via `isAdminClaim()` to avoid recursion.
- Default catch-all denies all.

---

## 6. Storage Security Rules — FULL

**File:** `storage.rules` (project root).

**Relevant excerpts:**

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function isAdmin() {
      return request.auth != null
             && (request.auth.token.admin == true || request.auth.token.isAdmin == true);
    }

    function isValidImageUpload() {
      return request.resource != null
             && request.resource.size < 10 * 1024 * 1024  // 10 MB
             && request.resource.contentType.matches('image/.*');
    }

    match /public/listings/{listingId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && isValidImageUpload();
    }

    match /users/{userId}/cars/{carId}/images/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && isValidImageUpload();
    }

    match /users/{userId}/yard/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && isValidImageUpload();
    }

    match /yardImports/{yardUid}/{fileName} {
      allow write: if request.auth != null
                   && request.auth.uid == yardUid
                   && request.resource.size < 10 * 1024 * 1024
                   && (contentType Excel/CSV);
      allow read: if request.auth != null && request.auth.uid == yardUid;
    }

    match /rentalCompanies/{companyId}/{fileName} {
      allow read: if true;
      allow write, delete: if isAdmin() && isValidRentalCompanyLogo() && fileName.matches('logo\\..*');
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- **Path conventions:** `users/{uid}/...` for private data; `public/listings/...` for public listing images; `rentalCompanies/...` for logos (admin write).
- **Role/capability:** Storage uses only Auth uid and token claims (no Firestore). Admin = custom claims only.

---

## 7. Step-by-Step Porting Guide to SWIMMING Project

1. **Firebase Console**
   - Create/select project.
   - Enable Google sign-in; add Authorized domains (localhost, hosting, custom).
   - (Optional) Create Web app to get config.

2. **Dependencies**
   - Add `firebase` (e.g. `npm install firebase`).
   - Use same major version as Rent A Car if you want to mirror behavior.

3. **Config**
   - Prefer env for SWIMMING: e.g. `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc., and build a `firebaseConfig` object.
   - Create a single init module (eager or lazy) that `initializeApp(firebaseConfig)` and exposes `getAuth()`, `getFirestore()`, etc.

4. **AuthProvider + hooks**
   - Implement a context that: holds `firebaseUser`, `userProfile` (from `users/{uid}`), `loading`, `error`; subscribes with `onAuthStateChanged`; loads profile with `getDoc(doc(db, 'users', user.uid))`; exposes `signInWithGoogle`, `signOut`, and optionally email/password.
   - Google: `GoogleAuthProvider` + `signInWithPopup`; set `prompt: 'select_account'` if desired.
   - Map Firestore doc to a `UserProfile` type (e.g. fullName, email, role, isAdmin).

5. **Create `users` doc on first sign-in**
   - **Option A (like Rent A Car):** Do **not** create doc in auth listener; redirect to a "complete profile" page when `user` exists but `users/{uid}` is missing or has no role; on that page call an `ensureUserDocExistsOrMerge`-style function with role/name/phone.
   - **Option B:** Create doc in `onAuthStateChanged` when user is new (e.g. no doc) with default role and merge-safe fields.
   - Use merge semantics and do not overwrite admin-managed fields once set.

6. **Role gating**
   - **RequireAuthGuard:** redirect to login if no `firebaseUser`.
   - **RequireProfileGuard:** redirect to complete-profile if no profile or no primaryRole.
   - **AdminRoute** (if needed): redirect if `!userProfile?.isAdmin`.
   - Keep role-specific routes/screens separate per your "global role separation" rule.

7. **Rules**
   - Deploy Firestore rules: at least `users/{userId}` read/write for owner and admin; subcollections owner-only; default deny.
   - Deploy Storage rules: `users/{uid}/...` owner-only; public/admin paths as needed; default deny.

8. **UI**
   - Login/signup screen: email/password (if used) + "Continue with Google" calling `signInWithGoogle()`.
   - Complete-profile screen (if Option A): role selection + optional name/phone; submit → create/merge `users/{uid}` then refresh or redirect.

9. **Verification**
   - New user with Google → no doc → redirect to complete-profile → submit → doc created → can access protected routes.
   - Existing user → doc exists → profile loaded → no redirect to complete-profile.
   - Check Firebase Console → Authentication (user exists) and Firestore `users/{uid}` (fields as expected).
   - Test from authorized domain only; test popup blocked / closed and error messages.

---

## 8. Failure Modes & Debugging

| Symptom | Cause | Fix |
|--------|--------|-----|
| `auth/unauthorized-domain` | Origin not in Authorized domains | Add domain in Firebase Console → Authentication → Settings → Authorized domains. |
| Popup blocked | Browser blocks `signInWithPopup` | User must allow popups or use redirect flow (not in current Rent A Car). |
| Redirect loops | Guard redirects to login, then login redirects back | Ensure login/complete-profile paths are **excluded** from RequireProfileGuard (e.g. don't require profile on `/account`, `/complete-profile`). |
| "Missing or insufficient permissions" | Rules or path mismatch | Check `request.auth.uid == userId` for `users/{uid}`; ensure rules deployed; check collection name and document ID. |
| Rules not applied | Rules not deployed or wrong project | `firebase deploy --only firestore:rules` and `firebase deploy --only storage`; confirm project in `.firebaserc`. |
| Wrong project / keys | Config for another project | Use correct `firebaseConfig` (or env) for the project; confirm Auth and Firestore are same project. |
| Hosting domain not authorized | Custom domain not in list | Add exact origin (e.g. `https://www.yoursite.com`) in Authorized domains. |
| Admin can't write Storage | Allowlist admin without claim | Call `setAdminCustomClaim` for that user (or set claim in Admin SDK) so Storage `isAdmin()` sees token. |

---

## 9. Minimal Reference Code Snippets (from existing project)

**Firebase init (lazy) — `web/src/firebase/firebaseClientLazy.ts`:**

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "...",
  authDomain: "carexpert-94faa.firebaseapp.com",
  projectId: "carexpert-94faa",
  storageBucket: "carexpert-94faa.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."
};

let app: FirebaseApp | null = null;
function getApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

let _auth: Auth | null = null;
export async function getAuthAsync(): Promise<Auth> {
  if (_auth) return _auth;
  const { getAuth } = await import('firebase/auth');
  _auth = getAuth(getApp());
  return _auth;
}
```

**Google sign-in — `web/src/context/AuthContext.tsx`:**

```ts
const auth = await getAuthAsync();
const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
await signInWithPopup(auth, provider);
```

**Ensure user doc — `web/src/services/auth/userProfile.ts` + Firestore:**

```ts
const userRef = doc(firestore, 'users', uid);
const existingDoc = await getDoc(userRef);
if (!existingDoc.exists()) {
  await setDoc(userRef, payload, { merge: true });
} else {
  // merge only safe fields (lastLoginAt, emailVerified, ...)
  await setDoc(userRef, mergePayload, { merge: true });
}
```

**Auth state listener — `web/src/context/AuthContext.tsx`:**

```ts
const auth = await getAuthAsync();
const { onAuthStateChanged } = await import('firebase/auth');
const unsub = onAuthStateChanged(auth, async (user) => {
  setFirebaseUser(user);
  if (user) {
    const db = await getFirestoreAsync();
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    const profile = snap.exists() ? mapUserProfile(user.uid, snap.data()) : null;
    setUserProfile(profile);
  } else {
    setUserProfile(null);
  }
  setLoading(false);
});
return unsub;
```

---

## 10. Verification Matrix

| Scenario | Auth state | Firestore doc | UI route | Firestore rules | Storage rules |
|----------|------------|---------------|----------|------------------|---------------|
| New user, Google sign-in, no doc yet | Logged in | None | Redirect to `/complete-profile` | N/A (no read of users yet for profile) | N/A |
| User completes profile (role + submit) | Logged in | `users/{uid}` created/merged | Redirect after reload; then e.g. `/account` | allow write: owner | allow write: owner for `users/{uid}/...` |
| Returning user, has doc | Logged in | `users/{uid}` loaded | Protected routes allowed | allow read: owner or admin | allow read/write by uid for own paths |
| Unauthenticated | null | N/A | Redirect to `/account` | Deny (isAuthenticated() false) | Deny |
| Admin (claim or allowlist) | Logged in | Doc may have isAdmin | Can access `/admin/*` | allow read/write users: admin | allow write rentalCompanies etc.: isAdmin() |

---

## Constraints and Gaps (from repo)

- **Not in repo:** No `.env` or `VITE_*` Firebase config; config is **hardcoded**. For SWIMMING, using env is **recommended** (PROPOSED).
- **No redirect flow:** Only popup; no `signInWithRedirect`/`getRedirectResult`. Mobile/Safari popup issues are possible; document suggests enabling redirect or domain allowlist if needed.
- **No Auth onCreate trigger:** User doc is **not** created by a Cloud Function on first login; creation is client-side (sign-up or complete-profile). PROPOSED: optional Cloud Function onCreate to create a minimal doc if you want server-side default.
- **Offline:** Auth state persists via Firebase SDK; profile is read on load. No explicit offline-first doc in this extract; behavior is "reload when back online" implied.
- **PWA install:** No special handling; same domains and popup flow apply.

---

*Extracted from Rent A Car / CarExperts4u codebase. All paths and code snippets refer to that project.*
