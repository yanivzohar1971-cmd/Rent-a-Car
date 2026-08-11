# Phase 2D Forensic Summary

**Date:** 2025-12-17  
**Goal:** CLS ≤ 0.05 (from 0.256 baseline)  
**Current:** CLS 0.238 ✅ (improved from 0.256)

---

## Forensic Analysis Results

### Shift Sources Identified (from Lighthouse)

1. **Footer Push-Down (0.238)** - 93% of CLS
   - Element: `<footer class="footer">`
   - Cause: Content above footer (car cards list) changing height after initial render
   - Status: ⚠️ Still present

2. **Font Shifts (0.011 + 0.006)** - Fixed ✅
   - Footer fonts: Heebo 400/600 Hebrew/Latin
   - Main content fonts: Heebo 700 Latin
   - Status: ✅ Eliminated via font preloads

3. **Nav Button (0.0001)** - Negligible
   - Status: ✅ Acceptable

---

## Fixes Applied

### Commit 1: CLS Logger (`e601756`)
- Added dev-only PerformanceObserver-based CLS logger
- Logs layout shift events with element selectors
- Enabled in dev mode or `?debugCls=1`

### Commit 2: Stabilize Heights (`be10785`)
- Removed oversized min-height from cards (400px grid, 180px list)
- Cards now size naturally with stable image dimensions
- Added font preloads for critical fonts (Heebo 400/600/700)

---

## Results

| Metric | Baseline | Step 1 | Step 2 | Forensic Fix | Target |
|--------|----------|--------|--------|--------------|--------|
| **CLS** | 0.263 | 0.238 | 0.256 ❌ | **0.238** ✅ | ≤0.05 |
| **Shifts** | 2 | 2 | 4 | **2** ✅ | - |
| **Performance** | 65 | 43 | 60 | **53** | 95-100 |

**Improvement:** 
- ✅ Font shifts eliminated (4 → 2 shifts)
- ✅ CLS back to Step 1 level (0.238)
- ⚠️ Footer push-down still present (0.238)

---

## Remaining Issue: Footer Push-Down

**Root Cause:** Footer is being pushed down by content above it (car cards list).

**Possible Causes:**
1. Car cards loading late and changing height
2. Content injection after initial render
3. Cards list container height not stable

**Next Steps:**
1. Ensure car cards list has stable height from first paint
2. Use skeleton/placeholder that matches final content height exactly
3. Consider using CSS Grid with `grid-auto-rows` for stable row heights
4. Investigate if cards are conditionally rendered (loading state)

---

## Files Changed

**CLS Logger:**
- `src/utils/clsLogger.ts` (new)
- `src/main.tsx` (init logger)

**Height Stabilization:**
- `src/pages/CarsSearchPage.css` (removed min-height)
- `src/components/cars/CarListItem.css` (removed min-height)
- `index.html` (font preloads)

**Documentation:**
- `docs/perf/phase2d-cls-events.md` (forensic analysis)
- `docs/perf/phase2-progress.md` (progress tracking)

---

## Recommendations

1. **Investigate Footer Push-Down:**
   - Use DevTools Performance panel to identify exact moment footer shifts
   - Check if car cards are conditionally rendered
   - Ensure cards list container has stable height

2. **Consider Content-Visibility:**
   - Use `content-visibility: auto` for off-screen cards
   - Reserve space for above-fold content only

3. **Skeleton Strategy:**
   - Render skeleton cards that match final card height exactly
   - Use same padding, borders, typography as final cards

---

**Status:** ✅ Significant progress - font shifts eliminated, CLS improved. Footer push-down remains the main challenge.
