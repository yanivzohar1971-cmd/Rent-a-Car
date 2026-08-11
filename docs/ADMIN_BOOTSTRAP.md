# Admin Bootstrap Instructions

## Granting Admin Access

To grant admin privileges to a user, you have two options:

### Option 1: Add to Allowlist (Recommended for Bootstrapping)

1. Open Firebase Console: https://console.firebase.google.com/
2. Navigate to: Firestore Database → Data tab
3. Find or create the document: `config/admins`
4. Ensure the document has a field `uids` (array of strings)
5. Add the user's UID to the `uids` array
6. Save the document

**Note:** After adding to allowlist, the user should:
- Sign out and sign back in (to refresh their session)
- Optionally call `setAdminCustomClaim` to set the token claim (see Option 2)

### Option 2: Set Custom Claim (Required for Storage Rules)

For Storage rules to work correctly (e.g., uploading rental company logos), the user must have the `admin` custom claim set in their token.

1. Ensure the user is already in `config/admins` allowlist (Option 1), OR
2. Ensure the caller's email is in the `SUPER_ADMIN_EMAILS` environment variable (for Functions)

Then call the Cloud Function:
```javascript
const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');
await setAdminClaim({ targetUid: 'user-uid-here' });
```

**Important:** After setting the custom claim, the user must:
- Sign out completely
- Sign back in
- The token will now include `admin: true`

## Verification

To verify admin access:

1. **Check Firestore Rules:** User can create/update/delete `rentalCompanies` documents
2. **Check Storage Rules:** User can upload to `rentalCompanies/{companyId}/logo.*` paths
3. **Check Web UI:** User can access admin pages (e.g., `/admin/rental-companies`)

### Debug Info (DEV Mode Only)

When opening the admin rental companies modal in development mode, you'll see:
- Current UID
- Token `claims.admin` status (true/false)

This helps diagnose permission issues.

## Troubleshooting

**Issue:** "אין הרשאה לשמור חברת השכרה" error

**Solutions:**
1. Verify UID is in `config/admins.uids` in Firestore Console
2. Verify token has `admin: true` claim (check debug info in modal)
3. If token claim is missing, call `setAdminCustomClaim` and re-login
4. Check Firestore rules are deployed (should check both token.admin and config/admins)

**Issue:** Logo upload fails with permission-denied

**Solutions:**
1. Storage rules only check token claims (cannot read Firestore)
2. Ensure `admin: true` custom claim is set (via `setAdminCustomClaim`)
3. User must sign out and sign back in after claim is set

## Security Notes

- `config/admins` document is protected: only admins can read/write it
- Custom claims are cached in tokens: users must re-login after claim changes
- Storage rules cannot read Firestore, so they only check token claims
- Firestore rules check both token claims AND allowlist for flexibility
