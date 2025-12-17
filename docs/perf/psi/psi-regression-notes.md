# PSI Regression Hotfix Notes

**Date:** 2025-12-17  
**Issue:** PSI Mobile regressed from ~74 to ~65

## Step 0: Canonical URL Verification

**Canonical URLs to measure:**
1. `https://www.carexperts4u.com/` (primary)
2. `https://www.carexperts4u.com/cars` (secondary)

**PSI Results:**
- Before hotfix: TBD
- After hotfix: TBD

## Step 1: Redirect Chain Analysis

**Redirect chain test results:**

| URL | Status Code | Location Header | Notes |
|-----|------------|----------------|-------|
| `https://www.carexperts4u.com/` | TBD | TBD | Canonical (should be 200) |
| `http://www.carexperts4u.com/` | TBD | TBD | Should redirect to HTTPS |
| `https://carexperts4u.com/` | TBD | TBD | Should redirect to www |
| `http://carexperts4u.com/` | TBD | TBD | Should redirect to HTTPS+www |

**Goal:** Maximum ONE redirect to canonical (https + www)

## Step 2: Cache Headers

**Current firebase.json headers:**
- `/assets/**` - Already has `public, max-age=31536000, immutable` ✅
- `/fonts/**` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.css` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.js` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.avif` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.html` - Has `no-cache, no-store, must-revalidate` ✅

**Missing:** `/hero/**` specific header (covered by `**/*.avif` but explicit is better)

**Action:** Add explicit `/hero/**` header for clarity

## Step 3: Render-Blocking CSS

**Current state:**
- Vite CSS code splitting: ✅ Enabled (`cssCodeSplit: true`)
- Entry CSS imports: TBD (need to audit)

**PSI flags:**
- Render blocking CSS: `/assets/index-*.css` with ~940ms estimated savings

**Mitigation strategy:**
- Option A: Audit and move route-specific CSS to route components
- Option B: Preload stylesheet with onload (only if no FOUC)

## Step 4: Document Latency Error

**Possible causes:**
1. Multiple redirects (check Step 1)
2. Firebase Hosting outage/issue
3. Security headers blocking PSI
4. Compression issues

**Status:** TBD (after redirect check)

## Step 5: Measurement Results

### Before Hotfix

**Mobile:**
- `/` - Score: TBD, LCP: TBD, CLS: TBD
- `/cars` - Score: TBD, LCP: TBD, CLS: TBD

**Desktop:**
- `/` - Score: TBD, LCP: TBD, CLS: TBD
- `/cars` - Score: TBD, LCP: TBD, CLS: TBD

### After Hotfix

**Mobile:**
- `/` - Score: TBD, LCP: TBD, CLS: TBD
- `/cars` - Score: TBD, LCP: TBD, CLS: TBD

**Desktop:**
- `/` - Score: TBD, LCP: TBD, CLS: TBD
- `/cars` - Score: TBD, LCP: TBD, CLS: TBD

## Remaining Opportunities

- TBD
