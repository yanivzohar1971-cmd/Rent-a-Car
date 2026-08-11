# SEO Landing Pages Policy

## Overview
This document defines the policy for SEO landing pages for "רכבים למכירה" (cars for sale) content.

## Indexable Landing Pages (Whitelist)

Only the following landing page types are indexable:

### 1. Main Landing Page
- **Path:** `/cars-for-sale`
- **Content:** General cars for sale landing page with intro, tips, FAQ
- **Priority:** 0.8

### 2. City-Based Landing Pages
- **Path:** `/cars-for-sale/city/<city-slug>`
- **Example:** `/cars-for-sale/city/tel-aviv`
- **Content:** City-specific content + inventory list
- **Priority:** 0.7

### 3. Make-Based Landing Pages
- **Path:** `/cars-for-sale/make/<make-slug>`
- **Example:** `/cars-for-sale/make/toyota`
- **Content:** Make-specific content + inventory list
- **Priority:** 0.7

### 4. Model-Based Landing Pages
- **Path:** `/cars-for-sale/model/<model-slug>`
- **Example:** `/cars-for-sale/model/corolla`
- **Content:** Model-specific content + inventory list
- **Priority:** 0.7

### 5. Budget Range Landing Pages
- **Path:** `/cars-for-sale/budget/<min>-<max>`
- **Example:** `/cars-for-sale/budget/50000-100000`
- **Content:** Budget-specific buying tips + inventory list
- **Priority:** 0.6

### 6. Type-Based Landing Pages
- **Path:** `/cars-for-sale/type/<type>`
- **Examples:** `/cars-for-sale/type/suv`, `/cars-for-sale/type/electric`
- **Content:** Type-specific content + inventory list
- **Priority:** 0.6

### 7. Combined Landing Pages (Limited)
Only these combinations are indexable:
- `/cars-for-sale/city/<city>/make/<make>` - City + Make
- `/cars-for-sale/city/<city>/type/<type>` - City + Type
- `/cars-for-sale/make/<make>/model/<model>` - Make + Model
- `/cars-for-sale/model/<model>/year/<year>` - Model + Year

## Non-Indexable URLs

### Filter Pages with Query Parameters
All URLs with query parameters should be `noindex,follow`:
- `/cars?make=Toyota&model=Corolla` → noindex
- `/cars?priceFrom=50000&priceTo=100000` → noindex
- `/cars?cityId=123&yearFrom=2020` → noindex

**Canonical:** These should canonicalize to the nearest SEO landing page if applicable.

### Role-Specific Routes
- `/admin/*` → noindex (also disallowed in robots.txt)
- `/yard/*` → noindex (also disallowed in robots.txt)
- `/seller/*` → noindex (also disallowed in robots.txt)
- `/account` → noindex (also disallowed in robots.txt)

## Content Requirements

Each indexable landing page must include:

1. **H1:** Exact match to search intent (e.g., "רכבים למכירה בתל אביב")
2. **Intro Section (200-400 words):**
   - What users will find here
   - Why this category is relevant
   - Key considerations
3. **How to Choose Section:**
   - Pitfalls to avoid
   - What to check
   - Tips specific to the category
4. **Price & Maintenance Tips:**
   - Generic, helpful advice
   - No false promises
5. **FAQ (3-6 questions):**
   - Common buyer questions
   - Answers that help decision-making
6. **Internal Links:**
   - Links to sibling landing pages (city list, make list)
   - Links to "How to buy" hub articles
   - Links to relevant guides
7. **On-Page Inventory:**
   - Paginated list of actual vehicles matching the criteria
   - Updated dynamically from Firestore

## URL Slug Policy

- **Hebrew Display:** Keep Hebrew in page content and H1
- **URL Slugs:** Use ASCII transliteration or controlled Hebrew slugs (pick one and apply consistently)
- **Stability:** Slugs should be stable - use 301 redirects if slug rules change
- **Examples:**
  - City: `tel-aviv` (ASCII) or `תל-אביב` (Hebrew slug)
  - Make: `toyota` (ASCII) or `טויוטה` (Hebrew slug)
  - Model: `corolla` (ASCII) or `קורולה` (Hebrew slug)

## Implementation

See:
- `web/src/seo/landingPages.config.ts` - Configuration
- `web/src/pages/SeoLandingPage.tsx` - Landing page component
- `web/src/assets/seoLandingPages.he.json` - Content data

## Sitemap Inclusion

All indexable landing pages are included in `sitemap-landing.xml` with:
- `<lastmod>` date (updated when content changes)
- `<changefreq>` monthly
- Appropriate `<priority>`

