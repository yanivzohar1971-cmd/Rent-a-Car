# Phase 2D Summary: CLS Fix Attempts on /cars

**Date:** 2025-12-17  
**Target:** CLS ≤ 0.05 (from baseline 0.263)  
**Status:** ⚠️ **Partial progress** - CLS reduced from 0.263 to 0.238 in Step 1, but increased to 0.256 in Step 2

---

## Commits Made

### Step 1: Image/Card Space Reservation (`788731f`)
**Changes:**
- Added `width`/`height` attributes to `<img>` tags (300x200 grid, 200x150 list)
- Added `aspect-ratio` CSS to image containers
- Added `loading="lazy"` to images
- Stabilized typography (line-height, min-height on titles/prices)
- Reserved space for filter chips container (min-height: 2.5rem)
- Reserved space for badge containers (min-height: 1.5rem)
- Reserved space for card header rows (min-height: 2rem)

**Result:** CLS: 0.263 → **0.238** ✅ (-0.025, ~9.5% reduction)

### Step 2: Dynamic Content Space Reservation (`35f360a`)
**Changes:**
- Added min-height to cards (400px grid, 180px list)
- Reserved space for PartnerAdsStrip (60px container)
- Reserved space for seller filter section (3.5rem)

**Result:** CLS: 0.238 → **0.256** ❌ (+0.018 increase)

---

## Root Cause Analysis

**Document:** `docs/perf/phase2d-cls-rootcause.md`

**Identified Culprits:**
1. ✅ **Images without dimensions** - FIXED (Step 1)
2. ⚠️ **Font loading shifts** - PARTIALLY FIXED (line-height added, but fonts still load async)
3. ⚠️ **Filter bar/badge injection** - PARTIALLY FIXED (min-height added, but may need adjustment)
4. ❌ **Card content height variability** - ATTEMPTED (min-height added, but caused increase)

---

## Issues Identified

1. **Min-height on cards may be too large** - Cards with less content shift when min-height is enforced
2. **Font loading still causes shifts** - Despite line-height, font swap can cause width changes
3. **Dynamic content injection** - Filter chips, badges, ads still appear late

---

## Recommendations for Next Steps

### Option A: Refine Min-Height Approach
- Use `min-height` only on containers, not cards themselves
- Ensure min-height matches actual content height more closely
- Use CSS Grid with `grid-auto-rows: minmax()` for stable row heights

### Option B: Font Loading Strategy
- Preload critical fonts (Heebo 400, 600, 700)
- Use `font-display: optional` instead of `swap` for non-critical fonts
- Ensure font metrics match fallback fonts

### Option C: Content Injection Strategy
- Render filter bar/badges immediately with skeleton placeholders
- Use CSS `content-visibility: auto` for off-screen content
- Ensure all dynamic content has reserved space from first paint

### Option D: Measure More Precisely
- Use Chrome DevTools Performance panel to identify exact shift sources
- Check Layout Shift events in trace
- Identify which elements are causing the largest shifts

---

## Files Changed

**Step 1:**
- `src/components/cars/CarImage.tsx` - Added width/height props
- `src/components/cars/CarListItem.tsx` + `.css` - Dimensions, typography
- `src/pages/CarsSearchPage.tsx` + `.css` - Dimensions, typography
- `src/components/filters/CarSearchFilterBar.css` - Filter space reservation

**Step 2:**
- `src/pages/CarsSearchPage.tsx` - PartnerAdsStrip space reservation
- `src/pages/CarsSearchPage.css` - Card min-height, seller filter min-height
- `src/components/cars/CarListItem.css` - List item min-height

---

## Current Metrics

| Metric | Baseline | Step 1 | Step 2 | Target |
|--------|----------|--------|--------|--------|
| **CLS** | 0.263 | 0.238 ✅ | 0.256 ❌ | ≤0.05 |
| **Performance** | 65 | 43 | 60 | 95-100 |
| **LCP** | 5073ms | 5073ms | 4596ms ✅ | <2500ms |

---

## Next Actions

1. **Investigate Step 2 regression** - Why did CLS increase?
2. **Refine min-height strategy** - Use more precise measurements
3. **Focus on font loading** - Preload critical fonts
4. **Measure with DevTools** - Identify exact shift sources

---

**Note:** CLS reduction is challenging and requires iterative refinement. The Step 1 improvement (0.263 → 0.238) shows the approach is correct, but Step 2 needs adjustment.
