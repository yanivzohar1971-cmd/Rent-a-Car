# PSI Stability Table

**Date:** 2025-12-17  
**Goal:** Track PSI scores across multiple runs to identify fluctuations

## Home Page (/)

| Run | Mobile Score | Desktop Score | LCP | CLS | TBT | Notes |
|-----|--------------|---------------|-----|-----|-----|-------|
| Before | 73 | TBD | TBD | TBD | TBD | Baseline |
| After Step 1 | TBD | TBD | TBD | TBD | TBD | LCP fetchpriority fix |
| After Step 2 | TBD | TBD | TBD | TBD | TBD | Preconnect added |
| After Step 3 | TBD | TBD | TBD | TBD | TBD | Auth deferred |

## Search Page (/cars)

| Run | Mobile Score | Desktop Score | LCP | CLS | TBT | Notes |
|-----|--------------|---------------|-----|-----|-----|-------|
| Before | 63 | TBD | TBD | TBD | TBD | Baseline |
| After Step 1 | TBD | TBD | TBD | TBD | TBD | LCP fetchpriority fix |
| After Step 2 | TBD | TBD | TBD | TBD | TBD | Preconnect added |
| After Step 3 | TBD | TBD | TBD | TBD | TBD | Auth deferred |

## Changes Applied

### Step 1: LCP Discovery Fix ✅
- Fixed `fetchPriority` → `fetchpriority` (lowercase) for hero image
- Verified first car card has `fetchpriority="high"` (index === 0)
- **Commit:** `TBD` - "perf: make LCP image discoverable + fetchpriority high for actual LCP element"

### Step 2: Preconnect Origins ✅
- Added preconnect for `https://www.googleapis.com` (Firebase Auth)
- Added preconnect for `https://carexpert-94faa.firebaseapp.com` (Firebase Hosting)
- Added dns-prefetch equivalents
- Removed unused preconnects (`gstatic.com`, `firestore.googleapis.com`)
- **Limit:** Max 3 origins (as requested)

### Step 3: Defer Firebase Auth on Public Routes ✅
- Delayed auth initialization on public routes: `/`, `/cars`, `/blog`, `/car/`, `/yard/`
- Uses `requestIdleCallback` with 2s timeout (or `setTimeout` 500ms fallback)
- Protected routes still initialize immediately
- **Goal:** Prevent `auth/iframe.js` and `getProjectConfig` from blocking critical path

## Evidence

### Auth/iframe.js Removed from Critical Path
- **Before:** Auth initialized immediately on all routes
- **After:** Auth delayed on public routes until idle callback
- **Verification:** Check Network tab - `auth/iframe.js` should not appear until after first paint

### Preconnect Origins
- `https://www.googleapis.com` - Used by Firebase Auth for `getProjectConfig`
- `https://carexpert-94faa.firebaseapp.com` - Firebase Hosting domain

## Next Steps

1. Measure PSI Mobile & Desktop for `/` and `/cars` after deployment
2. Verify `auth/iframe.js` is not in critical path (Network tab)
3. Check LCP discovery audit passes (fetchpriority recognized)
4. Compare stability across 3 runs if possible
