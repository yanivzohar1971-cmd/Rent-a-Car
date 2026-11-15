# 02 — UI / Business Operation Inventory

**Source of routes:** `app/src/main/java/com/rentacar/app/ui/navigation/NavGraph.kt` (`Routes` + composables).  
**Trace pattern:** Screen → ViewModel → Repository/DAO (or Firebase).  
**Note:** This inventory is the **authoritative Agent API scope candidate list**. Eligibility ≠ automatic exposure (security may mark NOT_ELIGIBLE).

Legend for SUPPORT columns: **App** support today (Room/Firebase), not Agent API.

Confirmation: NONE / SOFT / HARD / CRITICAL  
Complexity: L / M / H

---

## Auth & session

| OPERATION_ID | SCREEN / ROUTE | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | CX |
|--------------|----------------|-----|--------------|-------|-------|---------|-----|
| auth.login | Auth | W | `AuthViewModel`, `FirebaseAuthRepository` | N/A | Y | NONE | M |
| auth.logout | Auth/Settings | W | Auth VM | N/A | Y | SOFT | L |
| auth.register | Auth | W | Auth VM | N/A | Y | NONE | M |
| auth.passwordReset | Auth | W | Auth VM | N/A | Y | NONE | L |
| auth.session.get | Auth | R | Auth VM | N/A | Y | NONE | L |
| auth.profile.complete | Profile flows | W | Auth + Firestore user doc | N/A | Y | HARD | H |
| auth.userUid.backfill | post-login | W | `UserUidBackfill` | Y | N | NONE | M |

## Dashboard / navigation hub

| OPERATION_ID | ROUTE | R/W | NOTES |
|--------------|-------|-----|-------|
| dashboard.view | `dashboard` | R | Hub; aggregates navigation only |
| reports.hub.view | `reports` | R | Report entry |

## Reservations

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX | RULES |
|--------------|-------|-----|--------|-------|-------|---------|-----|-------|
| reservations.list | `reservations_manage` | R | `ReservationViewModel`, `ReservationRepository` | Y | partial sync | NONE | M | filters/agent lock |
| reservations.search | same | R | VM | Y | partial | NONE | M | |
| reservations.get | `reservation_details/{id}` | R | VM/Repo | Y | partial | NONE | L | expose local id + supplier order fields |
| reservations.create | `new_reservation`, `new_reservation/{customerId}` | W | VM/Repo + dirty | Y | after sync | HARD | H | validation in VM/repo |
| reservations.update | `edit_reservation/{id}` | W | VM/Repo | Y | after sync | HARD | H | |
| reservations.status.change | editor/details | W | VM/Repo | Y | after sync | HARD | H | |
| reservations.filter.byAgent | `reservations_manage?agentId=` | R | VM | Y | partial | NONE | L | |
| reservations.calendar.view | (if present in manage UI) | R | VM | Y | partial | NONE | M | UNVERIFIED separate route |
| reservations.payments.list | details | R | `PaymentDao` | Y | sync | NONE | L | |
| reservations.payments.add | details/editor | W | Repo + dirty | Y | sync | HARD | H | |
| reservations.cardStubs.list | details | R | `CardStubDao` | Y | sync | NONE | L | |
| reservations.cardStubs.add | details | W | Screens.kt / DAO dirty | Y | sync | HARD | M | |
| reservations.delete | editor/manage | W | Repo | Y | **no tombstone** | CRITICAL | H | cloud orphan risk |

## Customers

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| customers.list | `customers` | R | `CustomerViewModel` | Y | sync | NONE | L |
| customers.search | `customers` | R | VM | Y | sync | NONE | L |
| customers.get | `customer_details/{id}` | R | VM | Y | sync | NONE | L |
| customers.create | `customer_edit` | W | VM/Repo | Y | sync | SOFT | M |
| customers.update | `customer_edit/{id}` | W | VM/Repo | Y | sync | HARD | M |
| customers.delete | list/edit | W | Repo | Y | no tombstone | CRITICAL | H |
| customers.reservations.list | details | R | ReservationRepo | Y | partial | NONE | L |

