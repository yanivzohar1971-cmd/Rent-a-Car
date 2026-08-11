# Implementation Phases

## Phase 0 — Guardrails and analysis
- freeze the migration principles
- confirm data source boundaries
- confirm domain ownership / DNS / SSL path
- confirm main marketplace must remain untouched by tenant routing side effects

## Phase 1 — Domain and tenant resolution
Build:
- `tenantDomains` storage
- host -> tenant middleware
- request context with `tenantId`
- primary domain normalization

Done when:
- local/dev/prod can resolve a domain to a tenant reliably

## Phase 2 — Tenant config runtime
Build:
- tenant branding config
- tenant content config
- tenant contact config
- tenant SEO defaults

Done when:
- one shared UI shell can re-skin per tenant

## Phase 3 — Data scoping
Build:
- central inventory query scoped by tenant
- central media query scoped by tenant
- lead routing scoped by tenant

Done when:
- zero cross-tenant leakage

## Phase 4 — Legacy URL migration layer
Build:
- `legacyUrlRegistry`
- `legacyVehicleMap`
- route resolver middleware
- redirect engine

Done when:
- old URLs do not die on launch

## Phase 5 — SEO runtime
Build:
- per-domain canonical logic
- per-domain robots
- per-domain sitemap generation
- redirect verification suite

Done when:
- each tenant domain behaves as a clean standalone website in search

## Phase 6 — SRK pilot UI
Build:
- tenant homepage
- inventory/listing page
- vehicle detail page
- about/contact pages

Done when:
- SRK can be previewed end-to-end on staging

## Phase 7 — Launch hardening
- crawl old site vs new site
- verify top URLs
- verify canonical and sitemap
- verify lead flow
- verify 404/redirect behavior
- verify performance/mobile

## Phase 8 — Productization for 100 customers
- admin provisioning flow
- reusable tenant templates
- dashboard for tenant/domain/redirect management
- onboarding checklist
