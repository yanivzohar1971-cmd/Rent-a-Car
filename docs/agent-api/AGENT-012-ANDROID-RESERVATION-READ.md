# AGENT-012 — Android Local Reservation Read Executor

**Status:** COMPLETE  
**Branch:** `feature/claude-agent-api`  
**Depends on:** AGENT-001, AGENT-010  
**Date:** 2026-11-15

## 1. Architecture

```
AgentRequest
  → RentCarAgentAPI.forAndroidLocalReads(...) / forAndroidLocalReservationReads(...)
  → DispatchingAgentOperationExecutor
  → AndroidLocalReservationReadExecutor   (reservation.list.manage / reservation.get only)
  → ReservationReadPort / RepositoryReservationReadPort
  → ReservationRepository.getAllReservationsForUser / getReservationForUser
  → ReservationDao (Room, user_uid scoped, ORDER BY dateFrom DESC)
```

Trusted factories:

- `RentCarAgentAPI.forAndroidLocalReservationReads(ReservationReadPort)`
- `RentCarAgentAPI.forAndroidLocalReservationReads(Context)` → `DatabaseModule.reservationRepository`
- `RentCarAgentAPI.forAndroidLocalReads(SupplierReadPort, ReservationReadPort)` — supplier + reservation
- `RentCarAgentAPI.forAndroidLocalReads(Context)` — both repositories via `DatabaseModule`

Safe default remains `RentCarAgentAPI.createDisabled()` (no Room access).  
AGENT-010 `forAndroidLocalSupplierReads` remains unchanged (supplier-only wiring).

## 2. Implemented operations

| Operation | Target | Status |
|-----------|--------|--------|
| `reservation.list.manage` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |
| `reservation.get` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |

Allowlist after AGENT-012 (when both executors wired):

- `supplier.list`
- `supplier.get`
- `reservation.list.manage`
- `reservation.get`

All other operations stay disabled. All 99 writes stay disabled. CLOUD target rejected.

## 3. Accepted query parameters

### reservation.list.manage

| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Optional; reservation-local contains match (see below) |
| `limit` | int | Default 50, max 200 |
| `offset` | int | Default 0; negative rejected |

**Supported `query` fields (reservation entity only):**

- internal `id` (string contains)
- `supplierOrderNumber`
- `externalContractNumber`
- `status` name
- `carTypeName`

**Rejected (not in catalog schema):** `status`, `supplierId`, `customerId`, `agentId`, `branchId`, date-range filters, `supplierOrderNumber` / `externalContractNumber` as dedicated params, etc. → `INVALID_ARGUMENT` via request validation / executor.

### reservation.get

| Param | Type | Notes |
|-------|------|-------|
| `id` | long | Required; **internal Room reservation PK only** |

`supplierOrderNumber` and `externalContractNumber` are **not** accepted as get identifiers.

## 4. Response DTO (`ReservationAgentDto`)

Exposed: `id`, `customerId`, `supplierId`, `branchId`, `carTypeId`, `carTypeName`, `agentId`, `dateFrom`, `dateTo`, `actualReturnDate`, VAT/airport flags, `agreedPrice`, `kmIncluded`, `requiredHoldAmount`, `periodTypeDays`, `commissionPercentUsed`, `status` (enum name string), `isClosed`, `isQuote`, `supplierOrderNumber`, `externalContractNumber`, `createdAt`, `updatedAt`.

Excluded (minimization / security): `notes` (may contain card fragments), `userUid`.

Same DTO for list and get.

## 5. Identifier semantics

| Field | Meaning |
|-------|---------|
| `id` | Internal Room primary key |
| `supplierOrderNumber` | Supplier-facing order number |
| `externalContractNumber` | External contract / reconciliation id |

These are never conflated. `reservation.get` only accepts internal `id`.

## 6. Authorization

Requires `auth.userUid` + permission `AUTHENTICATED`.

Missing auth → `UNAUTHORIZED` (no repository call).  
Missing permission → `FORBIDDEN` (no repository call).  
UID isolation via `ReservationDao` `user_uid` filter (same as app).

Not for untrusted network/MCP callers yet.

## 7. Local data source / sync metadata

- `source = LOCAL`
- `syncStatus = UNKNOWN`
- `lastSuccessfulSyncEpochMs = null`
- Does **not** trigger sync, upload, download, or queue mutation

## 8. Error handling

Reuses AGENT-001 structured errors: `INVALID_ARGUMENT`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `UNSUPPORTED_OPERATION` (CLOUD), `WRITE_DISABLED`, `EXECUTION_DISABLED`, `INTERNAL_ERROR`.

Request / correlation IDs preserved. No SQL/stack traces in client payloads.

## 9. Sorting and pagination

- Primary: `dateFrom` DESC (matches `ReservationDao.getAll`)
- Secondary: `id` DESC (stable pagination when dates equal)
- Bounded `limit` / `offset`; empty match → success with empty `items`

## 10. Automated tests

| Suite | Result |
|-------|--------|
| `AndroidLocalReservationExecutorTest` | see build |
| `AndroidLocalSupplierExecutorTest` | regression |
| `AgentApiContractTest` | regression |
| `:app:testDebugUnitTest` | see build |
| Device / APK | NOT EXECUTED |

Integration approach: in-memory `ReservationReadPort` mirroring DAO uid + `dateFrom DESC`; production path uses `RepositoryReservationReadPort(ReservationRepository)`.

## 11. Known limitations

1. Catalog `query` does **not** join customer name/phone or supplier name (UI manage screen does). Documented; future enrichment may add ports without inventing filters.
2. Manage-screen status / supplier / date-range UI filters are **not** in the AGENT-001 catalog schema for this operation — intentionally rejected, not silently reinterpreted.
3. No reservation-level sync freshness in Room → `UNKNOWN`.
4. No cloud executor; no MCP; no writes.

## 12. Future dependencies

- AGENT-013: customer local reads (recommended next)
- Later: MCP / device gateway auth
- Later: richer reservation filters only after catalog schema update

## 13. Coverage after AGENT-012

| Metric | Value |
|--------|------:|
| Registered | 204 |
| Implemented (catalog) | 4 |
| Executable local (when both wired) | 4 |
| Executable cloud | 0 |
| Executable writes | 0 |
| Remaining unimplemented | 200 |
