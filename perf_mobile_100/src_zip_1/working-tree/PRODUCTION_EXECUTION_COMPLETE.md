# Production Execution - Complete Instructions

**Project ID:** carexpert-94faa  
**Date:** $(date)

## Overview

This document provides step-by-step instructions for executing the production deployment of the Rental Companies module. Follow phases in order.

---

## PHASE 1: Set SUPER_ADMIN_EMAILS Secret + Deploy Functions

### Step 1.1: Set Secret

**Command:**
```bash
firebase functions:secrets:set SUPER_ADMIN_EMAILS
```

**When prompted, enter actual admin emails (comma-separated):**
```
admin1@example.com,admin2@example.com
```

**Expected Output:**
```
✔  Created a new secret version SUPER_ADMIN_EMAILS
```

**Status:** ⏳ [ ] Complete  
**Timestamp:** [Fill in]

### Step 1.2: Deploy Functions

**Command:**
```bash
firebase deploy --only functions
```

**Expected Output:**
```
✔  functions[setAdminCustomClaim(us-central1)] Successful create operation.
✔  Deploy complete!
```

**Status:** ⏳ [ ] Complete  
**Timestamp:** [Fill in]  
**Output:** [Paste full output]

### Step 1.3: Verify in Firebase Console

1. Go to: https://console.firebase.google.com/project/carexpert-94faa/functions
2. Verify `setAdminCustomClaim` function exists
3. Go to: Functions → Secrets
4. Verify `SUPER_ADMIN_EMAILS` secret exists

**Status:** ⏳ [ ] Verified

---

## PHASE 2: Set Admin Claims (MUST DO BEFORE RULES)

### Step 2.1: Identify Admin Users

**Query Firestore:**
- Firebase Console → Firestore → Collection: `users`
- Filter: `isAdmin == true`
- List all UIDs

**Admin UIDs Found:**
- [ ] UID: [fill in] | Email: [fill in]
- [ ] UID: [fill in] | Email: [fill in]
- [ ] UID: [fill in] | Email: [fill in]

### Step 2.2: Set Claims

**Method 1: From Web App (Browser Console)**

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const setAdminClaim = httpsCallable(functions, 'setAdminCustomClaim');

