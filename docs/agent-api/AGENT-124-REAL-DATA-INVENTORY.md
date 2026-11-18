# AGENT-124 — Real Data Source Inventory

**Date:** 2026-11-18 · **Branch:** `feature/claude-agent-api` · **Method:** source-code evidence only
(re-verified against `UserCollections.kt`, `CloudDeltaSyncWorker` upload builders, `firestore.rules`,
`FirebaseTrustedSessionBinder`, entity files; builds on `01-ENTITY-INVENTORY.md` and `03-SYNC-ARCHITECTURE.md`).

No real business record was read to produce this document.

## 1. Where real data lives

| Store | Location | Identity / tenant | Evidence |
|-------|----------|-------------------|----------|
| Local | Room `rentacar.db`, schema **v44**, 34 entities | `user_uid` column on business rows; DAO queries scoped via `CurrentUserProvider` | `DbFileBackupManager`, `DatabaseModule`, entity files |
| Cloud mirror | Firestore `users/{uid}/{collection}/{docId}`; docId = Room `Long` id | Firebase Auth uid (`UserCollections.requireUid()`) | `data/sync/UserCollections.kt` |
| Cloud rules | owner-only read/write on `users/{uid}/**` | `request.auth.uid == userId` | `firestore.rules` L180-187 |
| Identity | Firebase Auth (non-anonymous) | uid → `FirebaseTrustedSessionBinder` (production builds only) | `agentapi/transport/FirebaseTrustedSessionBinder.kt` |

Sync is **upload-driven** (`CloudDeltaSyncWorker`, Android→cloud, full-document `set`) with a separate
full-collection restore path. There is **no tombstone propagation**, **no global sync watermark**, and the
`sync_queue` has no uid column and no unique `(entityType, entityId)` index (see 03-SYNC-ARCHITECTURE §3, §5).

## 2. Domain access matrix

Status vocabulary: `LOCAL_AVAILABLE` (readable from Room on the device), `CLOUD_AVAILABLE` (a Firestore
collection exists for it), `SYNCHRONIZED` (dirty-queue upload + restore), `PARTIALLY_SYNCHRONIZED`,
`LOCAL_ONLY`, `UNKNOWN`.

| Domain | Room entity / source | Firestore collection | Status | Agent read today | Caveats for answers |
|--------|----------------------|----------------------|--------|------------------|--------------------|
| Suppliers | `Supplier` | `suppliers` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ · Cloud-dev ✔ | Restore is insert-if-missing (cloud edits don't override local) |
| Supplier customer terms | `SupplierCustomerTerm*` | nested in `suppliers.customerTerms` | PARTIALLY_SYNCHRONIZED | not exposed | Not a top-level sync type |
| Customers | `Customer` | `customers` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ · Cloud-dev ✔ | `tzId`/`address` excluded from Agent DTOs |
| Reservations | `Reservation` | `reservations` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ · Cloud-dev ✔ | updatedAt LWW on restore; deletes not propagated |
| Reservation payments | `Payment` | `payments` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ (`reservation.payment.list`) | insert-if-missing restore |
| Card stubs | `CardStub` | `cardStubs` | LOCAL_AVAILABLE · SYNCHRONIZED | not exposed (sensitive) | Some writes bypass the dirty marker |
| Branches | `Branch` | `branches` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ | |
| Agents (sales agents) | `Agent` | `agents` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ | |
| Car types | `CarType` | `carTypes` | LOCAL_AVAILABLE · SYNCHRONIZED | via reservations | |
| Commission rules | `CommissionRule` | `commissionRules` | PARTIALLY_SYNCHRONIZED | not exposed | `markCommissionRuleDirty` has no production caller → uploads only via seed |
| Rental commissions | **calculated** from `Reservation` (`CommissionCalculationService`) | none | LOCAL_ONLY (derived) | Local ✔ | **No persisted payment status** → label `CALCULATED_EXPECTED_COMMISSION` (AGENT-131) |
| Car sales | `CarSale` | `carSales` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ · Cloud-dev ✔ | updatedAt LWW on restore |
| Car-sale commission payments | `CarSaleCommissionPayment` | `carSaleCommissionPayments` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ · Cloud-dev ✔ (aggregated) | Persisted → `PAYMENT_TRACKED_BALANCE` |
| Sales requests | `Request` | `requests` | LOCAL_AVAILABLE · SYNCHRONIZED | Local ✔ | |
| Vehicles / yard fleet | `CarSale` yard fields + catalog entities | `carSales` (yard fields) ; catalog none | PARTIALLY_SYNCHRONIZED | Local ✔ (`yard.fleet.*`) | car catalog tables are LOCAL_ONLY |
| Price lists | `SupplierPriceListHeader` + items | none | LOCAL_ONLY | Local ✔ (`priceList.list`) | |
| Imports / import log | `Import*` entities | none | LOCAL_ONLY | Local ✔ (`import.log.list`) | |
| Commission reconciliation | `CommissionReconciliation*` | none | LOCAL_ONLY | not exposed | Device executor required |
| Reports | computed from Room | none | LOCAL_ONLY (derived) | Local ✔ (`report.monthly.view`) | |
| Public car listings | — | `publicCars` (public) | CLOUD_ONLY | not exposed | buyer portal; not owner business data |
| Pending local changes | `sync_queue` | — | LOCAL_ONLY | not exposed | per-item `lastSyncStatus` only |

**Consequences for routing (AGENT-130):**
- Only the device can give a *complete* answer (it holds unsynced creates/edits). The cloud mirror is
  always reported as `resultCompleteness=PARTIAL`, `syncStatus=UNKNOWN`, `lastSuccessfulSyncEpochMs=null`.
- A cloud answer may still contain records deleted on the device (no tombstones).
- LOCAL_ONLY domains (price lists, imports, reconciliation, reports, rental commission) have no cloud
  fallback: with the device offline the correct answer is "unavailable", never an empty list.

## 3. What is NOT yet known (UNKNOWN)

- Real-account data volumes and how many dirty rows exist on the owner's phone (not inspected; no
  authorization to read real data).
- Whether the owner's cloud mirror is currently consistent with the phone (requires an authorized
  count comparison via `DataSyncCheckRepository`).
