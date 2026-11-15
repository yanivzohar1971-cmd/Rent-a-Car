# OPERATION-COVERAGE — Agent API Matrix

**Legend (Agent API column status):**

| Status | Meaning |
|--------|---------|
| NOT_STARTED | No Agent API yet (default for all) |
| EXISTING_LOGIC_FOUND | App already implements capability |
| REQUIRES_REFACTORING | Logic trapped in VM/UI |
| LOCAL_SUPPORTED | App local path exists (Room) |
| CLOUD_SUPPORTED | Synced/cloud path exists |
| BOTH_SUPPORTED | Local + cloud mirror paths |
| BLOCKED | Cannot expose until architecture fix |
| NOT_ELIGIBLE | Must not expose to Claude |

**Important:** `ANDROID_IMPLEMENTATION` / `CLOUD_IMPLEMENTATION` below refer to **existing app support**, not Agent completion.

## Summary metrics

| Metric | Value |
|--------|-------|
| TOTAL_BUSINESS_ENTITIES (Room) | **34** |
| TOTAL_DISCOVERED_OPERATIONS (reconciled rows) | **204** |
| TOTAL_READ_OPERATIONS | **105** |
| TOTAL_WRITE_OPERATIONS | **99** |
| PHASE0_SUMMARY_CLAIM | 196 / 98 / 98 (superseded by row parse) |
| TOTAL_CLOUD_CAPABLE_OPERATIONS | **~105** (Y or partial; see 02) |
| TOTAL_LOCAL_ONLY_OPERATIONS | **~55** (N / local truth) |
| TOTAL_CLOUD_ONLY_OPERATIONS | **~36** |
| TOTAL_OPERATIONS_REQUIRING_REFACTORING | **14** |
| TOTAL_SECURITY_CRITICAL_OPERATIONS | **~30** (HARD/CRITICAL confirm) |
| SYNCHRONIZED_ENTITIES | **12** |
| REGISTERED_OPERATIONS | **204** |
| IMPLEMENTED_OPERATIONS | **33** read operations (AGENT-010 through AGENT-018 + Batch B partial) |
| EXECUTABLE_LOCAL_OPERATIONS | **33** (when `forAndroidLocalReads` wires all ports) |
| EXECUTABLE_CLOUD_OPERATIONS | **0** |
| EXECUTABLE_WRITE_OPERATIONS | **0** |
| REMAINING_UNIMPLEMENTED | **171** (72 reads / 99 writes) — reads classified in [READ-ELIGIBILITY.md](./READ-ELIGIBILITY.md): 6 ELIGIBLE, 66 NOT_ELIGIBLE |
| TESTED_OPERATIONS (local read fixtures) | **33** |
| MCP_TOOLS_EXPOSED | **33** via authenticated gateway; **verified on emulator AgentDev** (`EMULATOR_REAL_ROOM`); fixture mode still available; 0 on physical phone / Claude NL (login required) |
| WRITE_COMMAND_FOUNDATION | prepare/preview pipeline in `agentapi.commands`; **0 executable writes** |

---

## Matrix (representative full set)

Status columns abbreviated: AppLocal / AppCloud / Agent / MCP / Confirm / Tests / Blockers

