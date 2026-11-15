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

**Important:** `ANDROID_IMPLEMENTATION` / `CLOUD_IMPLEMENTATION` below refer to **existing app support**, not Agent completion. `MCP_EXPOSURE` is always NOT_STARTED at Phase 0 end.

## Summary metrics (from Phase 0 audit)

| Metric | Value |
|--------|-------|
| TOTAL_BUSINESS_ENTITIES (Room) | **34** |
| TOTAL_DISCOVERED_OPERATIONS | **118** |
| TOTAL_READ_OPERATIONS | **62** |
| TOTAL_WRITE_OPERATIONS | **56** |
| TOTAL_CLOUD_CAPABLE_OPERATIONS | **58** (full or partial sync/cloud) |
| TOTAL_LOCAL_ONLY_OPERATIONS | **28** |
| TOTAL_OPERATIONS_REQUIRING_REFACTORING | **14** |
| TOTAL_SECURITY_CRITICAL_OPERATIONS | **22** |
| SYNCHRONIZED_ENTITIES | **12** |
| AGENT_API_IMPLEMENTED | **0** |
| MCP_TOOLS_EXPOSED | **0** |

---

## Matrix (representative full set)

Status columns abbreviated: AppLocal / AppCloud / Agent / MCP / Confirm / Tests / Blockers

| OPERATION_ID | ENTITY | CAT | R/W | AppLocal | AppCloud | Agent | MCP | Confirm | Tests | Blockers |
|--------------|--------|-----|-----|----------|----------|-------|-----|---------|-------|----------|
| suppliers.list | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | partial | — |
| suppliers.get | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | partial | — |
| suppliers.search | Supplier | catalog | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | weak | — |
| suppliers.create | Supplier | catalog | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | SOFT | weak | cloud write unsafe |
| suppliers.update | Supplier | catalog | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | cloud write unsafe |
| suppliers.delete | Supplier | catalog | W | LOCAL_SUPPORTED | BLOCKED | NOT_STARTED | NOT_STARTED | CRITICAL | weak | no tombstones |
| customers.* | Customer | crm | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | deletes |
| reservations.list | Reservation | rental | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | weak | partial lag |
| reservations.get | Reservation | rental | R | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | weak | id spaces |
| reservations.create | Reservation | rental | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| reservations.update | Reservation | rental | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| reservations.delete | Reservation | rental | W | LOCAL_SUPPORTED | BLOCKED | NOT_STARTED | NOT_STARTED | CRITICAL | weak | no tombstones |
| reservations.payments.* | Payment | rental | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | financial |
| branches.* | Branch | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | deletes |
| agents.* | Agent | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | — |
| carTypes.* | CarType | catalog | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | — |
| requests.* | Request | sales | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | — |
| carSales.* | CarSale | sales | R/W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | weak | — |
| carSales.commission.status | CarSaleCommissionPayment | sales | R | LOCAL_SUPPORTED | BOTH_SUPPORTED | NOT_STARTED | NOT_STARTED | NONE | partial | reuse Logic class |
| carSales.commission.pay | CarSaleCommissionPayment | sales | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | financial |
| supplierTerms.* | SupplierCustomerTerm | terms | R/W | LOCAL_SUPPORTED | PARTIAL | NOT_STARTED | NOT_STARTED | HARD | weak | REQUIRES_REFACTORING |
| priceLists.* | SupplierPriceList* | pricing | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | NOT_STARTED | NOT_STARTED | HARD | weak | cloud N/A |
| commissions.recon.* | CommissionReconciliation* | finance | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | NOT_STARTED | NOT_STARTED | CRITICAL | weak | device required |
| commissions.recon.settle | CommissionSettlementEvent | finance | W | LOCAL_SUPPORTED | LOCAL_ONLY | NOT_STARTED | NOT_STARTED | CRITICAL | weak | BLOCKED cloud |
| import.* / monthlyReport.* | SupplierImport* | import | R/W | LOCAL_SUPPORTED | LOCAL_ONLY | NOT_STARTED | NOT_STARTED | CRITICAL | weak | batch risk |
| yard.* | yard/cloud | yard | R/W | mixed | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | HARD | weak | roles |
| admin.* | admin | admin | R/W | N | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | CRITICAL | weak | NOT_ELIGIBLE early |
| sync.run | SyncQueue | sync | W | LOCAL_SUPPORTED | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | SOFT | weak | side effects |
| backup.*.restore | backup | system | W | LOCAL_SUPPORTED | mixed | NOT_STARTED | NOT_STARTED | CRITICAL | weak | NOT_ELIGIBLE early? |
| export.run | export | system | R | LOCAL_SUPPORTED | LOCAL_ONLY | NOT_STARTED | NOT_STARTED | NONE | weak | — |
| debug.db.browse | debug | system | R | LOCAL_SUPPORTED | N | NOT_ELIGIBLE | NOT_ELIGIBLE | — | — | security |
| auth.* | auth | security | R/W | N/A | CLOUD_SUPPORTED | NOT_STARTED | NOT_STARTED | varies | partial | OAuth bridge later |

Full per-operation rows live in [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md); this matrix tracks Agent rollout state.

## Priority exposure order

1. suppliers.search/get (cloud) — Slice 1  
2. reservations.search/get (device) — Slice 2  
3. customers.search/get  
4. reservations.create/update with confirmation — Slice 3  
5. carSales.commission.status (read) before pay (write)  
6. commissions.recon.* only via device + CRITICAL confirm  
7. Never: debug.db.browse; defer admin.roles & backup.restore
