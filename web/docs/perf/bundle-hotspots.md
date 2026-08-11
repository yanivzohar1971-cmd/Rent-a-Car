# Bundle Hotspots Analysis

**Date:** 2025-12-17  
**Build Output:** `dist/assets/index-DDW-pS3S.js` = **1,469.03 KB** (396.40 KB gzipped)  
**CSS Bundle:** `dist/assets/index-Dh5jscMC.css` = **223.59 KB** (32.81 KB gzipped)

## Top Chunks/Modules by Size

### Main Bundle (`index-DDW-pS3S.js`)
- **Size:** 1,469 KB (396 KB gzipped)
- **Status:** ⚠️ **EXCEEDS 500 KB THRESHOLD** (3x over limit)

### Other Chunks
- `PartnerAdsStrip-BWHUorw9.js`: 6.18 KB (2.40 KB gzipped) - ✅ Already code-split
- `RentalCompanyLogosSection-wdftdHqF.js`: 0.47 KB (0.33 KB gzipped) - ✅ Already code-split

## Firebase Analysis

### Current State: **EAGER LOADING** ❌
- **File:** `src/firebase/firebaseClient.ts` (actively used)
- **Imports:** All Firebase services loaded immediately:
  - `getFirestore()` - Firestore SDK
  - `getAuth()` - Auth SDK  
  - `getStorage()` - Storage SDK
  - `getFunctions()` - Functions SDK

### Impact
- **AuthContext** (`src/context/AuthContext.tsx`) imports `auth, db` eagerly
- **46+ API files** import Firebase services eagerly
- Firebase SDKs loaded on **every page load**, including public browsing routes

### Lazy Alternative Available (NOT USED)
- **File:** `src/firebase/firebaseClientLazy.ts` exists but is **not imported anywhere**
- Implements dynamic imports for auth/firestore/storage/functions
- Would prevent auth/iframe.js from loading on homepage

## Admin-Only Code in Public Bundle ❌

### Admin Pages (Eagerly Imported in Router)
All admin routes are imported at the top of `src/router.tsx`:
- `AdminLeadsPage`
- `AdminPlansPage`
- `AdminBillingPage`
- `AdminRevenuePage`
- `AdminRevenueDashboardPage`
- `AdminCustomersPage`
- `AdminPromotionProductsPage`
- `AdminPromotionOrdersPage`
- `AdminRentalCompaniesPage`
- `AdminContentWizardPage`

**Impact:** Admin-only code (~100-200 KB estimated) loads for **all users**, including public browsing.

### Admin API Files (Eagerly Imported)
Admin API modules are imported by admin pages:
- `adminContentWizardApi.ts`
- `adminRevenueApi.ts`
- `adminBillingSnapshotsApi.ts`
- `adminAgentsApi.ts`
- `adminUsersApi.ts`
- `adminBillingPlansApi.ts`
- `adminSellersApi.ts`
- `adminYardsApi.ts`

## Route-Level Code Splitting Status

### Current: **NO LAZY LOADING** ❌
- All route components imported eagerly in `src/router.tsx`
- No `React.lazy()` or dynamic imports
- All route code in main bundle

### Routes That Should Be Lazy:
1. **Admin Routes** (10 pages) - Admin-only, should never load for public users
2. **Yard Routes** (8+ pages) - Yard role only
3. **Seller Routes** (2 pages) - Seller role only
4. **Search/Details Routes** - Heavy components, can be lazy-loaded
5. **Blog/SEO Routes** - Secondary content, can be lazy-loaded

## Font Loading Analysis

### Current State: **30+ FONT FILES** ❌
- **Package:** `@fontsource/heebo` (v5.2.8)
- **Weights:** 400, 600, 700
- **Subsets:** Hebrew, Latin, Latin-Ext, Symbols, Math
- **Formats:** Both WOFF2 and WOFF (duplicates)

### Font Files in Bundle:
- Hebrew: 400/600/700 (woff2 + woff) = 6 files
- Latin: 400/600/700 (woff2 + woff) = 6 files  
- Latin-Ext: 400/600/700 (woff2 + woff) = 6 files
- Symbols: 400/600/700 (woff2 + woff) = 6 files
- Math: 400/600/700 (woff2 + woff) = 6 files
- **Total:** ~30 files, ~200+ KB

### Import Location:
- `src/main.tsx` imports all 3 weights eagerly:
  ```ts
  import '@fontsource/heebo/400.css'
  import '@fontsource/heebo/600.css'
  import '@fontsource/heebo/700.css'
  ```

## CSS Bundle Analysis

### Current State: **223 KB** (32 KB gzipped)
- Single monolithic CSS bundle
- No route-level CSS splitting
- Likely contains:
  - Global styles
  - Component styles (all components)
  - Admin styles (loaded for all users)
  - Yard styles (loaded for all users)

## Summary: Big Rocks to Address

1. **Route-Level Code Splitting** (Priority: HIGH)
   - Lazy-load admin routes (10 pages)
   - Lazy-load yard/seller routes
   - Lazy-load search/details routes
   - **Expected savings:** 200-300 KB from main bundle

2. **Firebase Lazy Loading** (Priority: HIGH)
   - Switch from `firebaseClient.ts` to `firebaseClientLazy.ts`
   - Update AuthContext to use async Firebase init
   - **Expected savings:** 50-100 KB + faster initial load

3. **Font Optimization** (Priority: MEDIUM)
   - Remove unused subsets (Math, Symbols likely unused)
   - Keep only WOFF2 (drop WOFF)
   - Load only Hebrew + Latin (drop Latin-Ext if not needed)
   - **Expected savings:** 100-150 KB

4. **CSS Optimization** (Priority: MEDIUM)
   - Route-level CSS splitting (if feasible)
   - Remove unused CSS blocks
   - **Expected savings:** 50-100 KB

## Bundle Visualizer Output

See `docs/perf/bundle-stats.html` for interactive treemap visualization.

---

**Next Steps:**
1. Implement route-level code splitting (Phase 2B)
2. Switch to Firebase lazy loading (Phase 2C)
3. Optimize fonts (Phase 2E)
4. Optimize CSS (Phase 2F)