| OPERATION_ID | ENTITY | CAT | R/W | AppLocal | AppCloud | Agent(registry) | MCP | Confirm | Tests | Blockers |
|--------------|--------|-----|-----|----------|----------|-------|-----|---------|-------|----------|
| supplier.list | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-010 | cloud disabled |
| supplier.get | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-010 | cloud disabled |
| suppliers.search | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | NONE | weak | use supplier.list+query |
| suppliers.create | Supplier | catalog | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | SOFT | weak | cloud write unsafe |
| suppliers.update | Supplier | catalog | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | cloud write unsafe |
| suppliers.delete | Supplier | catalog | W | LOCAL_SUPPORTED | BLOCKED | REGISTERED | NOT_STARTED | CRITICAL | weak | no tombstones |
| customer.list | Customer | crm | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-013 | cloud disabled; tzId/address excluded |
| customer.get | Customer | crm | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-013 | internal id only; privacy minimized |
| agent.history.reservations | Reservation | rental | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | gateway (fixture) | NONE | Batch B | cloud disabled; reuses reservationsByAgent |
| import.log.list | SupplierImportRun | import | R | LOCAL_SUPPORTED | LOCAL_ONLY | EXECUTABLE_LOCAL | gateway (fixture) | NONE | Batch B | run headers only; no entries/file hash |
| customers.* (other) | Customer | crm | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | deletes / history not wired |
| reservation.list.manage | Reservation | rental | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-012 | cloud disabled; query local fields only |
| reservation.get | Reservation | rental | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | EXECUTABLE_LOCAL | NOT_STARTED | NONE | AGENT-012 | internal id only; cloud disabled |
| reservations.create | Reservation | rental | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| reservations.update | Reservation | rental | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| reservations.delete | Reservation | rental | W | LOCAL_SUPPORTED | BLOCKED | REGISTERED | NOT_STARTED | CRITICAL | weak | no tombstones |
| reservations.payments.* | Payment | rental | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | financial |
| branches.* | Branch | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | deletes |
| agents.* | Agent | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | — |
| carTypes.* | CarType | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | — |
| requests.* | Request | sales | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | — |
| carSales.* | CarSale | sales | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | weak | — |
| carSales.commission.status | CarSaleCommissionPayment | sales | R | LOCAL_SUPPORTED | BOTH_SUPPORTED | REGISTERED | NOT_STARTED | NONE | partial | reuse Logic class |
| carSales.commission.pay | CarSaleCommissionPayment | sales | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | financial |
| supplierTerms.* | SupplierCustomerTerm | terms | R/W | LOCAL_SUPPORTED | PARTIAL | REGISTERED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| priceLists.* | SupplierPriceList* | pricing | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | REGISTERED | NOT_STARTED | HARD | weak | cloud N/A |
| commissions.recon.* | CommissionReconciliation* | finance | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | REGISTERED | NOT_STARTED | CRITICAL | weak | device required |
| commissions.recon.settle | CommissionSettlementEvent | finance | W | LOCAL_SUPPORTED | LOCAL_ONLY | REGISTERED | NOT_STARTED | CRITICAL | weak | BLOCKED cloud |
| import.* / monthlyReport.* | SupplierImport* | import | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | REGISTERED | NOT_STARTED | CRITICAL | weak | batch risk |
| yard.* | yard/cloud | yard | R/W | mixed | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | HARD | weak | roles |
| admin.* | admin | admin | R/W | N | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | CRITICAL | weak | NOT_ELIGIBLE early |
| sync.run | SyncQueue | sync | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | SOFT | weak | side effects |
| backup.*.restore | backup | system | W | LOCAL_SUPPORTED | mixed | REGISTERED | NOT_STARTED | CRITICAL | weak | NOT_ELIGIBLE early? |
| export.run | export | system | R | LOCAL_SUPPORTED | LOCAL_ONLY | REGISTERED | NOT_STARTED | NONE | weak | — |
| debug.db.browse | debug | system | R | LOCAL_SUPPORTED | N | NOT_ELIGIBLE | NOT_ELIGIBLE | — | — | security |
| auth.* | auth | security | R/W | N/A | CLOUD_SUPPORTED | REGISTERED | NOT_STARTED | varies | partial | OAuth bridge later |

Full per-operation rows live in [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md); this matrix tracks Agent rollout state.

## Priority exposure order

1. supplier.list/get (Android local) — **AGENT-010 done**
2. reservation.list/get (device) — **done**
3. customer.list/get — **done**
4. financial, sales, fleet, reporting, and catalog/reservation read batches — **done**
5. authenticated device gateway / MCP transport — **foundation done (JVM/fixtures)**; real device transport next
6. writes remain disabled pending confirmation, idempotency, and audit controls
7. Never: debug.db.browse; defer admin.roles & backup.restore