// For each admin UID:
const result = await setAdminClaim({ targetUid: 'admin-uid-here' });
console.log(result.data.message);
```

**Method 2: From Firebase Console**

1. Go to: Functions → setAdminCustomClaim → Test function
2. Enter: `{ "targetUid": "admin-uid-here" }`
3. Execute

**Claims Set:**
- [ ] UID: [fill in] - ✅ Set / ❌ Failed
- [ ] UID: [fill in] - ✅ Set / ❌ Failed
- [ ] UID: [fill in] - ✅ Set / ❌ Failed

### Step 2.3: Verify Claims

**For each admin user:**

1. Sign in as the admin
2. Open browser console (F12)
3. Run:
```javascript
const user = auth.currentUser;
const idTokenResult = await user.getIdTokenResult();
console.log('Claims:', idTokenResult.claims);
console.log('Has admin:', idTokenResult.claims.admin === true || idTokenResult.claims.isAdmin === true);
```

**Or use verification script:** See `scripts/verify-admin-claims.js`

**Verification Results:**
- [ ] UID: [fill in] - ✅ Verified (admin: true) / ❌ Missing
- [ ] UID: [fill in] - ✅ Verified (admin: true) / ❌ Missing
- [ ] UID: [fill in] - ✅ Verified (admin: true) / ❌ Missing

### Step 2.4: Token Refresh

**For each admin:**
- Sign out
- Sign in again
- Re-verify claims (should persist)

**⚠️ CRITICAL:** Do NOT proceed to Phase 3 until ALL admins have verified claims.

**Status:** ⏳ [ ] All admins verified

---

## PHASE 3: Deploy Rules + Hosting

### Option A: Script Deployment (Recommended)

**Command:**
```bash
bash EXECUTE_DEPLOYMENT.sh
```

**Or on Windows (PowerShell):**
```powershell
# Execute each command manually (see Option B)
```

### Option B: Manual Deployment

**Step 3.1: Firestore Rules**

**Command:**
```bash
firebase deploy --only firestore:rules
```

**Executed:** [Date/Time]  
**Status:** ⏳ [ ] Success / ❌ Failed

**Output:**
```
[Paste full output here]
```

**Step 3.2: Storage Rules**

**Command:**
```bash
firebase deploy --only storage
```

**Executed:** [Date/Time]  
**Status:** ⏳ [ ] Success / ❌ Failed

**Output:**
```
[Paste full output here]
```

**Step 3.3: Hosting**

**Build:**
```bash
cd web
npm run build
cd ..
```

**Executed:** [Date/Time]  
**Status:** ⏳ [ ] Success / ❌ Failed

**Build Output:**
```
[Paste build output here]
```

**Deploy:**
```bash
firebase deploy --only hosting
```

**Executed:** [Date/Time]  
**Status:** ⏳ [ ] Success / ❌ Failed

**Deploy Output:**
```
[Paste deployment output here]
```

**Record all outputs in:** `DEPLOYMENT_EXECUTION_LOG.md`

**Status:** ⏳ [ ] Complete

---

## PHASE 4: Smoke Tests

### Test A: Public Access (Incognito, No Auth)

**Steps:**
1. Open incognito/private window
2. Navigate to: https://[your-domain]/
3. Check RentalCompanyLogosSection

**Expected Results:**
- [ ] Homepage loads without errors
- [ ] RentalCompanyLogosSection renders
- [ ] Only visible companies appear
- [ ] Each logo link has `aria-label="ביקור באתר {companyName}"`
- [ ] Clicking logo opens website in new tab

**Actual Results:**
```
[Fill in]
```

**Status:** ⏳ [ ] Pass / ❌ Fail

### Test B: Hidden Company Filter

**Steps:**
1. As admin, set a company `isVisible = false` (via admin panel)
2. As public (incognito), verify company does NOT appear
3. Attempt direct read (browser console):
```javascript
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/firebaseClient';
const hiddenDoc = await getDoc(doc(db, 'rentalCompanies', 'hidden-company-id'));
// Should fail with permission-denied
```

**Expected Results:**
- [ ] Hidden company does NOT appear in public view
- [ ] Direct read fails with permission-denied

**Actual Results:**
```
[Fill in]
```

**Status:** ⏳ [ ] Pass / ❌ Fail

### Test C: Non-Admin User

**Steps:**
1. Sign in as non-admin user
2. Navigate to: `/admin/rental-companies`
3. Attempt to upload logo (if UI allows or via direct API call)

**Expected Results:**
- [ ] Redirected to `/account` immediately (before page renders)
- [ ] Logo upload fails with permission-denied (403)

**Actual Results:**
```
[Fill in]
```

**Status:** ⏳ [ ] Pass / ❌ Fail

### Test D: Admin User (With Verified Claims)

**Steps:**
1. Sign in as admin (with verified custom claims)
2. Navigate to: `/admin/rental-companies`
3. Create company with invalid data:
   - Empty `nameHe` → should fail
   - Invalid `websiteUrl` (not https?://) → should fail
   - Invalid `displayType` → should fail
4. Create valid company → should succeed
5. Upload logo → should succeed
6. Replace logo with different file → should show immediately

**Expected Results:**
- [ ] Page loads without redirect
- [ ] Invalid data rejected by Firestore rules
- [ ] Valid company created successfully
- [ ] Logo upload succeeds (no 403)
- [ ] Logo appears immediately
- [ ] Image src includes `?v={logoVersion}` query param
- [ ] Logo replacement shows immediately (no hard refresh needed)
- [ ] `logoVersion` field updated in Firestore

**Actual Results:**
```
[Fill in]
```

**Status:** ⏳ [ ] Pass / ❌ Fail

**Record all results in:** `PRODUCTION_SMOKE_TEST_REPORT.md`

---

## PHASE 5: Post-Deploy Monitoring (15 minutes)

### Firebase Console Checks

**Functions Logs:**
- URL: https://console.firebase.google.com/project/carexpert-94faa/functions/logs
- [ ] Check for `setAdminCustomClaim` calls (should see successful calls)
- [ ] No unexpected errors

**Firestore Logs:**
- URL: https://console.firebase.google.com/project/carexpert-94faa/firestore
- [ ] Check "permission denied" errors
- [ ] Expected: Non-admin write attempts show permission-denied
- [ ] Unexpected: Public read failures (investigate if found)

**Storage Logs:**
- URL: https://console.firebase.google.com/project/carexpert-94faa/storage
- [ ] Check permission denials
- [ ] Expected: Non-admin upload attempts show 403
- [ ] Unexpected: Admin upload failures (investigate if found)

**Monitoring Results:**
```
[Fill in any issues found]
```

**Status:** ⏳ [ ] Complete

---

## Final Deliverables

### Documentation Updated

- [ ] `FINAL_PRODUCTION_REPORT.md` - Updated with:
  - [ ] Exact deploy commands executed
  - [ ] Project ID: carexpert-94faa
  - [ ] Deployment timestamp
  - [ ] Confirmation: No fallback admin document exists

- [ ] `DEPLOYMENT_EXECUTION_LOG.md` - Filled with:
  - [ ] All deployment outputs
  - [ ] Timestamps
  - [ ] Status for each step

- [ ] `PRODUCTION_SMOKE_TEST_REPORT.md` - Filled with:
  - [ ] All test results
  - [ ] Pass/fail status
  - [ ] Any issues found

### Final Status

**Deployment:** ⏳ [ ] Complete  
**Smoke Tests:** ⏳ [ ] Complete  
**Monitoring:** ⏳ [ ] Complete

**Production Ready:** ⏳ [ ] Yes / ❌ No

**Blockers:**
- [List any blockers]

---

**Execution Completed:** $(date)
