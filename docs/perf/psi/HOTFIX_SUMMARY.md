# PSI Regression Hotfix Summary

**Date:** 2025-12-17  
**Issue:** PSI Mobile regressed from ~74 to ~65

## Changes Applied

### Step 0: Canonical URL Verification ✅
- **Canonical URLs:**
  - `https://www.carexperts4u.com/` (primary)
  - `https://www.carexperts4u.com/cars` (secondary)

### Step 1: Redirect Chain Analysis ✅
- **Result:** 0 redirects detected (good for performance)
- All URL variants return 200 directly
- Redirects may be handled at DNS/CDN level (not visible in HEAD requests)
- **Impact:** No redirect latency penalty

### Step 2: Cache Headers ✅
- **Added:** Explicit `/hero/**` cache header (`public, max-age=31536000, immutable`)
- **Already in place:**
  - `/assets/**` - immutable cache ✅
  - `/fonts/**` - immutable cache ✅
  - `**/*.css` - immutable cache ✅
  - `**/*.js` - immutable cache ✅
  - `**/*.avif` - immutable cache ✅
  - `**/*.html` - no-cache ✅

**Commit:** `076fd24` - "perf(hosting): add immutable cache headers for /hero/** assets"

### Step 3: Render-Blocking CSS Analysis ✅
- **CSS Code Splitting:** ✅ Enabled (`cssCodeSplit: true`)
- **Entry CSS:** 3 files (~242 lines total):
  - `fonts/heebo.css` - 58 lines (critical)
  - `styles.css` - 183 lines (critical - design system)
  - `index.css` - 1 line (critical)
- **Built CSS:** Main bundle `index-*.css` is 26.29 KB (contains critical global styles)
- **Route CSS:** Already split per route (0.6-33.6 KB each)

**Status:** CSS optimization deferred - cache headers may resolve the issue. If PSI still flags after deployment, consider Option A (move non-critical CSS to routes).

## Next Steps

1. **Deploy** firebase.json changes to production
2. **Verify** cache headers with `curl -I` on production assets
3. **Measure** PSI Mobile & Desktop for `/` and `/cars`
4. **If render-blocking CSS still flagged:** Consider Option A (incremental CSS move to routes)

## Files Changed

- `firebase.json` - Added `/hero/**` cache header
- `docs/perf/psi/redirect-chain.md` - Redirect analysis
- `docs/perf/psi/psi-regression-notes.md` - Full notes
- `docs/perf/psi/after-hotfix-home.md` - Measurement template
- `docs/perf/psi/after-hotfix-cars.md` - Measurement template

## Expected Impact

- **Cache headers:** Should reduce asset latency (especially on repeat visits)
- **Redirect chain:** Already optimal (0 redirects)
- **CSS:** May need further optimization if PSI still flags after cache headers

## Measurement

**Before hotfix:** TBD (need PSI baseline)  
**After hotfix:** TBD (measure after deployment)
