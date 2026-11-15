# AGENT-010 — Android Local Supplier Read Executor

**Status:** COMPLETE  
**Branch:** `feature/claude-agent-api`  
**Depends on:** AGENT-001  
**Date:** 2026-11-15

## 1. Architecture

```
AgentRequest
  → RentCarAgentAPI.forAndroidLocalSupplierReads(...)
  → DispatchingAgentOperationExecutor
  → AndroidLocalSupplierReadExecutor   (supplier.list / supplier.get only)
  → SupplierReadPort / RepositorySupplierReadPort
  → SupplierRepository.listForUser / getByIdForUser
  → SupplierDao (Room, user_uid scoped, ORDER BY name)
```

Trusted factory:

- `RentCarAgentAPI.forAndroidLocalSupplierReads(SupplierReadPort)`
- `RentCarAgentAPI.forAndroidLocalSupplierReads(Context)` → `DatabaseModule.supplierRepository`

Safe default remains `RentCarAgentAPI.createDisabled()` (no Room access).

## 2. Implemented operations

| Operation | Target | Status |
|-----------|--------|--------|
| `supplier.list` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |
| `supplier.get` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |

All other operations stay disabled. All writes stay disabled. CLOUD target rejected.

## 3. Schemas

### supplier.list parameters

| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Optional; name contains (case-insensitive), matches UI list search |
| `limit` | int | Default 50, max 200 |
| `offset` | int | Default 0 |

`supplierId` on list is **rejected** (`INVALID_ARGUMENT`); use `supplier.get`.

### supplier.get parameters

| Param | Type | Notes |
|-------|------|-------|
| `id` | long | Required; Room supplier PK |

### Response DTO (`SupplierAgentDto`)

Exposed: `id`, `name`, `address`, `taxId`, `phone`, `email`, `defaultHold`, `fixedHold`, commission day percents.

Excluded (minimization): `commissionReportEmail`, `commissionReportFormat`, import function/template codes, `activeTemplateId`, `userUid`.

## 4. Auth assumptions

Requires `auth.userUid` + permission `AUTHENTICATED`.

Missing auth → `UNAUTHORIZED` (no repository call).  
Missing permission → `FORBIDDEN` (no repository call).

Not for untrusted network/MCP callers yet.

## 5. Sync metadata

- `source = LOCAL`
- `syncStatus = UNKNOWN`
- `lastSuccessfulSyncEpochMs = null`

Does not trigger sync.

## 6. Business semantics preserved

- UID isolation via `user_uid` (same as DAO).
- Ordering by name (DAO) with deterministic id tie-break.
- No inactive flag on Supplier entity — all user-scoped rows returned.
- Name search mirrors SuppliersListScreen contains-filter.

## 7. Test results

| Suite | Result |
|-------|--------|
| `AndroidLocalSupplierExecutorTest` | PASSED |
| `AgentApiContractTest` | PASSED |
| `:app:testDebugUnitTest` | **PASSED** (`BUILD SUCCESSFUL`) |
| Device / APK | NOT EXECUTED |

Integration approach: in-memory `SupplierReadPort` mirroring DAO uid + name ordering; production path uses `RepositorySupplierReadPort(SupplierRepository)`.

## 8. Coverage after AGENT-010

| Metric | Value |
|--------|------:|
| Registered | 204 |
| Implemented (catalog + allowlist) | 2 |
| Executable local (when wired) | 2 |
| Executable cloud | 0 |
| Executable writes | 0 |
| Remaining unimplemented | 202 |

## 9. Known limitations

- No MCP / Claude wiring.
- No cloud supplier reads.
- Sync freshness unknown.
- Pagination is in-memory after repository list (acceptable for supplier cardinality).

## 10. Next dependency

Extend local reads to `reservation.*` / `customer.*` before any writes.
