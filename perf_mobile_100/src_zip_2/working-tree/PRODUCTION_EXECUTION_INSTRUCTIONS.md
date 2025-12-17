# Production Execution Instructions - Rental Companies Module

**Date:** $(date)  
**Project:** carexpert-94faa (from google-services.json)

## PHASE 1: Set SUPER_ADMIN_EMAILS Secret + Deploy Functions

### Step 1: Set Secret

**Command:**
```bash
firebase functions:secrets:set SUPER_ADMIN_EMAILS
```

**When prompted, enter:**
```
admin1@example.com,admin2@example.com
```
*(Replace with actual admin emails)*

**Expected Output:**
```
✔  Created a new secret version SUPER_ADMIN_EMAILS
```

### Step 2: Deploy Functions

**Command:**
```bash
firebase deploy --only functions
```

**Expected Output:**
```
✔  functions[setAdminCustomClaim(us-central1)] Successful create operation.
✔  Deploy complete!
```

### Step 3: Verify in Firebase Console

1. Go to Firebase Console → Functions
2. Verify `setAdminCustomClaim` function is deployed
3. Go to Functions → Secrets
4. Verify `SUPER_ADMIN_EMAILS` secret exists

**Status:** ⏳ [ ] Complete

---

## PHASE 2: Set Admin Claims (CRITICAL - DO BEFORE RULES)

### Step 1: Identify Admin Users

Query Firestore to find all users with `isAdmin == true`:
- Firebase Console → Firestore → Collection: `users`
- Filter: `isAdmin == true`
- Note all UIDs

**Admin UIDs:**
- [ ] UID 1: [fill in]
- [ ] UID 2: [fill in]
- [ ] UID 3: [fill in]

### Step 2: Set Claims for Each Admin

**From Web App Console (browser):**

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');

// For each admin UID:
await setAdminClaim({ targetUid: 'admin-uid-here' });
```

**Or from Firebase Console:**
1. Go to Functions → setAdminCustomClaim
2. Use "Test function" tab
3. Enter: `{ "targetUid": "admin-uid-here" }`
4. Execute

**Claims Set:**
- [ ] UID 1: [fill in] - Claim set: ✅/❌
- [ ] UID 2: [fill in] - Claim set: ✅/❌
- [ ] UID 3: [fill in] - Claim set: ✅/❌

### Step 3: Verify Claims

**For each admin user:**

1. Sign in as the admin user
2. Open browser console (F12)
3. Run verification script (see `scripts/verify-admin-claims.js`)

**Or manually:**
```javascript
const user = auth.currentUser;
const idTokenResult = await user.getIdTokenResult();
console.log('Admin claim:', idTokenResult.claims.admin);
console.log('IsAdmin claim:', idTokenResult.claims.isAdmin);
// Should show: true for at least one
```

**Verification Results:**
- [ ] UID 1: Verified ✅/❌
- [ ] UID 2: Verified ✅/❌
- [ ] UID 3: Verified ✅/❌

### Step 4: Token Refresh

**For each admin:**
- Sign out
- Sign in again
- Verify claims again (should persist)

**⚠️ CRITICAL:** Do NOT proceed to Phase 3 until ALL admins have verified claims.

**Status:** ⏳ [ ] Complete

---

## PHASE 3: Deploy Rules + Hosting

### Option A: Manual Deployment

**Step 1: Firestore Rules**
```bash
firebase deploy --only firestore:rules
```

**Step 2: Storage Rules**
```bash
firebase deploy --only storage
```

**Step 3: Hosting**
```bash
cd web
npm run build
cd ..
firebase deploy --only hosting
```

### Option B: Script Deployment

```bash
bash scripts/deploy-rental-companies.sh
```

**Record all outputs in:** `DEPLOYMENT_EXECUTION_LOG.md`

**Status:** ⏳ [ ] Complete

---

## PHASE 4: Smoke Tests

### Test A: Public Access (Incognito, No Auth)

**Steps:**
1. Open incognito/private window
2. Navigate to homepage
3. Check RentalCompanyLogosSection

**Expected:**
- [ ] Homepage loads without errors
- [ ] RentalCompanyLogosSection renders
- [ ] Only visible companies appear
- [ ] Each logo link has `aria-label="ביקור באתר {companyName}"`
- [ ] Clicking logo opens website in new tab

**Results:** [Fill in after testing]

### Test B: Hidden Company Filter

**Steps:**
1. As admin, set a company `isVisible = false`
2. As public (incognito), verify company does NOT appear
3. Attempt direct read: `getDoc(doc(db, 'rentalCompanies', hiddenCompanyId))`

**Expected:**
- [ ] Hidden company does NOT appear in public view
- [ ] Direct read fails with permission-denied

**Results:** [Fill in after testing]

### Test C: Non-Admin User

**Steps:**
1. Sign in as non-admin user
2. Navigate to `/admin/rental-companies`
3. Attempt to upload logo (if UI allows)

**Expected:**
- [ ] Redirected to `/account` immediately (before page renders)
- [ ] Logo upload fails with permission-denied (403)

**Results:** [Fill in after testing]

### Test D: Admin User (With Verified Claims)

**Steps:**
1. Sign in as admin (with verified custom claims)
2. Navigate to `/admin/rental-companies`
3. Create company with invalid data (empty nameHe, invalid URL)
4. Create valid company
5. Upload logo
6. Replace logo with different file

**Expected:**
- [ ] Page loads without redirect
- [ ] Invalid data rejected by Firestore rules
- [ ] Valid company created successfully
- [ ] Logo upload succeeds (no 403)
- [ ] Logo appears immediately
- [ ] Image src includes `?v={logoVersion}`
- [ ] Logo replacement shows immediately (no hard refresh needed)

**Results:** [Fill in after testing]

**Status:** ⏳ [ ] Complete

---

## PHASE 5: Post-Deploy Monitoring (15 minutes)

### Firebase Console Checks

**Functions Logs:**
- [ ] Check for `setAdminCustomClaim` calls (should see successful calls)
- [ ] No unexpected errors

**Firestore Logs:**
- [ ] Check "permission denied" errors
- [ ] Expected: Non-admin write attempts should show permission-denied
- [ ] Unexpected: Public read failures (investigate if found)

**Storage Logs:**
- [ ] Check permission denials
- [ ] Expected: Non-admin upload attempts should show 403
- [ ] Unexpected: Admin upload failures (investigate if found)

**Status:** ⏳ [ ] Complete

---

## Final Checklist

- [ ] All admin users have custom claims set and verified
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Hosting deployed
- [ ] Public smoke tests passed
- [ ] Admin smoke tests passed
- [ ] No unexpected errors in Firebase Console
- [ ] Documentation updated

**Deployment Status:** ⏳ [ ] **COMPLETE**

---

**Instructions Completed:** $(date)
