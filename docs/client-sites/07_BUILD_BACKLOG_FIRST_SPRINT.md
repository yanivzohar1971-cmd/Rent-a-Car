# Build Backlog — First Sprint

## Sprint objective
Get the platform ready for one real pilot tenant (`srk-car.com`) without breaking the main marketplace.

## Tickets

### A. Domain resolution
- create `tenantDomains` schema
- add middleware to resolve host -> tenantId
- add test coverage for domain normalization

### B. Tenant runtime config
- create `tenantSiteConfigs` schema
- implement theme/contact/content loading by tenantId
- build a simple branded shell switch

### C. Inventory scoping
- implement tenant-scoped listing query
- implement tenant-scoped vehicle detail query
- ensure image references stay central

### D. Legacy URL registry
- create `legacyUrlRegistry`
- create admin import format (CSV/JSON)
- support exact path + exact query match

### E. Legacy vehicle mapping
- create `legacyVehicleMap`
- support mapping by old `carcode`
- create fallback handler when vehicle is missing

### F. Redirect engine
- implement 301 utility
- implement semantic fallback rules
- add logging for misses

### G. Tenant SEO
- domain-aware canonical builder
- tenant sitemap endpoint
- tenant robots endpoint

### H. Pilot pages
- homepage
- listing page
- vehicle detail page
- contact/about pages

### I. QA harness
- list of top SRK URLs for smoke testing
- screenshot/SEO assertions
- redirect verification checks
