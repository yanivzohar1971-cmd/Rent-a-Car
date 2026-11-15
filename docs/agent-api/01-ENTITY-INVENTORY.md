# 01 — Business Entity Inventory

**Verified:** 2026-11-15 — `AppDatabase` version **44**, entities array in `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`.  
**Sync evidence:** `CloudDeltaSyncWorker` category list + `syncSingleItem` switch (`app/src/main/java/com/rentacar/app/work/CloudDeltaSyncWorker.kt`).

## Classification legend

| Label | Meaning |
|-------|---------|
| SYNCHRONIZED | Explicitly uploaded by `CloudDeltaSyncWorker` / restored by cloud→local path |
| PARTIALLY_SYNCHRONIZED | Some cloud path exists (Storage/Firestore) but not full dirty-queue parity |
| LOCAL_ONLY | Room entity with **no** entry in delta sync switch |
| CLOUD_ONLY | Firebase-only (no Room table) |
| UNKNOWN | Insufficient evidence |

## Identifier distinctions (critical)

| Concept | Location | Notes |
|---------|----------|-------|
| Local reservation PK | `Reservation.id: Long` | Room authority |
| Supplier order number | Reservation / commission report fields (e.g. Shagrir `COL_ORDER`) | External matching for supplier reports |
| Invoice / contract external IDs | Import/report columns | Must not be conflated with local PK |
| Firebase UID | Auth + `user_uid` on rows | Tenant root `users/{uid}/...` |
| Firestore document ID | Usually `entityId.toString()` under UID collection | Sync-layer mapping |

---

## Complete Room entity list (34)

From `AppDatabase.entities`:

1. `Customer`
2. `Supplier`
3. `Branch`
4. `CarType`
5. `Reservation`
6. `Payment`
7. `CardStub`
8. `CommissionRule`
9. `Agent`
10. `Request`
11. `CarSale`
12. `CarSaleCommissionPayment`
13. `SupplierTemplate`
14. `SupplierMonthlyHeader`
15. `SupplierMonthlyDeal`
16. `SupplierImportRun`
17. `SupplierImportRunEntry`
18. `SupplierPriceListHeader`
19. `SupplierPriceListItem`
20. `SyncQueueEntity` (`sync_queue`)
21. `CarManufacturerEntity`
22. `CarModelEntity`
23. `CarEngineEntity`
24. `CarTransmissionEntity`
25. `CarVariantEntity`
26. `SupplierCommissionImportConfig`
27. `SupplierCommissionReportImport`
28. `SupplierCommissionReportLine`
29. `CommissionReconciliationItem`
30. `CommissionSettlementEvent`
31. `CommissionTrackingOverride`
32. `EmailCommissionReportFingerprint`
33. `SupplierCustomerTerm`
34. `SupplierCustomerTermsCustomization`

---

## SYNCHRONIZED (12) — dirty queue + Firestore under `users/{uid}/...`

Evidence: `CloudDeltaSyncWorker` categories / `syncSingleItem`:

| # | Kotlin entity | sync `entityType` | Firestore collection | DAO | Primary repo / access |
|---|---------------|-------------------|----------------------|-----|------------------------|
| 1 | `Customer` | `customer` | `customers` | `CustomerDao` | `CustomerRepository` / catalog |
| 2 | `Supplier` | `supplier` | `suppliers` | `SupplierDao` | `SupplierRepository` |
| 3 | `Agent` | `agent` | `agents` | `AgentDao` | catalog / agents UI |
| 4 | `CarType` | `carType` | `carTypes` | `CarTypeDao` | catalog |
| 5 | `Branch` | `branch` | `branches` | `BranchDao` | supplier branches |
| 6 | `Reservation` | `reservation` | `reservations` | `ReservationDao` | `ReservationRepository` |
| 7 | `Payment` | `payment` | `payments` | `PaymentDao` | reservation payments |
| 8 | `CommissionRule` | `commissionRule` | `commissionRules` | `CommissionRuleDao` | commission rules |
| 9 | `CardStub` | `cardStub` | `cardStubs` | `CardStubDao` | reservation card stubs |
| 10 | `Request` | `request` | `requests` | `RequestDao` | sales requests |
| 11 | `CarSale` | `carSale` | `carSales` | `CarSaleDao` | car sales / yard-adjacent |
| 12 | `CarSaleCommissionPayment` | `carSaleCommissionPayment` | `carSaleCommissionPayments` | `CarSaleCommissionPaymentDao` | car sale commissions |

