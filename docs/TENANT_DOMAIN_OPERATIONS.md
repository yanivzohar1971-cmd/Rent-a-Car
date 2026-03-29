# Tenant Domain Management

## How tenant resolution works

- Runtime hostname is normalized (lowercase, trimmed, trailing dot removed).
- The app checks `tenantDomains/{hostname}` for:
  - `tenantId`
  - `enabled` and `isActive` (either set to `false` disables resolution; see `isTenantDomainDocActive` in code)
- If mapping is valid and enabled, tenant inventory scope is resolved from:
  - `tenantSiteConfigs/{tenantId}.dataScope.yardUid`
  - fallback: `tenantSiteConfigs/{tenantId}.dataScope.yardId`

Hostname determines tenant identity. On tenant hosts, public inventory is scoped by `yardUid` so inventory from other tenants is not shown.

## What admins manage

Admins manage `tenantDomains` from the existing admin dashboard (`/admin/tenant-domains`) without manual Firestore console edits.

Each mapping stores:

- `hostname` (document ID)
- `tenantId`
- `enabled` / `isActive` (writes from admin UI set both together)

## Production custom domains

Customer domains still point to our hosted app instance (DNS/hosting/proxy).  
The incoming hostname selects the tenant at runtime.

## Operational flow (admin)

1. Connect customer domain to our hosting/proxy.
2. Create or update `tenantDomains` mapping in admin.
3. Verify `tenantSiteConfigs/{tenantId}` has valid `dataScope.yardUid` (or `yardId` fallback).
4. Test the customer domain end-to-end.
