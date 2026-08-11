# `tenantPublicState` — public-safe tenant lifecycle

## Why

`tenants/{tenantId}` holds **admin/commercial** data (name, plan, `createdAt`, subscription/trial fields, etc.). It must **not** be world-readable.

The storefront still needs **trial/subscription/block** signals for banners and hiding inventory (`TenantContext` → `computeTenantPublicSiteSuspended`, `computeTenantTrialEndingSoon`).

## What

- **Canonical (admin-only):** `tenants/{tenantId}` — full document; **`get` / `list` / `write`** require **admin** in Firestore rules.
- **Public projection:** `tenantPublicState/{tenantId}` — only:
  - `status` (`active` | `trial` | `blocked`)
  - `trialEndsAt` (timestamp or null)
  - `subscriptionEndsAt` (timestamp or null)
  - `isBlocked` (boolean)

Anonymous users may **`get`** a single `tenantPublicState/{tenantId}` doc; **listing** the collection is denied.

## How it stays in sync

- **Create / update / extend trial** in `tenantsApi` writes the projection after mutating `tenants`.
- **Admin Tenants** page (`/admin/tenants`) runs `syncTenantPublicLifecycleFromRows` after `listTenants()` so existing tenants get backfilled when an admin opens the list.

Until a projection exists for a tenant, the storefront treats lifecycle as **unknown** → **not suspended** (same as a failed read before).

## Code

- Storefront: `getTenantPublicLifecycleForStorefront` → `tenantPublicState`.
- Admin / builder: `getTenantById` → `tenants` (unchanged).

Collection id constant: `TENANT_PUBLIC_STATE_COLLECTION` in `web/src/api/tenantsApi.ts`.
