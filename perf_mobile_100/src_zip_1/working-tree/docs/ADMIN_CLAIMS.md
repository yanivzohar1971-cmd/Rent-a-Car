# Admin Custom Claims Setup

This document explains how to set up admin custom claims for Firebase Auth users, which are required for Storage and Firestore security rules that check `request.auth.token.admin`.

## Overview

Firebase Security Rules can check custom claims in the auth token (`request.auth.token.admin` or `request.auth.token.isAdmin`). This is the preferred method for admin checks because:

1. It works consistently across both Firestore and Storage rules
2. It doesn't require reading from Firestore (faster, no extra reads)
3. It's more secure (claims are cryptographically signed)

## Prerequisites

1. **Firebase Admin SDK** - The bootstrap script uses Firebase Admin SDK
2. **Service Account Key** - A JSON key file from Firebase Console
3. **Node.js** - Version 18+ (the script uses ES modules)

## Step 1: Download Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to: **Project Settings** → **Service Accounts** tab
4. Click **Generate New Private Key**
5. Save the JSON file to a secure location (e.g., `service-account-key.json` in project root)
6. **IMPORTANT**: Never commit this file to git (it's already in `.gitignore`)

## Step 2: Install Dependencies (if needed)

The script uses `firebase-admin` which should be available from the `functions` directory. If you need to install it separately:

```bash
cd functions
npm install firebase-admin
```

Or install globally:
```bash
npm install -g firebase-admin
```

## Step 3: Run the Bootstrap Script

### By Email

```bash
node tools/setAdminClaims.mjs admin@example.com ./service-account-key.json
```

### By UID

If you know the user's UID:

```bash
node tools/setAdminClaims.mjs abc123xyz456 ./service-account-key.json
```

### Default Service Account Path

If you place the service account key at `./service-account-key.json` (project root), you can omit the path:

```bash
node tools/setAdminClaims.mjs admin@example.com
```

## Step 4: User Must Re-authenticate

⚠️ **IMPORTANT**: After setting custom claims, the user must:
1. Sign out of the application
2. Sign in again

Custom claims are included in the ID token, which is only refreshed on sign-in. The user's current session will not have the new claims until they re-authenticate.

## Verification

After the user re-authenticates, you can verify the claims are working:

1. **In the browser console** (for web app):
   ```javascript
   // After user is logged in
   const user = firebase.auth().currentUser;
   user.getIdTokenResult().then(tokenResult => {
     console.log('Custom claims:', tokenResult.claims);
     console.log('Is admin:', tokenResult.claims.admin || tokenResult.claims.isAdmin);
   });
   ```

2. **Check Firestore/Storage rules** - Try accessing admin-only resources. If rules are working, you should have access.

## Troubleshooting

### "User not found"
- Verify the email address or UID is correct
- Check that the user exists in Firebase Authentication

### "Error loading service account key"
- Verify the JSON file path is correct
- Check that the file is valid JSON
- Ensure the file has proper read permissions

### "Permission denied" after setting claims
- User must sign out and sign in again
- Wait a few seconds after sign-in for token refresh
- Check browser console for token claims

### Rules still not working
- Verify the rules are deployed: `firebase deploy --only firestore:rules,storage`
- Check that the rules use `request.auth.token.admin` or `request.auth.token.isAdmin`
- Verify the user's token actually contains the claims (see Verification section)

## Security Notes

1. **Never commit service account keys** - They have full admin access to your Firebase project
2. **Store keys securely** - Use environment variables or secure vaults in production
3. **Limit access** - Only trusted administrators should have access to the service account key
4. **Rotate keys periodically** - Generate new keys and revoke old ones

## Script Location

The bootstrap script is located at: `tools/setAdminClaims.mjs`

For more details, see the script's inline documentation.
