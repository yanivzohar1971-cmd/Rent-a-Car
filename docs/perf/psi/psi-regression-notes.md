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

## Step 1: Redirect Chain Analysis ✅

**Redirect chain test results:**

| URL | Status Code | Location Header | Notes |
|-----|------------|----------------|-------|
| `https://www.carexperts4u.com/` | 200 | (none) | ✅ Canonical - no redirect |
| `http://www.carexperts4u.com/` | 200 | (none) | ⚠️ Serves directly (no HTTPS redirect detected) |
| `https://carexperts4u.com/` | 200 | (none) | ⚠️ Serves directly (no www redirect detected) |
| `http://carexperts4u.com/` | 200 | (none) | ⚠️ Serves directly (no HTTPS redirect detected) |

**Result:** ✅ **0 redirects** - This is good for performance (no redirect latency)

**Note:** HTTP variants and non-www variant serve directly. Redirects may be handled at DNS/CDN level (not visible in HEAD requests). For security, consider adding explicit redirects in firebase.json, but this won't affect PSI if redirects are already handled at infrastructure level.

## Step 2: Cache Headers ✅

**Current firebase.json headers:**
- `/assets/**` - Already has `public, max-age=31536000, immutable` ✅
- `/fonts/**` - Already has `public, max-age=31536000, immutable` ✅
- `/hero/**` - **ADDED** `public, max-age=31536000, immutable` ✅ (explicit, already covered by `**/*.avif` but clearer)
- `**/*.css` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.js` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.avif` - Already has `public, max-age=31536000, immutable` ✅
- `**/*.html` - Has `no-cache, no-store, must-revalidate` ✅

**Action:** ✅ Added explicit `/hero/**` header for clarity

## Step 3: Render-Blocking CSS

**Current state:**
- Vite CSS code splitting: ✅ Enabled (`cssCodeSplit: true`)
- Entry CSS imports in `main.tsx`:
  - `./fonts/heebo.css` - 58 lines (font definitions, critical)
  - `./styles.css` - 183 lines (design system variables + global styles, critical for first paint)
  - `./index.css` - 1 line (minimal base styles, critical)
- **Total:** ~242 lines of critical CSS (small, needed for first paint)

**Built CSS sizes (from dist/assets):**
- `index-B09iiIXn.css` - 26.29 KB (main bundle with global styles)
- Route-specific CSS files: 0.6-33.6 KB each (already split per route) ✅

**PSI flags:**
- Render blocking CSS: `/assets/index-*.css` with ~940ms estimated savings

**Analysis:**
- CSS code splitting is working (route-specific CSS is split)
- Main `index-*.css` contains critical global styles needed for first paint
- The ~940ms savings estimate may be inflated or based on network latency

**Mitigation strategy:**
- ⏳ **Defer if PSI still flags after Step 2** (cache headers may reduce latency)
- Option A: Audit and move non-critical CSS to route components (low risk, incremental)
- Option B: Preload stylesheet with onload (only if no FOUC, higher risk)

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