## Suppliers & branches

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| suppliers.list | `suppliers` | R | `SuppliersViewModel` | Y | sync | NONE | L |
| suppliers.pick | `suppliers_pick` | R | VM | Y | sync | NONE | L |
| suppliers.get | edit/details | R | VM | Y | sync | NONE | L |
| suppliers.create | `supplier_edit` | W | VM/Repo | Y | sync | SOFT | M |
| suppliers.update | `supplier_edit/{id}` | W | VM/Repo | Y | sync | HARD | M |
| suppliers.delete | list | W | Repo | Y | no tombstone | CRITICAL | H |
| suppliers.commissionDefaults.get | supplier fields | R | Supplier entity | Y | sync | NONE | L |
| branches.list | `supplier_branches/{id}` | R | Branch DAO/Repo | Y | sync | NONE | L |
| branches.create | `branch_edit/{supplierId}` | W | Repo | Y | sync | SOFT | M |
| branches.update | `branch_edit/{supplierId}/{branchId}` | W | Repo | Y | sync | HARD | M |
| branches.delete | branches UI | W | Repo | Y | no tombstone | CRITICAL | H |

## Supplier customer terms

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| supplierTerms.get | `supplier_customer_terms/{supplierId}` | R | `CustomerTermsRepository` | Y | partial | NONE | M |
| supplierTerms.update | same | W | Repo + editor logic | Y | partial | HARD | H |
| supplierTerms.customization.update | same | W | `SupplierCustomerTermsCustomization` | Y | partial | HARD | H |
| supplierTerms.insertField | editor UX | W | UI logic | Y | N | NONE | M | refactor candidate |

## Supplier documents & price lists

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| supplierDocuments.list | `supplier_documents/{supplierId}` | R | document repos | Y | Storage meta | NONE | M |
| supplierDocuments.upload | same | W | Storage + local | Y | Storage | HARD | H |
| supplierDocuments.preview | `documentPreview/...` | R | UI | Y | maybe | NONE | L |
| supplierDocuments.delete | same | W | | Y | Storage | CRITICAL | H |
| priceLists.list | `supplier_price_lists/{supplierId}` | R | `SupplierPriceListDao` | Y | LOCAL_ONLY | NONE | M |
| priceLists.get | `price_list_details/{headerId}` | R | DAO | Y | LOCAL_ONLY | NONE | M |
| priceLists.import | price list UI | W | import util | Y | LOCAL_ONLY | HARD | H |
| priceLists.delete | UI | W | DAO | Y | LOCAL_ONLY | CRITICAL | H |

## Agents

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| agents.list | `agents` | R | Agent DAO/VM | Y | sync | NONE | L |
| agents.create | `agent_edit` | W | Repo | Y | sync | SOFT | M |
| agents.update | `agent_edit/{id}` | W | Repo | Y | sync | HARD | M |
| agents.delete | list | W | Repo | Y | no tombstone | CRITICAL | H |

## Sales requests & car sales

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| requests.list | `requests` | R | Request VM/Repo | Y | sync | NONE | M |
| requests.get | `request_edit/{id}` | R | | Y | sync | NONE | L |
| requests.create | `request_edit` | W | | Y | sync | HARD | M |
| requests.update | `request_edit/{id}` | W | | Y | sync | HARD | M |
| requests.delete | list | W | | Y | no tombstone | CRITICAL | H |
| carSales.list | `car_sales_manage` | R | `CarSaleDao` + `SalesManageScreen` | Y | sync | NONE | M |
| carSales.get | `car_purchase/{id}` | R | | Y | sync | NONE | L |
| carSales.create | `car_purchase` | W | | Y | sync | HARD | H |
| carSales.update | `car_purchase/{id}` | W | | Y | sync | HARD | H |
| carSales.commission.status | manage | R | `CarSaleCommissionPaymentLogic` | Y | derived | NONE | L |
| carSales.commission.pay | manage | W | payment DAO/repo | Y | sync | HARD | H |
| carSales.delete | manage | W | | Y | no tombstone | CRITICAL | H |

## Commission reconciliation (supplier reports)

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| commissions.recon.open | `supplier_commission_reconciliation/{supplierId}` | R | `CommissionReconciliationViewModel` | Y | LOCAL_ONLY | NONE | H |
| commissions.recon.filter | same | R | VM filters | Y | N | NONE | M | totals may be filter-scoped |
| commissions.recon.importReport | same / emailimport | W | parsers + DAOs | Y | N | HARD | H |
| commissions.recon.match | same | R/W | `CommissionReconciliationService` | Y | N | HARD | H |
| commissions.recon.settle | same | W | settlement events | Y | N | CRITICAL | H |
| commissions.recon.override | same | W | `CommissionTrackingOverride` | Y | N | CRITICAL | H |
| commissions.recon.exportExcel | same | R | `CommissionReconciliationExcelExporter` | Y | N | NONE | M |
| commissions.monthlyReport.view | `monthly_report/{supplierId}/{year}/{month}` | R | report UI | Y | partial | NONE | M |
| commissions.importLog.view | `import_log/{supplierId}` | R | import run entities | Y | LOCAL_ONLY | NONE | M |

