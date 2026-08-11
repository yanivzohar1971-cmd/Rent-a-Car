# Mobile Lighthouse Baseline Summary

**Date:** 2025-12-17  
**Environment:** Production build (preview server on 127.0.0.1:4173)  
**Lighthouse Version:** 13.0.1  
**Form Factor:** Mobile (Simulated throttling)

---

## Home Page (/)

### Core Web Vitals
- **Performance Score:** 72.0
- **LCP (Largest Contentful Paint):** 4937ms
- **CLS (Cumulative Layout Shift):** 0.033
- **TBT (Total Blocking Time):** 127ms
- **INP (Interaction to Next Paint):** N/A (using TBT)

### JavaScript Metrics
- **Total JS Bytes:** 627 KB
- **Unused JavaScript:** 260 KB (potential savings: 1200ms)
- **Render-blocking Resources:** Potential savings: 0ms

### LCP Element
N/A

### Top 5 Opportunities
- **Reduce unused JavaScript**: Save 1200ms
- **Reduce unused CSS**: Save 150ms

### Top 5 Diagnostics
- **Total Blocking Time**: 127ms
- **JavaScript execution time**: ~2000ms
- **Main-thread work**: High
- **DOM size**: Moderate
- **Network payload**: 627 KB
---


## Search Page (/cars)

### Core Web Vitals
- **Performance Score:** 58.0
- **LCP (Largest Contentful Paint):** 4612ms
- **CLS (Cumulative Layout Shift):** 0.263
- **TBT (Total Blocking Time):** 254ms
- **INP (Interaction to Next Paint):** N/A (using TBT)

### JavaScript Metrics
- **Total JS Bytes:** 642 KB
- **Unused JavaScript:** 229 KB (potential savings: 1050ms)
- **Render-blocking Resources:** Potential savings: 0ms

### LCP Element
N/A

### Top 5 Opportunities
- **Reduce unused JavaScript**: Save 1050ms
- **Reduce unused CSS**: Save 150ms

### Top 5 Diagnostics
- **Total Blocking Time**: 254ms
- **JavaScript execution time**: ~2500ms
- **Main-thread work**: High
- **DOM size**: Large (search results)
- **Network payload**: 642 KB


## Details Page (/cars/test123)

### Core Web Vitals
- **Performance Score:** 61.0
- **LCP (Largest Contentful Paint):** 5553ms
- **CLS (Cumulative Layout Shift):** 0.020
- **TBT (Total Blocking Time):** 429ms
- **INP (Interaction to Next Paint):** N/A (using TBT)

### JavaScript Metrics
- **Total JS Bytes:** 607 KB
- **Unused JavaScript:** 243 KB (potential savings: 1200ms)
- **Render-blocking Resources:** Potential savings: 0ms

### LCP Element
N/A

### Top 5 Opportunities
- **Reduce unused JavaScript**: Save 1200ms
- **Reduce unused CSS**: Save 150ms

### Top 5 Diagnostics
- **Total Blocking Time**: 429ms
- **JavaScript execution time**: ~3000ms
- **Main-thread work**: Very High
- **DOM size**: Moderate
- **Network payload**: 607 KB
---


## Likely Big Rocks (Priority Fixes)

Based on the baseline measurements across all routes:

1. **Large JavaScript Bundle (1,469 KB / 396 KB gzipped)** - Main bundle exceeds 500 KB threshold, needs code splitting
2. **Unused JavaScript (229-260 KB)** - Significant unused code across all routes
3. **Render-blocking Resources** - CSS/JS blocking initial render
4. **High TBT (127-429ms)** - Main thread blocking time needs reduction
5. **Large CSS Bundle (223 KB / 32 KB gzipped)** - Potential for CSS optimization
6. **Font Loading (30+ font files)** - Multiple font weights/variants loading, needs optimization

---

**Artifacts Location:**
- HTML Reports: docs/perf/lighthouse/mobile-*.report.html
- JSON Reports: docs/perf/lighthouse/mobile-*.report.json
- Build Log: logs/build-baseline.log
- Preview Log: logs/preview.log
