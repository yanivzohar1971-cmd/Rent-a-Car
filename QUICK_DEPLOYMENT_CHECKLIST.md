# Quick Deployment Checklist - Rental Companies Module

**Project:** carexpert-94faa  
**Date:** $(date)

## ⚠️ CRITICAL: Do These FIRST

### Phase 1: Custom Claims Setup

- [ ] **Set secret:**
  ```bash
  firebase functions:secrets:set SUPER_ADMIN_EMAILS
  # Enter: admin1@example.com,admin2@example.com
  ```

- [ ] **Deploy functions:**
  ```bash
  firebase deploy --only functions
  ```

- [ ] **Set claims for each admin:**
  - Use `setAdminCustomClaim` function
  - For each admin UID, call: `setAdminCustomClaim({ targetUid: 'uid' })`
  - Verify: User signs out/in, check token claims

- [ ] **Verify ALL admins have claims:**
  ```javascript
  // Browser console after sign-in
  const idTokenResult = await user.getIdTokenResult();
  console.log('Admin:', idTokenResult.claims.admin); // Should be true
  ```

**⚠️ STOP if any admin is missing claims. Do NOT proceed to Phase 3.**

---

## Phase 2: Deploy Rules + Hosting

### Option A: Script (Recommended)

```bash
bash EXECUTE_DEPLOYMENT.sh
```

### Option B: Manual

```bash
# 1. Firestore rules
firebase deploy --only firestore:rules

# 2. Storage rules
firebase deploy --only storage

# 3. Hosting
cd web && npm run build && cd ..
firebase deploy --only hosting
```

**Record outputs in:** `DEPLOYMENT_EXECUTION_LOG.md`

---

## Phase 3: Smoke Tests

### Public (Incognito)
- [ ] Homepage loads
- [ ] Only visible companies appear
- [ ] Hidden company does NOT appear

### Non-Admin
- [ ] `/admin/rental-companies` redirects to `/account`
- [ ] Logo upload fails (403)

### Admin (With Claims)
- [ ] `/admin/rental-companies` loads
- [ ] Invalid data rejected
- [ ] Logo upload succeeds
- [ ] Logo replacement shows immediately (`?v=...` in src)

**Record results in:** `PRODUCTION_SMOKE_TEST_REPORT.md`

---

## Phase 4: Monitor (15 min)

- [ ] Check Functions logs (setAdminCustomClaim calls)
- [ ] Check Firestore permission denials (expected for non-admin writes)
- [ ] Check Storage permission denials (expected for non-admin uploads)

---

## Final Status

**Deployment:** ⏳ [ ] Complete  
**Smoke Tests:** ⏳ [ ] Complete  
**Monitoring:** ⏳ [ ] Complete

**Ready for Production:** ⏳ [ ] Yes
