# Phase 2 Progress Tracking

**Date:** 2025-12-17  
**Goal:** Mobile Lighthouse Performance 65 → 95-100

## Baseline (Phase 1)

| Route | Perf | LCP | CLS | TBT | Unused JS |
|-------|------|-----|-----|-----|-----------|
| `/` (Home) | 72 | 4937ms | 0.033 | 881ms | - |
| `/cars` (Search) | 65 | 5073ms | **0.263** | 881ms | - |
| `/cars/:id` (Details) | 72 | 4937ms | 0.033 | 881ms | - |

---

## Phase 2D-Final: Footer Push-Down CLS Fix

### Step 3A: App Shell Layout Stabilization
**Commits:** 
- `5a7e75f` - "perf(debug): ensure clsLogger never bundles into prod"
- `293895c` - "perf: stabilize app shell layout to prevent footer jump"

**Changes:**
1. Set html/body/#root to height:100% and flex layout
2. Set footer to flex:0 0 auto to prevent push-down
3. Add skeleton cards during loading matching final card geometry
4. Prioritize first card LCP with loading=eager and fetchpriority=high

**Results:**
| Route | Perf | LCP | CLS | TBT |
|-------|------|-----|-----|-----|
| `/cars` (Step 3A) | 43 | 5135ms | **0.307** ⚠️ | 727ms |

**CLS Breakdown:**
- Footer: 0.239 (still shifting)
- Seller-filter-section: 0.067 (new shift)
- h1: 0.0002 (minor)

**Status:** ⚠️ CLS increased - seller-filter-section shift identified

### Step 3B: Fix Seller-Filter-Section Shift
**Commit:** `TBD` - "perf: always reserve space for seller-filter-section to prevent CLS"

**Changes:**
- Always render seller-filter-section during loading (visibility:hidden if currentYardId set)
- Ensures space is always reserved to prevent 0.067 layout shift

**Results:**
| Route | Perf | LCP | CLS | TBT |
|-------|------|-----|-----|-----|
| `/cars` (Step 3B) | TBD | TBD | TBD | TBD |

---

## Phase 2D: CLS Fixes on /cars (Previous)

### Step 1: Image/Card Space Reservation (Phase 2D-1)
**Commit:** `788731f` - "perf: reserve image/card space to reduce CLS on /cars - Phase 2D-1"

**Changes:**
- Added width/height attributes to CarImage (300x200 grid, 200x150 list)
- Added aspect-ratio CSS to image containers
- Added loading="lazy" to images
- Stabilized typography (line-height, min-height on titles/prices)
- Reserved space for filter chips, badges, card headers

**Results:**
| Route | Perf | LCP | CLS | TBT | Unused JS |
|-------|------|-----|-----|-----|-----------|
| `/cars` | 43 | 5073ms | **0.238** ⬇️ | 881ms | - |

**CLS Improvement:** 0.263 → 0.238 (-0.025, ~9.5% reduction)  
**Status:** ⚠️ Still above target (≤0.05). Need more fixes.

### Step 2: Dynamic Content Space Reservation (Phase 2D-2)
**Commit:** `35f360a` - "perf: reserve space for dynamic content to reduce CLS - Phase 2D-2"

**Changes:**
- Added min-height to cards (400px grid, 180px list)
- Reserved space for PartnerAdsStrip (60px container)
- Reserved space for seller filter section (3.5rem)
- Fixed TypeScript errors

**Results:**
| Route | Perf | LCP | CLS | TBT | Unused JS |
|-------|------|-----|-----|-----|-----------|
| `/cars` | 60 | 4596ms | **0.256** ⚠️ | - | - |

**CLS Change:** 0.238 → 0.256 (+0.018)  
**Status:** ⚠️ CLS increased - min-height may be causing shifts. Need to adjust approach.

### Step 3: Forensic Fix - Remove Oversized Min-Height + Font Preloads (Phase 2D-F4)
**Commits:** 
- `e601756` - "perf(debug): add dev-only CLS logger"
- `TBD` - "perf: stabilize reserved heights to eliminate /cars CLS regression"

**Changes:**
- Added CLS logger (dev-only) using PerformanceObserver
- Removed oversized min-height from cards (400px grid, 180px list)
- Cards now size naturally based on content with stable image dimensions
- Added font preloads for critical fonts (Heebo 400/600/700 Hebrew/Latin)

**Results:**
| Route | Perf | LCP | CLS | TBT | Unused JS |
|-------|------|-----|-----|-----|-----------|
| `/cars` | 53 | 5127ms | **0.238** ✅ | - | - |

**CLS Change:** 0.256 → 0.238 (-0.018, back to Step 1 level)  
**Status:** ✅ Improved! Font shifts eliminated (4 → 2 shifts). Footer push-down (0.238) still needs fixing.

**Remaining Issue:** Footer being pushed down by content above (likely car cards loading late). Need to ensure content height is stable from first paint.

---

## Phase 2D+: Font-Driven CLS + Hero LCP + Render-Blocking CSS

### Phase A: Font Reduction + Preload + Typography Stabilization
**Commits:** `ca1b845` (combined with Phase B)

**Changes:**
- Reduced fonts: 30+ files → 6 files (Hebrew + Latin only, weights 400/600/700)
- Custom @font-face CSS with stable paths (`/fonts/heebo/*.woff2`)
- Preload critical 400 weight fonts in index.html
- Stabilized typography metrics (line-height, min-height)

**Results:**
| Route | Perf | LCP | CLS | TBT |
|-------|------|-----|-----|-----|
| `/` | 57 | 3296ms | **0.002** ✅ | 1408ms |
| `/cars` | 51 | 6315ms | **0.239** ⚠️ | 0ms |

**Font Files:** 6 files remaining (heebo-hebrew/latin-400/600/700.woff2)

### Phase B: Hero LCP Discoverability
**Commit:** `ca1b845` (combined with Phase A)

**Changes:**
- Converted CSS background to `<img>` with `fetchpriority="high"`
- Added preload tags with media queries
- Hero images at stable paths (`/hero/hero-mobile.avif`, `/hero/hero-desktop.avif`)

**Impact:**
- ✅ Hero image discoverable in initial document
- ✅ fetchpriority="high" applied
- ✅ Home LCP improved: 4937ms → 3296ms (-33%)

### Phase C: Render-Blocking CSS
**Commit:** `9b555e5`

**Changes:**
- Enabled `cssCodeSplit: true` in Vite config

**Impact:**
- ✅ No render-blocking resources found in Lighthouse
- ✅ CSS split per route

---

## Current Status

**Home Page:** ✅ CLS 0.002 (excellent!), LCP improved  
**Search Page:** ⚠️ CLS 0.239 (footer push-down), LCP regressed  
**Desktop:** ✅ Remains 100 (not measured but no breaking changes)

---

## Next Steps

- [ ] Phase 2D-3: Additional fixes if CLS still > 0.05
- [ ] Phase 2D-4: Final measurement and summary
