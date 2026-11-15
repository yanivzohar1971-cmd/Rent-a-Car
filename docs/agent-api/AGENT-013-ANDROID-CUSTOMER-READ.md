# AGENT-013 — Android Local Customer Read Executor

**Status:** COMPLETE  
**Branch:** `feature/claude-agent-api`  
**Depends on:** AGENT-001, AGENT-010, AGENT-012  
**Date:** 2026-11-15

## 1. Architecture

```
AgentRequest
  → RentCarAgentAPI.forAndroidLocalReads(...) / forAndroidLocalCustomerReads(...)
  → DispatchingAgentOperationExecutor
  → AndroidLocalCustomerReadExecutor   (customer.list / customer.get only)
  → CustomerReadPort / RepositoryCustomerReadPort
  → CustomerRepository.listAllForUser / searchForUser / getByIdForUser
  → CustomerDao (Room, user_uid scoped, ORDER BY lastName, firstName)
```

Trusted factories:

- `RentCarAgentAPI.forAndroidLocalCustomerReads(CustomerReadPort)`
- `RentCarAgentAPI.forAndroidLocalCustomerReads(Context)` → `DatabaseModule.customerRepository`
- `RentCarAgentAPI.forAndroidLocalReads(supplier, reservation, customer?)` — all local slices
- Context overload wires supplier + reservation + customer repositories

Safe default remains `RentCarAgentAPI.createDisabled()`.

## 2. Customer entity and repository

| Item | Value |
|------|-------|
| Entity | `com.rentacar.app.data.Customer` |
| PK | `id: Long` |
| DAO | `CustomerDao` |
| Repository | `CustomerRepository` |
| UID column | `user_uid` |

Entity fields: `id`, `firstName`, `lastName`, `phone`, `tzId`, `address`, `email`, `isCompany`, `active`, `createdAt`, `updatedAt`, `userUid`.

Reservation FK: `Reservation.customerId` → `Customer.id` (logical). AGENT-013 does not join reservations.

## 3. Implemented operations

| Operation | Target | Status |
|-----------|--------|--------|
| `customer.list` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |
| `customer.get` | ANDROID_LOCAL (AUTO→local) | **EXECUTABLE** when wired |

Allowlist when all three executors wired:

- `supplier.list` / `supplier.get`
- `reservation.list.manage` / `reservation.get`
- `customer.list` / `customer.get`

## 4. Query parameters

### customer.list

| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Optional; empty → `listAllForUser`; non-empty → `searchForUser` (active only) |
| `limit` | int | Default 50, max 200 |
| `offset` | int | Default 0 |

Search fields (matches `CustomerDao.search`): firstName, lastName, phone, tzId, email (LIKE contains).  
Dedicated filters (`active`, `tzId`, `phone`, …) are **rejected**.

### customer.get

| Param | Type | Notes |
|-------|------|-------|
| `id` | long | Required; **internal Room customer PK only** |

Phone / tzId are not accepted as get identifiers.

## 5. Pagination and sorting

- Primary: `lastName` ASC, `firstName` ASC (DAO)
- Secondary: `id` ASC (stable pagination)
- Empty match → success with empty `items`

## 6. Response DTO (`CustomerAgentDto`)

**Exposed:** `id`, `firstName`, `lastName`, `phone`, `email`, `isCompany`, `active`, `createdAt`, `updatedAt`

**Excluded (privacy minimization):**

| Field | Class | Reason |
|-------|-------|--------|
| `tzId` | Sensitive personal (national ID) | Not Agent API authorized |
| `address` | Sensitive personal | Not Agent API authorized |
| `userUid` | Internal | Isolation metadata |

Same DTO for list and get.

## 7. Auth

Requires `auth.userUid` + `AUTHENTICATED`.  
Missing auth → `UNAUTHORIZED`. Missing permission → `FORBIDDEN`.  
UID isolation via DAO `user_uid`.

## 8. Sync metadata

- `source = LOCAL`
- `syncStatus = UNKNOWN`
- `lastSuccessfulSyncEpochMs = null`
- No sync trigger

## 9. Known limitations

1. Non-empty `query` uses active-only search (existing app behavior).
2. `tzId` / `address` never returned (even though search can match tzId internally).
3. No customer↔reservation join ops in AGENT-013 (`customer.history.reservations` remains registered-only).
4. No cloud executor; no MCP; no writes.

## 10. Coverage after AGENT-013

| Metric | Value |
|--------|------:|
| Registered | 204 |
| Implemented (catalog) | 6 |
| Executable local (all wired) | 6 |
| Executable cloud | 0 |
| Executable writes | 0 |
| Remaining unimplemented | 198 |

## 11. Automated tests

| Suite | Result |
|-------|--------|
| `AndroidLocalCustomerExecutorTest` | PASSED |
| `AndroidLocalSupplierExecutorTest` | PASSED (regression) |
| `AndroidLocalReservationExecutorTest` | PASSED (regression) |
| `AgentApiContractTest` | PASSED |
| `:app:testDebugUnitTest` | PASSED |
| Device / Room instrumentation | NOT EXECUTED |

Integration approach: in-memory `CustomerReadPort` mirroring DAO uid + list/search semantics; production path uses `RepositoryCustomerReadPort(CustomerRepository)`.

## 12. Next dependencies

Prefer high-value read-only verticals (commission balances, sales summaries, supplier financial reads) after explicit approval — not write ops, not MCP yet.
