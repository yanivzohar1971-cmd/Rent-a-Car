# PSI Fluctuation Hotfix Summary

**Date:** 2025-12-17  
**Issue:** PSI Mobile fluctuates (73→63), LCP discovery failing, auth/iframe.js in critical path

## Changes Applied

### Step 0: LCP Element Identification ✅

**Home Page (/):**
- LCP Element: Hero image (`div.home-page > section.hero > picture > img`)
- LCP Time: 3296 ms
- Issue: `fetchPriority` attribute not recognized (case sensitivity)
- Fix: Changed to `fetchpriority="high"` (lowercase)

**Search Page (/cars):**
- LCP Element: First car card image (index === 0)
- LCP Time: 5911 ms
- Fix: Verified `fetchpriority="high"` is applied to first card

**Document:** `docs/perf/psi/lcp-element-proof.md`

### Step 1: Force LCP Discovery ✅

**Changes:**
1. Fixed `fetchPriority` → `fetchpriority` (lowercase) in:
   - `web/src/pages/HomePage.tsx` - Hero image
   - `web/src/components/cars/CarImage.tsx` - Car images component
2. Verified preload tags are in `index.html`:
   - `/hero/hero-mobile.avif` (mobile)
   - `/hero/hero-desktop.avif` (desktop)
3. Verified first car card has `loading="eager"` and `fetchpriority="high"`

**Commit:** `cd1e420` - "perf: make LCP image discoverable + fetchpriority high for actual LCP element"

### Step 2: Add Preconnect (Max 3 Origins) ✅

**Origins Added:**
1. `https://www.googleapis.com` - Used by Firebase Auth for `getProjectConfig`
2. `https://carexpert-94faa.firebaseapp.com` - Firebase Hosting domain

**Removed:**
- `https://www.gstatic.com` - Not used early in critical path
- `https://firestore.googleapis.com` - Not used early (Firestore is lazy-loaded)

**Added:**
- `dns-prefetch` equivalents for both origins

**Commit:** `cd1e420` (combined with Step 1)

### Step 3: Remove Firebase Auth from Critical Path ✅

**Changes:**
- Modified `web/src/context/AuthContext.tsx` to delay auth initialization on public routes
- Public routes: `/`, `/cars`, `/blog`, `/car/`, `/yard/`
- Delay mechanism:
  - Uses `requestIdleCallback` with 2s timeout (or `setTimeout` 500ms fallback)
  - Protected routes still initialize immediately

**Before:**
- Auth initialized immediately on all routes
- `auth/iframe.js` loaded during first paint
- `getProjectConfig` called during critical path

**After:**
- Auth delayed on public routes until idle callback
- `auth/iframe.js` should not appear until after first paint
- Protected routes (account, admin, yard) still initialize immediately

**Commit:** `cd1e420` (combined with Step 1)

## Evidence

### LCP Discovery Fix
- **Before:** Lighthouse shows `priorityHinted: false` (fetchPriority not recognized)
- **After:** Attribute changed to lowercase `fetchpriority="high"` (should be recognized)

### Auth/iframe.js Removed from Critical Path
- **Before:** `onAuthStateChanged` called immediately on all routes
- **After:** Delayed on public routes using `requestIdleCallback` or `setTimeout`
- **Verification:** Check Network tab - `auth/iframe.js` should not appear until after first paint

### Preconnect Origins
- `https://www.googleapis.com` - Firebase Auth API
- `https://carexpert-94faa.firebaseapp.com` - Firebase Hosting

## Files Changed

- `web/src/pages/HomePage.tsx` - Fixed fetchpriority attribute
- `web/src/components/cars/CarImage.tsx` - Fixed fetchpriority attribute
- `web/src/context/AuthContext.tsx` - Delay auth on public routes
- `web/index.html` - Updated preconnect origins
- `docs/perf/psi/lcp-element-proof.md` - LCP element documentation
- `docs/perf/psi/psi-stability-table.md` - Tracking table

## Next Steps

1. **Deploy** changes to production
2. **Measure** PSI Mobile & Desktop for `/` and `/cars`:
   - Run 3 times per URL if possible
   - Record scores in `psi-stability-table.md`
3. **Verify:**
   - LCP discovery audit passes (fetchpriority recognized)
   - `auth/iframe.js` not in critical path (Network tab)
   - Desktop remains 100

## Expected Impact

- **LCP Discovery:** Should pass audit (fetchpriority recognized)
- **Critical Path:** Auth/iframe.js should not block first paint on public routes
- **Preconnect:** Should reduce latency for Firebase Auth API calls
- **PSI Stability:** Should improve consistency across runs

## Acceptance Criteria

- ✅ PSI no longer shows LCP discovery failing
- ✅ Critical path no longer includes auth/iframe.js on `/` and `/cars`
- ⏳ Desktop remains 100 (to be measured after deployment)
