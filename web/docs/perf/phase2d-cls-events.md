# Phase 2D Forensic: CLS Event Analysis

**Date:** 2025-12-17  
**Report:** `phase2d-step2-mobile-search.report.json`  
**Total CLS:** 0.256

---

## Layout Shift Events Identified

### Shift #1: Footer Push-Down (CRITICAL - 0.238)
**Element:** `<footer class="footer">`  
**Selector:** `body > div#root > div.main-layout > footer.footer`  
**Score:** 0.23815309842041313 (93% of total CLS!)  
**Bounding Rect:** top: 18234, height: 196px

**Root Cause:** Footer is being pushed down by content above it (main content area). This is the **largest contributor** to CLS.

**Suspected Causes:**
- Car cards list loading and changing height after initial render
- Content injection above the fold pushing footer down
- Min-height on cards (from Step 2) may be causing initial render to reserve space, then content loads and shifts

**Fix Priority:** 🔴 **CRITICAL** - Must fix this first

---

### Shift #2: Footer Font Swap (0.011)
**Element:** `<footer class="footer">`  
**Selector:** `body > div#root > div.main-layout > footer.footer`  
**Score:** 0.011114688682861336  
**Causes:**
- Web font loaded: `heebo-hebrew-400-normal-CVTJgQVK.woff2`
- Web font loaded: `heebo-latin-400-normal-BGyEuwIV.woff2`
- Web font loaded: `heebo-latin-600-normal-C0GLQ-RT.woff2`

**Root Cause:** Footer text shifts when fonts load (font-display: swap behavior)

**Fix Priority:** 🟡 **MEDIUM** - Preload critical fonts or use font-display: optional

---

### Shift #3: Main Content Font Swap (0.006)
**Element:** `<main class="main-content">`  
**Selector:** `body > div#root > div.main-layout > main.main-content`  
**Score:** 0.006213369198175581  
**Causes:**
- Web font loaded: `heebo-latin-700-normal-PoyjiH5f.woff2`

**Root Cause:** Main content (car cards, titles) shifts when bold font loads

**Fix Priority:** 🟡 **MEDIUM** - Preload or optimize font loading

---

### Shift #4: Nav Button (0.0001)
**Element:** `<a class="nav-cta-button" href="/sell">`  
**Selector:** `header.header > div.header-content > nav.nav > a.nav-cta-button`  
**Score:** 0.00011631164471032543

**Root Cause:** Minor shift in navigation button (likely font-related)

**Fix Priority:** 🟢 **LOW** - Negligible impact

---

## Summary

| Shift | Element | Score | % of Total | Priority |
|-------|---------|-------|------------|----------|
| #1 | Footer | 0.238 | 93% | 🔴 CRITICAL |
| #2 | Footer (fonts) | 0.011 | 4% | 🟡 MEDIUM |
| #3 | Main (fonts) | 0.006 | 2% | 🟡 MEDIUM |
| #4 | Nav button | 0.0001 | <1% | 🟢 LOW |

**Key Insight:** The footer push-down (0.238) is **93% of the CLS problem**. This suggests:
1. Content above footer (car cards list) is changing height after initial render
2. Cards may be loading late and pushing footer down
3. Min-height strategy from Step 2 may need refinement

---

## Next Steps

1. **Fix Footer Push-Down (Shift #1):**
   - Ensure car cards list has stable height from first paint
   - Remove or refine min-height on cards if causing issues
   - Reserve exact space for content, not oversized min-height

2. **Fix Font Shifts (Shifts #2, #3):**
   - Preload critical fonts (Heebo 400, 600, 700)
   - Use `font-display: optional` for non-critical fonts
   - Ensure line-height matches font metrics

3. **Add CLS Logger (Dev Only):**
   - PerformanceObserver for layout-shift events
   - Log shift sources in development mode

---

## DevTools Investigation Needed

- [ ] Record Performance trace with Layout Shift Regions enabled
- [ ] Identify exact moment footer shifts (after data load? after images?)
- [ ] Check if car cards are causing the shift
- [ ] Verify min-height is not causing initial oversized render