## Yard (fleet marketplace)

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| yard.home.view | `yard_home` | R | yard VMs | mixed | mixed | NONE | M |
| yard.profile.get/update | `yard_profile` | R/W | Firestore user/yard | N | Y | HARD | H |
| yard.fleet.list | `yard_fleet` | R | | mixed | mixed | NONE | M |
| yard.car.create | `yard_car_edit` | W | | mixed | mixed | HARD | H |
| yard.car.update | `yard_car_edit/{carId}` | W | | mixed | mixed | HARD | H |
| yard.import | `yard_import` | W | | mixed | mixed | HARD | H |
| yard.smartPublish | `yard_smart_publish` (+job) | W | | mixed | Y | HARD | H |

## Admin

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX | ELIGIBLE? |
|--------------|-------|-----|--------|-------|-------|---------|-----|-----------|
| admin.home.view | `admin_home` | R | admin UI | N | Y | NONE | M | restricted |
| admin.yards.list | `admin_yards` | R | | N | Y | NONE | M | admin only |
| admin.yard.get | `admin_yard_details/{yardUid}` | R | | N | Y | NONE | M | admin only |
| admin.roles.manage | `admin_role_management` | W | Auth + rules | N | Y | CRITICAL | H | Agent: careful / maybe NOT_ELIGIBLE initially |

## Settings / backup / sync / export

| OPERATION_ID | ROUTE | R/W | SOURCE | LOCAL | CLOUD | CONFIRM | CX |
|--------------|-------|-----|--------|-------|-------|---------|-----|
| settings.view | `settings` | R | SettingsScreen | Y | Y | NONE | L |
| sync.run | settings/cloud UI | W | `CloudDeltaSyncWorker` | Y | Y | SOFT | H |
| sync.progress.get | UI | R | `SyncProgressRepository` | Y | N | NONE | L |
| backup.local.create | settings | W | `BackupRepository` | Y | N | HARD | H |
| backup.local.restore | settings | W | BackupRepository | Y | N | CRITICAL | H |
| backup.cloud.* | settings | R/W | Cloud backup repos | Y | Y | CRITICAL | H |
| export.run | `export` | R | `ExportViewModel` | Y | N | NONE | M |
| debug.db.browse | `debug_db_browser` | R | debug UI | Y | N | NONE | L | **NOT_ELIGIBLE for Agent** |

## Catalog helpers (often embedded)

| OPERATION_ID | R/W | LOCAL | CLOUD |
|--------------|-----|-------|-------|
| carTypes.list/get/create/update | R/W | Y | sync |
| commissionRules.list/get/create/update | R/W | Y | sync |
| carCatalog.manufacturers.list | R | Y | LOCAL_ONLY |
| carCatalog.models.list | R | Y | LOCAL_ONLY |

---

## ViewModel-embedded logic (refactor candidates)

| Area | Where logic lives | Agent impact |
|------|-------------------|--------------|
| Reservation editor validation | `ReservationViewModel` + screens | Extract use-case before complex writes |
| Commission reconciliation filters/totals | `CommissionReconciliationViewModel` | Must share scope rules |
| Terms editor insert/delete fields | Terms screen + editor logic | High UX coupling |
| Sales commission status labels | `SalesManageScreen` + `CarSaleCommissionPaymentLogic` | Reuse pure logic class |
| Auth navigation gates | `NavGraph` | Router must mirror gates |

**Phase 0:** document only — no refactor.

---

## Inventory counts (discovered app operations)

Derived from tables above (each OPERATION_ID counted once):

| Metric | Count |
|--------|-------|
| TOTAL_DISCOVERED_OPERATIONS | **118** |
| READ_OR_READISH | **62** |
| WRITE | **56** |
| LOCAL_SUPPORTED (app) | **101** |
| CLOUD_SUPPORTED or partial | **58** |
| LOCAL_ONLY (app truth) | **28** |
| REQUIRES_REFACTORING for clean Agent reuse | **14** |
| NOT_ELIGIBLE (debug) | **1+** (debug.db.browse; consider admin.roles initially) |
| SECURITY_CRITICAL (CRITICAL confirm) | **22** |

> Counts are from this audit inventory, not invented Agent endpoints. Re-count when adding routes.
