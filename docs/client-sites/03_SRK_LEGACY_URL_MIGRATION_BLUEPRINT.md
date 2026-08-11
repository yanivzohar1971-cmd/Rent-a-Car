# SRK Legacy URL Migration Blueprint

## Why this matters
SRK already has a long-running public site with legacy ASP URLs, Hebrew slug-like content pages, and parameterized inventory/detail pages. This means migration cannot rely on a clean-slate router.

## URL families identified

### Family A — Homepage
- `/content.asp?carcat=1&carcode=3481`

### Family B — Static/SEO content pages (.asp with Hebrew name + numeric suffix)
Examples:
- `/צרו-קשר-7.asp`
- `/מכירת-רכבים-8.asp`
- `/מכירת-רכבים-חדשים-39.asp`
- `/סוכנות-רכב-בראשון-לציון-42.asp`
- `/רכבים-למכירה-במרכז-62.asp`
- `/רכבים-למכירה-בראשון-לציון-63.asp`
- `/רכבים-למכירה-יד-שניה-65.asp`
- `/רכבים-למכירה-בבת-ים-66.asp`
- `/מכירת-רכב-טרייד-אין-32.asp`
- `/מגרש-למכירת-רכבים-24.asp`
- `/קניית-רכבים-בראשון-לציון-81.asp`

### Family C — Vehicle detail pages
Pattern:
- `/content.asp?carcat={category}&carcode={legacyVehicleId}`

Examples discovered:
- `/content.asp?carcat=1&carcode=319`
- `/content.asp?carcat=1&carcode=559`
- `/content.asp?carcat=1&carcode=1138`
- `/content.asp?carcat=1&carcode=1682`
- `/content.asp?carcat=2&carcode=3521`
- `/content.asp?carcat=3&carcode=723`
- `/content.asp?carcat=3&carcode=803`
- `/content.asp?carcat=3&carcode=1612`

### Family D — Listing/search/filter pages with query params
Pattern examples:
- `/רכבים-למכירה-במימון-מלא-80.asp?car=...&carcat=0&degem=3&gir=...&year=0`
- `/מכירת-רכבי-יוקרה-37.asp?car=...&carcat=0&degem=A-1&gir=...&year=0`
- `/סוכנות-רכב-בחולון-41.asp?car=...&carcat=0&degem=A5&gir=...&year=0`
- `/קניית-רכבים-בראשון-לציון-81.asp?car=...&carcat=0&degem=C-4&gir=...&year=0`

## Migration policy by family

### Family A — Homepage
- Preserve the root experience under `/`
- Special-case the legacy homepage URL:
  - either serve homepage directly
  - or 301 to `/`

### Family B — Static/SEO content pages
Policy:
- if page concept still exists -> preserve semantic destination
- if exact URL can be kept safely -> keep it
- otherwise -> 301 to equivalent new content page

Mapping examples:
- `צרו-קשר-7.asp` -> `/contact`
- `מכירת-רכבים-8.asp` -> `/cars`
- `מכירת-רכבים-חדשים-39.asp` -> `/cars/new` or equivalent curated listing page
- location SEO pages -> either keep legacy URL or 301 to scoped inventory landing pages

### Family C — Vehicle detail pages
Policy:
- create a legacy resolver using `carcode` + optional `carcat`
- match to current platform vehicle via mapping table
- if exact vehicle still exists -> render current vehicle page
- if no exact vehicle -> 301 to best semantic fallback:
  1. same make/model category page
  2. tenant inventory page
  3. curated landing page

### Family D — Listing/search/filter pages
Policy:
- normalize query params into a canonical listing/search route
- preserve intent, not raw URL structure
- use 301 to semantic modern listing route if the old query structure is not worth keeping

## Required DB/support tables

### `tenantDomains`
- domain
- tenantId
- isPrimary
- themeId
- seoConfigId

### `legacyUrlRegistry`
- tenantId
- originalPath
- originalQuery
- urlType
- legacyEntityId
- normalizedKey
- currentRoute
- redirectMode (`serve`, `301`, `410`)
- isActive

### `legacyVehicleMap`
- tenantId
- legacyCarcode
- legacyCarcat
- currentCarId
- confidence
- notes

## Runtime resolution order
1. resolve host -> tenant
2. try explicit modern route
3. try exact legacy URL registry match
4. try legacy vehicle resolver
5. try legacy content/listing resolver
6. 301 to semantic fallback if mapping exists
7. SEO-safe 404

## What must be tested first
- homepage legacy URL
- contact page legacy URL
- 5 high-ranking content pages
- at least 20 legacy vehicle URLs
- at least 10 parameterized listing URLs
