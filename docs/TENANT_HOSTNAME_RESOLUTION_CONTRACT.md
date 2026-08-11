# Tenant Hostname Resolution Contract

## Purpose
Resolve incoming frontend hostname to tenant inventory scope without hardcoded per-tenant code branches.

## Collections Used
- `tenantDomains`
- `tenantSiteConfigs`

## Resolution Flow
1. Read `window.location.hostname`.
2. Normalize hostname (lowercase, trim trailing dot).
3. Treat known marketplace/default hosts as non-tenant fallback (`localhost`, `127.0.0.1`, `::1`, `app.local`).
4. Query `tenantDomains/{hostname}` (with `www.` variant fallback).
5. If active tenant record exists, read `tenantId`.
6. Query `tenantSiteConfigs/{tenantId}` and read `dataScope.yardUid` (fallback: `dataScope.yardId`).
7. Apply tenant scoping only when valid `yardUid` exists.

## Required Fields
### `tenantDomains/{hostname}`
- `tenantId`: string (required)
- `enabled`: boolean (optional; `false` disables)
- `isActive`: boolean (optional; `false` disables — same effect as `enabled` for resolution)

### `tenantSiteConfigs/{tenantId}`
- `dataScope.yardUid`: string (preferred, required for tenant inventory scope)
- `dataScope.yardId`: string (legacy fallback)

## Example Tenant Records
### Local
Path: `tenantDomains/srk.local`
```json
{
  "tenantId": "srk",
  "enabled": true
}
```

Path: `tenantSiteConfigs/srk`
```json
{
  "tenantId": "srk",
  "dataScope": {
    "yardUid": "72HNYgtEdWV0zn19I6H51TSzPEj1"
  }
}
```

### Production
Path: `tenantDomains/srk.co.il`
```json
{
  "tenantId": "srk",
  "enabled": true
}
```

Path: `tenantSiteConfigs/srk`
```json
{
  "tenantId": "srk",
  "dataScope": {
    "yardUid": "72HNYgtEdWV0zn19I6H51TSzPEj1"
  }
}
```

## Fallback Behavior
- Unknown hostname -> marketplace mode (non-tenant).
- Firestore read failure -> marketplace mode (non-tenant).
- Tenant record without valid `yardUid` -> non-scoped fallback (safe mode, no crash).

## Notes
- `yardUid` is the primary scope key.
- `sellerUid` is only a fallback input that is matched against `car.yardUid`.
