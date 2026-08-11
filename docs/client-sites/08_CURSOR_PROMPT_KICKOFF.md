Implement the first production-safe foundation for client-domain tenant sites in the existing Rent a Car web/functions architecture.

GOAL
Support a dealer website running on our platform under the dealer's existing domain, using central inventory/media, with strict tenant scoping and legacy URL preservation.

TARGET PILOT
srk-car.com

NON-NEGOTIABLES
- Do not fork the app per client
- Do not introduce separate DB/storage per client
- Do not break main marketplace routes
- Do not assume SEO can be rebuilt later
- Do not route all legacy URLs to homepage

PHASE 1
1. Add domain -> tenant resolution layer
2. Add tenant site config loading
3. Add tenant-scoped listing/detail data access
4. Add legacy URL registry + resolver skeleton
5. Add legacy vehicle map + fallback skeleton
6. Add per-domain canonical/robots/sitemap hooks

REQUIRED DATA STRUCTURES
- tenantDomains
- tenantSiteConfigs
- legacyUrlRegistry
- legacyVehicleMap

RUNTIME ORDER
1. resolve host -> tenant
2. modern route if exists
3. exact legacy URL match
4. legacy vehicle match
5. legacy content/listing match
6. semantic 301 fallback
7. 404

DELIVERABLES
- minimal code changes only
- clear extension points
- no destructive refactor
- comments only where they reduce future mistakes
- keep KISS

AFTER IMPLEMENTATION
Output:
1. files changed
2. minimal architecture summary
3. risks left open
4. exact next phase
