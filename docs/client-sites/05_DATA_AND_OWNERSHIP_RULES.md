# Data and Ownership Rules

## Canonical truth
The central system remains the canonical source for:
- vehicle identity
- publication status
- images/media
- seller/yard identity
- lead ownership

This aligns with the existing direction that public web should consume projected/public car data, while authority stays in the core system and functions layer. Existing project notes already frame `publicCars` as a derived/public projection rather than an independent source of truth.

## Tenant-site rule
A tenant site is a presentation surface over canonical data.
It is not a new source of truth.

## Write ownership

### Allowed tenant-site writes
- lead submissions
- analytics/click tracking
- tenant-managed content blocks (if enabled)

### Forbidden tenant-site writes
- direct mutation of canonical car data from public runtime
- direct image duplication/upload into separate tenant storage by default
- direct rewriting of shared publication data outside approved admin flows

## Projection rule
Tenant site pages must consume:
- either `publicCars`
- or a dedicated tenant-safe read model derived from the same canonical projection path

## Legacy URL rule
Legacy mappings are metadata, not business truth.
They live beside the domain/tenant layer and do not own the car lifecycle.
