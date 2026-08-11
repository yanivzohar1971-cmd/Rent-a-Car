# Phase 2D: CLS Root Cause Analysis for /cars

**Date:** 2025-12-17  
**Baseline CLS:** 0.263 (mobile-search.report.json)  
**Target:** ≤ 0.05

## CLS Culprits Identified

### 1. Car Images Without Dimensions ❌ (HIGH PRIORITY)
**Location:** `src/components/cars/CarImage.tsx`  
**Issue:** 
- `<img>` tag has no `width` or `height` attributes
- Image container has fixed height (200px grid, 150px list) but image itself doesn't reserve space
- Skeleton shows during loading but image swap can cause shift

**Evidence:**
- `CarImage.tsx` line 25-36: `<img>` tag without width/height
- CSS has `.car-image { height: 200px }` and `.car-list-image { height: 150px }` but img tag needs explicit dimensions
- Skeleton has same height but image load can still shift if aspect ratio differs

**Fix:** Add `width` and `height` attributes to `<img>` tag matching container dimensions

---

### 2. Font Loading Shift (LIKELY CONTRIBUTOR)
**Location:** Multiple components (CarListItem, CarsSearchPage)  
**Issue:**
- Heebo fonts load asynchronously (30+ font files)
- Text blocks (titles, prices) may shift when fonts swap in
- No explicit `line-height` or `min-height` on text elements to stabilize layout

**Evidence:**
- `main.tsx` imports `@fontsource/heebo` (400/600/700 weights)
- Fonts load asynchronously, causing `font-display: swap` behavior
- Text elements like `.car-title`, `.car-price` don't have fixed line-height

**Fix:** 
- Ensure consistent `line-height` on text elements
- Add `min-height` to text containers to prevent height changes

---

### 3. Filter Bar Late Injection (POTENTIAL)
**Location:** `src/components/filters/CarSearchFilterBar.tsx`  
**Issue:**
- Filter bar may render after initial data load
- If filter chips appear late, they could push content down

**Evidence:**
- Filter bar renders conditionally based on `anyFilterActive`
- Filter chips render dynamically based on filter state
- No reserved space for filter bar area

**Fix:** Reserve fixed height for filter bar area from first paint

---

### 4. Promotion Badges/Chips Dynamic Rendering (POTENTIAL)
**Location:** `src/components/cars/CarListItem.tsx`  
**Issue:**
- Promotion badges render conditionally based on promotion state
- Badges appear/disappear causing layout shifts
- Badge container doesn't reserve space

**Evidence:**
- Line 97-100: Badges render conditionally
- `.car-list-badges` container doesn't have min-height
- Badges can appear after data loads

**Fix:** Reserve min-height for badge container

---

### 5. Card Content Height Variability (POTENTIAL)
**Location:** `src/components/cars/CarListItem.tsx`, `src/pages/CarsSearchPage.tsx`  
**Issue:**
- Card content height varies based on:
  - Title length (single vs multi-line)
  - Metadata presence/absence
  - Tag chips presence
- Cards don't have stable min-height

**Evidence:**
- `.car-list-main` has `flex: 1` but no min-height
- Title can wrap to multiple lines
- Metadata/tags render conditionally

**Fix:** Ensure consistent min-height for card content areas

---

## Priority Fix Order

1. **Car Images** - Add width/height attributes (biggest impact)
2. **Font Metrics** - Stabilize line-height and min-height on text
3. **Filter Bar** - Reserve space for filter area
4. **Badge Container** - Reserve min-height for badges
5. **Card Content** - Ensure stable min-height

---

## Expected Impact

- **Images with dimensions:** Should reduce CLS by ~0.15-0.20 (largest contributor)
- **Font metrics:** Should reduce CLS by ~0.03-0.05
- **Filter/Badge space:** Should reduce CLS by ~0.02-0.03 each
- **Total expected reduction:** 0.20-0.31 → Target: ≤0.05 ✅

---

**Next Steps:**
1. Fix images (Phase 2D-1)
2. Fix font metrics (Phase 2D-2)
3. Fix filter/badge space (Phase 2D-3)
4. Measure after each step
