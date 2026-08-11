# SEO and Routing Rules

## Existing platform signals we should preserve and extend
The current hosting setup already uses SEO-aware rewrites for `/car/**`, `/yard/**`, `/blog/**`, `/partner/**`, serves sitemaps from functions/static routes, and has a dedicated SEO redirect test route. That is a good base for tenant sites, but it is not yet a full legacy migration system for old client domains.

## Rules

### 1. Canonical
- canonical must stay on the same domain
- no cross-domain canonical to the main marketplace by default
- no duplicate self/other-domain confusion

### 2. Sitemaps
- each tenant domain should have its own sitemap output
- inventory entries should reflect only that tenant's published inventory
- stale legacy URLs should not stay in the sitemap forever

### 3. Robots
- tenant can be launched in `noindex` for QA
- production tenant uses explicit index policy
- robots output must be domain-aware

### 4. Redirects
- use 301 for intentional permanent route changes
- never dump all old pages to homepage
- redirect to nearest semantic equivalent

### 5. URL preservation priority
Priority order:
1. homepage
2. high-ranking contact/about/service pages
3. inventory landing pages
4. vehicle detail pages
5. long-tail SEO pages

### 6. Routing safety
Resolution order:
- modern route
- exact legacy registry route
- dynamic legacy vehicle route
- dynamic legacy listing/content route
- semantic fallback redirect
- 404

### 7. Vehicle page fallback
If a legacy vehicle no longer exists:
- same segment listing if possible
- otherwise tenant inventory page
- never a random unrelated page
