# LCP Element Proof

**Date:** 2025-12-17  
**Goal:** Identify actual LCP element from Lighthouse reports

## Home Page (/)

**LCP Time:** 3296 ms  
**LCP Element:**
- Selector: `div.home-page > section.hero > picture > img`
- Snippet: `<img alt="" loading="eager" decoding="async" fetchpriority="high" aria-hidden="true" src="/hero/hero-mobile.avif">`
- Node Label: `div.home-page > section.hero > picture > img`

**Lighthouse LCP Discovery Audit:**
- ✅ Request is discoverable in initial document: `true`
- ✅ Lazy load not applied: `true`
- ❌ **fetchpriority=high should be applied: `false`** (Issue: attribute was `fetchPriority` instead of `fetchpriority`)

**Fix:** Changed `fetchPriority="high"` to `fetchpriority="high"` (lowercase attribute name)

## Search Page (/cars)

**LCP Time:** 5911 ms  
**LCP Element:**
- Selector: TBD (likely first car card image)
- Snippet: TBD
- Node Label: TBD

**Expected:** First car card image (index === 0) should have `loading="eager"` and `fetchpriority="high"`

**Current Implementation:**
- First card (index === 0) has `loading="eager"` and `fetchPriority="high"` ✅
- Need to verify attribute name is lowercase `fetchpriority`

## Analysis

**Home Page:**
- Hero image is correctly identified as LCP
- Preload tags are in place ✅
- Issue: Attribute name case sensitivity (`fetchPriority` vs `fetchpriority`)

**Search Page:**
- First car image should be LCP
- Already has priority attributes for first card ✅
- Need to verify attribute name consistency