**Direction:** ENTITY_SPECIFIC bidirectional pattern — Android dirty upload (`set`) + cloud→local restore with “local newer wins / no deletes” behavior in `CloudToLocalRestoreRepository`.

---

## PARTIALLY_SYNCHRONIZED (2+)

| Entity | Evidence | Notes |
|--------|----------|-------|
| `SupplierCustomerTerm` / `SupplierCustomerTermsCustomization` | Nested on supplier Firestore payload (`customerTerms`); `CustomerTermsRepository.restoreFromCloudPayload`; local dirty via `markSupplierDirty` | **Not** a top-level sync `entityType`. Prefer Device Executor; cloud may lag or be sticky-local |
| Supplier documents (file metadata) | Storage + document screens | Blobs/metadata; not in the 12-type dirty switch |

> Default Agent routing: prefer Device Executor for terms/docs until top-level cloud parity is proven.

---

## LOCAL_ONLY (20 Room entities)

All remaining Room entities, including:

- Supplier import pipeline: `SupplierTemplate`, `SupplierMonthlyHeader`, `SupplierMonthlyDeal`, `SupplierImportRun`, `SupplierImportRunEntry`
- Price lists: `SupplierPriceListHeader`, `SupplierPriceListItem`
- Commission reconciliation pipeline: `SupplierCommissionImportConfig`, `SupplierCommissionReportImport`, `SupplierCommissionReportLine`, `CommissionReconciliationItem`, `CommissionSettlementEvent`, `CommissionTrackingOverride`, `EmailCommissionReportFingerprint`
- Car catalog taxonomy: `CarManufacturerEntity`, `CarModelEntity`, `CarEngineEntity`, `CarTransmissionEntity`, `CarVariantEntity`
- Sync infra: `SyncQueueEntity` (local tracker only)

**Agent implication:** Cloud Executor must return `LOCAL_ONLY` / incomplete for these unless a future sync mapping is added.

---

## CLOUD_ONLY (non-Room)

| Resource | Store | Purpose |
|----------|-------|---------|
| Auth user + profile `users/{uid}` | Auth + Firestore root user doc | Identity, roles, billing flags |
| Admin allowlist `config/admins` | Firestore | Platform admin |
| Presence | Realtime Database | Device online |
| Debug collection `debug_rentacar` | Firestore | Dev debug |
| Storage objects | Cloud Storage | Documents / backups |

---

## Per-entity detail (high-signal)

### Reservation

| Item | Value |
|------|-------|
| Table | `reservations` (Room) |
| PK | `id: Long` |
| FKs | customer, supplier, branch, agent (logical) |
| Screens | `new_reservation`, `edit_reservation/{id}`, `reservation_details/{id}`, `reservations_manage` |
| Sync | SYNCHRONIZED |
| Validation | In `ReservationRepository` / `ReservationViewModel` |
| Permissions | UID-scoped DAO queries via `CurrentUserProvider` |
| Tests | Partial |

### Customer / Supplier / Branch / Agent / CarType

Standard CRUD via list/edit screens; SYNCHRONIZED; UID-scoped DAOs.

### Payment / CardStub

Child of reservation; SYNCHRONIZED; deleted local rows are **not** tombstoned to cloud (see sync audit).

### Request / CarSale / CarSaleCommissionPayment

Sales domain; SYNCHRONIZED; financial risk MEDIUM–HIGH for Agent writes.

### Commission reconciliation entities

LOCAL_ONLY operational truth for supplier report matching (order numbers, invoices). Cloud Agent cannot see unsynced reconciliation state.

### SupplierCustomerTerm

Screens: `supplier_customer_terms/{supplierId}`. Rich editor UX. Sync: PARTIALLY_SYNCHRONIZED / verify before cloud writes.

---

## Summary counts

| Metric | Value |
|--------|-------|
| TOTAL_ROOM_ENTITIES | **34** |
| SYNCHRONIZED | **12** |
| PARTIALLY_SYNCHRONIZED | **2** (terms + documents family) |
| LOCAL_ONLY | **20** |
| Database version | **44** |
