# Admin Custom Claims Setup Guide

## Overview

Storage rules for `rentalCompanies/**` require admin users to have custom claims set via Firebase Admin SDK. This document explains how to ensure admin users have the required claims.

## Required Custom Claim

Storage rules check for:
- `request.auth.token.admin == true` OR
- `request.auth.token.isAdmin == true`

The function `setAdminCustomClaim` sets `{ admin: true }`.

## Setting Up Custom Claims

### Option 1: Using the Callable Function (Recommended)

A callable function `setAdminCustomClaim` is available, restricted to super-admin emails.

#### Prerequisites

1. Set environment variable `SUPER_ADMIN_EMAILS` in Firebase Functions config:
   ```bash
   firebase functions:config:set super_admin_emails="admin@example.com,super@example.com"
   ```
   Or for newer Firebase projects (using .env or secrets):
   ```bash
   firebase functions:secrets:set SUPER_ADMIN_EMAILS="admin@example.com,super@example.com"
   ```

2. Deploy functions:
   ```bash
   firebase deploy --only functions
   ```

#### Usage

From client code (web app) or Firebase Console:

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');

// Set admin claim for a user
const result = await setAdminClaim({ targetUid: 'user-uid-here' });
console.log(result.data.message);
```

**Important:** After setting the claim, the user must:
1. Sign out
2. Sign in again

This is required because Firebase Auth tokens are cached. The new claim will only be available after re-authentication.

### Option 2: One-Time Node Script

If you prefer a one-time script, create `functions/scripts/setAdminClaims.ts`:

```typescript
import * as admin from 'firebase-admin';

admin.initializeApp();

async function setAdminClaims(uids: string[]) {
  for (const uid of uids) {
    try {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
      console.log(`✓ Set admin claim for ${uid}`);
    } catch (error) {
      console.error(`✗ Failed for ${uid}:`, error);
    }
  }
}

// List of admin UIDs
const adminUids = [
  'uid1-here',
  'uid2-here',
  // Add more UIDs as needed
];

setAdminClaims(adminUids)
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

Run with:
```bash
cd functions
npm run build
node lib/scripts/setAdminClaims.js
```

## Verifying Custom Claims

### From Client Code

```typescript
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;

if (user) {
  const idTokenResult = await user.getIdTokenResult();
  console.log('Admin claim:', idTokenResult.claims.admin);
  console.log('IsAdmin claim:', idTokenResult.claims.isAdmin);
}
```

### From Firebase Console

1. Go to Authentication → Users
2. Find the user
3. Check "Custom claims" field (may require viewing raw JSON)

## Production Checklist

Before deploying storage rules that require custom claims:

- [ ] Identify all admin users (check `users/{uid}` where `isAdmin == true`)
- [ ] Set `SUPER_ADMIN_EMAILS` environment variable in Functions
- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Set custom claims for all admin users using `setAdminCustomClaim`
- [ ] Verify claims are set (user signs out/in, check `getIdTokenResult()`)
- [ ] Deploy storage rules: `firebase deploy --only storage`
- [ ] Test storage upload as admin user (should succeed)
- [ ] Test storage upload as non-admin user (should fail with permission-denied)

## Troubleshooting

### "Permission denied" on storage upload

1. Check if user has custom claim:
   ```typescript
   const idTokenResult = await user.getIdTokenResult();
   console.log(idTokenResult.claims);
   ```

2. If claim is missing:
   - Ensure `SUPER_ADMIN_EMAILS` is set correctly
   - Call `setAdminCustomClaim` with the user's UID
   - User must sign out and sign in again

3. If claim exists but still fails:
   - Check storage rules syntax
   - Verify the claim name matches (`admin` or `isAdmin`)
   - Check Firebase Console → Storage → Rules for deployment status

### Function not found

- Ensure functions are deployed: `firebase deploy --only functions`
- Check function name matches: `setAdminCustomClaim`
- Verify you're calling from the correct Firebase project

## Security Notes

- Custom claims are included in ID tokens and are visible to clients
- Only set `admin: true` for users who truly need admin access
- The `setAdminCustomClaim` function is restricted to super-admin emails
- Consider rotating super-admin emails periodically
- Monitor function logs for unauthorized access attempts
