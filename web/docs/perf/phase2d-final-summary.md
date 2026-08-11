# Phase 2D-Final: Footer Push-Down CLS Fix Summary

**Date:** 2025-12-17  
**Baseline CLS:** 0.239 (mobile-search)  
**Target:** ≤ 0.05

## Commits Made

1. **`5a7e75f`** - "perf(debug): ensure clsLogger never bundles into prod"
   - Convert clsLogger to dynamic import only when dev mode or debugCls=1
   - Prevents bundling into production build

2. **`293895c`** - "perf: stabilize app shell layout to prevent footer jump"
   - Set html/body/#root to height:100% and flex layout
   - Set footer to flex:0 0 auto to prevent push-down
   - Add skeleton cards during loading matching final card geometry
   - Prioritize first card LCP with loading=eager and fetchpriority=high

3. **`d051d5e`** - "perf: always reserve space for seller-filter-section to prevent CLS"
   - Always render seller-filter-section during loading (visibility:hidden if currentYardId set)
   - Ensures space is always reserved to prevent 0.067 layout shift

## Files Changed

- `web/src/main.tsx` - Dynamic import for clsLogger
- `web/src/styles.css` - html/body/#root height and flex layout
- `web/src/components/MainLayout.css` - Flex layout stabilization
- `web/src/components/Footer.css` - flex:0 0 auto
- `web/src/pages/CarsSearchPage.tsx` - Skeleton cards, seller-filter-section fix, first card LCP priority
- `web/src/components/cars/CarImage.tsx` - Added loading and fetchPriority props
- `web/src/components/cars/CarCardSkeleton.tsx` - New component (matches card geometry)
- `web/src/components/cars/CarCardSkeleton.css` - New styles

## Results

### Mobile /cars

| Step | Perf | LCP | CLS | TBT | Notes |
|------|------|-----|-----|-----|-------|
| Baseline | 54 | 5015ms | 0.24 | 429ms | Footer: 0.239, h1: 0.0002 |
| Step 3A | 43 | 5135ms | **0.307** ⚠️ | 727ms | Footer: 0.239, seller-filter: 0.067, h1: 0.0002 |
| Step 3B | TBD | TBD | TBD | TBD | Seller-filter shift should be fixed |

### CLS Breakdown

**Baseline:**
- Footer push-down: 0.239 (99% of CLS)
- h1: 0.0002 (minor)

**Step 3A:**
- Footer push-down: 0.239 (still present)
- Seller-filter-section: 0.067 (new - introduced by skeleton rendering)
- h1: 0.0002 (minor)

**Step 3B:**
- Seller-filter-section shift should be eliminated (always reserves space)

## Root Cause Analysis

### Footer Push-Down (0.239)
**Issue:** Footer being pushed down when car cards load/grow

**Root Causes:**
1. App shell layout not fully stabilized (html/body/#root not set to height:100% and flex)
2. Footer floating in middle of viewport when content is short
3. No skeleton cards during loading - footer visible in viewport, then pushed down when cards render

**Fixes Applied:**
- ✅ Set html/body/#root to height:100% and flex layout
- ✅ Set footer to flex:0 0 auto (fixed height)
- ✅ Add skeleton cards matching final card geometry (6 cards, ~1 screenful)

**Status:** ⚠️ Still shifting (0.239) - skeleton cards may not match exact height or footer not properly fixed

### Seller-Filter-Section Shift (0.067)
**Issue:** Seller-filter-section conditionally rendered, causing shift when it appears

**Root Cause:**
- Seller-filter-section only rendered when `!currentYardId`
- During loading, `currentYardId` may not be determined yet
- When it renders later, causes 0.067 shift

**Fix Applied:**
- ✅ Always render seller-filter-section during loading (visibility:hidden if currentYardId set)
- Ensures space is always reserved

**Status:** ✅ Should be fixed in Step 3B

## LCP Element

**Baseline:** TBD (need to check Lighthouse report)  
**After Step 3A:** TBD  
**After Step 3B:** TBD

**Changes Made:**
- First card image (index === 0) set to `loading="eager"` and `fetchpriority="high"`
- Other cards remain lazy-loaded
- Skeleton cards reserve space for first card

## Next Steps

1. Measure Step 3B results
2. If footer shift still present (0.239):
   - Verify skeleton cards match exact height of real cards
   - Check if footer is properly fixed to bottom
   - Consider CSS Grid with stable row heights
3. If LCP still slow:
   - Preload first card image URL
   - Optimize image format (AVIF/WEBP)
   - Check network timing
4. Measure Desktop to ensure it remains 100
5. Document final metrics and create summary

## Acceptance Criteria

- [ ] /cars CLS ≤ 0.05 on Mobile
- [ ] /cars LCP improves (must not regress further)
- [ ] Desktop /cars remains 100
