# Production Deployment Checklist - Rental Companies Module

## Pre-Deployment Verification

### 1. Custom Claims Setup

**CRITICAL:** Storage rules require admin users to have custom claims. Without claims, admin users will be denied write access.

- [ ] Identify all admin users:
  ```bash
  # Query Firestore: users collection where isAdmin == true
  # Or check Firebase Console → Firestore → users collection
  ```

- [ ] Set `SUPER_ADMIN_EMAILS` environment variable:
  ```bash
  firebase functions:config:set super_admin_emails="admin1@example.com,admin2@example.com"
  # OR for newer projects:
  firebase functions:secrets:set SUPER_ADMIN_EMAILS="admin1@example.com,admin2@example.com"
  ```

- [ ] Deploy functions:
  ```bash
  firebase deploy --only functions
  ```

- [ ] Set custom claims for all admin users:
  ```typescript
  // From web app or Firebase Console
  const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');
  await setAdminClaim({ targetUid: 'admin-uid-here' });
  ```

- [ ] Verify claims are set:
  ```typescript
  const idTokenResult = await user.getIdTokenResult();
  console.log('Admin claim:', idTokenResult.claims.admin); // Should be true
  ```

## Deployment Steps

### Step 1: Deploy Storage Rules

```bash
firebase deploy --only storage
```

**Verify:**
- Rules deployed successfully
- No syntax errors in Firebase Console → Storage → Rules

### Step 2: Deploy Hosting (if web changes)

```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

**Verify:**
- Build completes without errors
- Hosting deployment successful
- Check Firebase Console → Hosting

### Step 3: Deploy Firestore Rules (if changed)

```bash
firebase deploy --only firestore:rules
```

**Note:** Firestore rules for `rentalCompanies` were removed in this batch. If you need them back, restore from git history.

## Post-Deployment Smoke Tests

### Test 1: Route Guard (Non-Admin)

1. Sign in as a **non-admin** user
2. Navigate to `/admin/rental-companies`
3. **Expected:** Immediate redirect to `/account` (before page renders)
4. **If fails:** Check `AdminRoute` component and router configuration

### Test 2: Route Guard (Admin)

1. Sign in as an **admin** user (with custom claim set)
2. Navigate to `/admin/rental-companies`
3. **Expected:** Page renders normally, shows rental companies list
4. **If fails:** 
   - Check `userProfile.isAdmin === true`
   - Verify custom claim: `idTokenResult.claims.admin === true`
   - Check browser console for errors

### Test 3: Storage Upload (Admin)

1. Sign in as **admin** user (with custom claim)
2. Go to `/admin/rental-companies`
3. Create or edit a company
4. Upload a logo file
5. **Expected:**
   - Upload succeeds (no 403 error)
   - File path: `rentalCompanies/{companyId}/logo.{ext}`
   - Logo appears in preview
6. **If fails:**
   - Check browser console for error code
   - Verify `request.auth.token.admin === true` in Storage rules
   - Check Firebase Console → Storage → Files for uploaded file

### Test 4: Storage Upload (Non-Admin)

1. Sign in as **non-admin** user
2. Attempt to upload a logo (if UI allows, or via direct API call)
3. **Expected:** Permission denied error (403)
4. **If fails:** Storage rules are not properly restricting access

### Test 5: Logo Cache Invalidation

1. As admin, upload a logo for a company
2. Note the logo URL
3. Upload a different logo (replace)
4. **Expected:** New logo appears within 1 day (cache max-age=86400)
5. **If fails:** Check `cacheControl` metadata in upload function

## Verification Checklist

After deployment, confirm:

- [ ] **Custom Claims:** All admin users have `admin: true` or `isAdmin: true` claim
- [ ] **Route Guard:** Non-admins redirected, admins can access
- [ ] **Storage Upload (Admin):** Upload succeeds, file path correct
- [ ] **Storage Upload (Non-Admin):** Upload fails with permission denied
- [ ] **Logo Cache:** Cache control set to 1 day (no immutable)
- [ ] **Deployed Targets:** Storage rules, hosting (if changed), functions (if changed)

## Rollback Plan

If issues occur:

1. **Storage Rules:** Restore previous rules from git:
   ```bash
   git checkout HEAD~1 -- storage.rules
   firebase deploy --only storage
   ```

2. **Hosting:** Rollback via Firebase Console → Hosting → Releases

3. **Functions:** Rollback via Firebase Console → Functions → Deployments

## Monitoring

After deployment, monitor:

- Firebase Console → Storage → Usage (for upload activity)
- Firebase Console → Functions → Logs (for `setAdminCustomClaim` calls)
- Browser console errors (for client-side issues)
- Network tab (for 403 errors on storage uploads)

## Support Contacts

If custom claims setup fails:
- Check `docs/ADMIN_CUSTOM_CLAIMS_SETUP.md` for detailed instructions
- Verify `SUPER_ADMIN_EMAILS` environment variable is set
- Check Functions logs for errors
