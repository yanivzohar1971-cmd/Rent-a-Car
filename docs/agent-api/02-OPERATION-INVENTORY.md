# 02 — Navigable Business Operation Inventory

**Source of truth for routes:** `app/src/main/java/com/rentacar/app/ui/navigation/NavGraph.kt` → `object Routes`  
**Verified against:** ViewModels, Screens, Repositories, `CloudDeltaSyncWorker` entity allow-list  
**Date:** 2026-11-15  
**Scope:** Navigable UI business operations (screen/route → action). Pure UI chrome (colors of chips while browsing) is omitted unless it persists data or triggers export/import/sync.

## Legend

| Field | Meaning |
|-------|---------|
| **OPERATION_ID** | Dot-style stable id for Agent API mapping |
| **MODULE** | Business domain group |
| **SCREEN** | Compose screen / route entry |
| **ACTION_NAME** | User-facing / developer action |
| **READ_OR_WRITE** | `READ` = query/list/preview/export-only; `WRITE` = create/update/delete/status/import/sync that mutates state |
| **SOURCE_FILES** | Primary ViewModel / Repository / Screen |
| **LOCAL_SUPPORT** | Works against Room / local files / DataStore |
| **CLOUD_SUPPORT** | Guess from sync knowledge (`CloudDeltaSyncWorker` + restore + Firestore-only paths) |
| **CONFIRMATION_LEVEL** | `NONE` / `SOFT` (dialog without destructive risk) / `HARD` (explicit destructive/irreversible confirm) |
| **IMPLEMENTATION_COMPLEXITY** | `LOW` / `MEDIUM` / `HIGH` for Agent API exposure |

### Cloud support values used here

| Value | Meaning |
|-------|---------|
| **YES** | Entity type is in delta sync upload map and/or restore collections |
| **PARTIAL** | Metadata/blob/path exists; local-ahead or incomplete round-trip |
| **NO** | Local-only / prefs / no sync mapping |
| **CLOUD_ONLY** | No Room path; Firebase Auth/Firestore/Functions/Storage only |
| **UNKNOWN** | Insufficient evidence |

### Synchronized entity types (evidence: `CloudDeltaSyncWorker`)

`customer`, `supplier`, `agent`, `carType`, `branch`, `reservation`, `payment`, `commissionRule`, `cardStub`, `request`, `carSale`, `carSaleCommissionPayment`

Restore also pulls these under `users/{uid}/...` via `CloudToLocalRestoreRepository`.  
**Not** in dirty-upload allow-list (treat as LOCAL / PARTIAL): price lists, import logs, commission reconciliation tables, supplier document files, settings prefs, yard profile/public cars (separate Firestore paths).

---

## A. Routes object inventory (`Routes`)

| Constant | Path pattern | Primary screen |
|----------|--------------|----------------|
| `Auth` | `auth` | `AuthScreen` (top-level, not in `NavHost`) |
| `Dashboard` | `dashboard` | `DashboardScreen` |
| `NewReservation` | `new_reservation` | `NewReservationScreen` |
| `NewReservationWithCustomer` | `new_reservation/{customerId}` | `NewReservationScreen` |
| `EditReservation` | `edit_reservation/{id}` | `NewReservationScreen` |
| `ReservationDetails` | `reservation_details/{id}` | `ReservationDetailsScreen` |
| `Settings` | `settings` | `SettingsScreen` |
| `Reports` | `reports` | `ReportsScreen` (stub) |
| `Customers` | `customers` | `CustomersListScreen` |
| `CustomerEdit` / `CustomerEditWithId` | `customer_edit`, `customer_edit/{id}` | `CustomerEditScreen` |
| `CustomerDetails` | `customer_details/{id}` | `CustomerDetailsScreen` |
| `Suppliers` / `SuppliersPick` | `suppliers`, `suppliers_pick` | `SuppliersListScreen` |
| `SupplierEdit` / `SupplierEditWithId` | `supplier_edit`, `supplier_edit/{id}` | `SupplierEditScreen` |
| `Agents` | `agents` | `AgentsListScreen` |
| `AgentEdit` / `AgentEditWithId` | `agent_edit`, `agent_edit/{id}` | `AgentEditScreen` |
| `ReservationsManage` (+ agent query) | `reservations_manage?...` | `ReservationsManageScreen` |
| `CommissionsManage` | `commissions_manage` | Redirect → `ReservationsManage` commissions mode |
| `SupplierBranches` | `supplier_branches/{id}` | `SupplierBranchesScreen` |
| `BranchEdit` / `BranchEditWithId` | `branch_edit/{supplierId}`… | `BranchEditScreen` |
| `Requests` | `requests` | `RequestsScreen` |
| `RequestEdit` / `RequestEditWithId` | `request_edit`… | `RequestEditScreen` |
| `CarPurchase` / `CarPurchaseWithId` | `car_purchase`… | `CarPurchaseScreen` |
| `CarSalesManage` | `car_sales_manage` | `SalesManageScreen` |
| `MonthlyReport` | `monthly_report/{supplierId}/{year}/{month}` | `MonthlyReportScreen` |
| `ImportLog` | `import_log/{supplierId}` | `ImportLogScreen` |
| `SupplierDocuments` | `supplier_documents/{supplierId}` | `SupplierDocumentsScreen` |
| `DocumentPreview` | `documentPreview/{supplierId}/{documentPath}` | `DocumentPreviewScreen` |
| `SupplierPriceLists` | `supplier_price_lists/{supplierId}` | `SupplierPriceListsScreen` |
| `PriceListDetails` | `price_list_details/{headerId}` | `PriceListDetailsScreen` |
| `SupplierCommissionReconciliation` | `supplier_commission_reconciliation/{supplierId}` | `CommissionReconciliationScreen` |
| `SupplierCustomerTerms` | `supplier_customer_terms/{supplierId}` | `SupplierCustomerTermsScreen` |
| `DebugDbBrowser` | `debug_db_browser` | `DebugDbBrowserScreen` |
| `AdminRoleManagement` | `admin_role_management` | `AdminRoleManagementScreen` |
| `YardHome` / `YardProfile` / `YardFleet` / `YardImport` | yard_* | Yard screens |
| `YardCarEdit` / `YardCarEditWithId` | `yard_car_edit`… | `YardCarEditScreen` |
| `YardSmartPublish` / `YardSmartPublishWithJob` | `yard_smart_publish`… | `YardSmartPublishScreen` |
| `AdminHome` / `AdminYards` / `AdminYardDetails` | admin_* | Admin screens |
| *(literal)* | `export` | `ExportScreen` (not on `Routes` object) |

**Role start destinations:** `YARD` → `YardHome`; `ADMIN` → `AdminHome`; else → `Dashboard`. Role selection uses `SelectRoleScreen` (blocking, outside main `NavHost`).

---

## B. Operations by module

### 1. Auth

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `auth.login.email` | auth | `AuthScreen` | Login email/password | WRITE | `AuthViewModel`, `FirebaseAuthRepository` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `auth.signup` | auth | `AuthScreen` | Sign up | WRITE | `AuthViewModel.signup`, `FirebaseAuthRepository` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `auth.login.google` | auth | `AuthScreen` | Google sign-in | WRITE | `AuthViewModel.signInWithGoogle` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `auth.refresh.emailVerification` | auth | `AuthScreen` | Refresh email verification | READ | `AuthViewModel.refreshEmailVerification` | NO | CLOUD_ONLY | NONE | LOW |
| `auth.refresh.profile` | auth | (system) | Refresh user profile | READ | `AuthViewModel.refreshUserProfile` | NO | CLOUD_ONLY | NONE | LOW |
| `auth.logout` | auth | `SettingsScreen` | Logout | WRITE | `AuthViewModel.logout` | PARTIAL (clears session) | CLOUD_ONLY | HARD | LOW |
| `auth.role.select` | auth | `SelectRoleScreen` | Set primary role (legacy) | WRITE | `AuthViewModel.setPrimaryRole` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `auth.bootstrap.backfillUserUid` | auth | (post-login) | Backfill `user_uid` | WRITE | `UserUidBackfill`, `NavGraph` | YES | NO | NONE | HIGH |

**VM logic note:** Auth navigation gating (`AuthNavigationState`, role selection, splash) lives in `AuthViewModel` + `AppNavGraph`, not repositories.

---

### 2. Dashboard / hub

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `dashboard.list.openReservations` | dashboard | `DashboardScreen` | List open/future reservations | READ | `ReservationViewModel.reservationList` | YES | YES | NONE | LOW |
| `dashboard.navigate.newReservation` | dashboard | `DashboardScreen` | Open new reservation | READ | nav → `Routes.NewReservation` | YES | N/A | NONE | LOW |
| `dashboard.navigate.manage` | dashboard | `DashboardScreen` | Open reservations manage | READ | nav → `Routes.ReservationsManage` | YES | N/A | NONE | LOW |
| `dashboard.navigate.requests` | dashboard | `DashboardScreen` | Open sales requests | READ | nav → `Routes.Requests` | YES | N/A | NONE | LOW |
| `dashboard.navigate.customers` | dashboard | `DashboardScreen` | Open customers (or create) | READ | nav → `Customers` / `CustomerEdit` | YES | N/A | NONE | LOW |
| `dashboard.navigate.agents` | dashboard | `DashboardScreen` | Open agents | READ | nav → `Routes.Agents` | YES | N/A | NONE | LOW |
| `dashboard.navigate.suppliers` | dashboard | `DashboardScreen` | Open suppliers (or create) | READ | nav → `Suppliers` / `SupplierEdit` | YES | N/A | NONE | LOW |
| `dashboard.navigate.settings` | dashboard | `DashboardScreen` | Open settings | READ | nav → `Routes.Settings` | YES | N/A | NONE | LOW |
| `dashboard.open.reservation` | dashboard | `DashboardScreen` | Open reservation for edit | READ | nav → `edit_reservation/{id}` | YES | YES | NONE | LOW |

---

### 3. Reservations

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `reservation.list.manage` | reservations | `ReservationsManageScreen` | List/filter/search reservations | READ | `ReservationViewModel.allReservations` | YES | YES | NONE | MEDIUM |
| `reservation.get` | reservations | `ReservationDetailsScreen` / edit | Get reservation by id | READ | `ReservationViewModel.reservation` → `ReservationRepository` | YES | YES | NONE | LOW |
| `reservation.list.byCustomer` | reservations | `CustomerDetailsScreen` / history | List by customer | READ | `reservationsByCustomer` | YES | YES | NONE | LOW |
| `reservation.list.bySupplier` | reservations | supplier history | List by supplier | READ | `reservationsBySupplier` | YES | YES | NONE | LOW |
| `reservation.list.byAgent` | reservations | agent history / locked manage | List by agent | READ | `reservationsByAgent` | YES | YES | NONE | LOW |
| `reservation.list.byBranch` | reservations | branch context | List by branch | READ | `reservationsByBranch` | YES | YES | NONE | LOW |
| `reservation.create` | reservations | `NewReservationScreen` | Create reservation | WRITE | `ReservationViewModel.createReservation` → `ReservationRepository.upsert` | YES | YES | NONE | HIGH |
| `reservation.create.withCustomer` | reservations | `NewReservationScreen` | Create customer + reservation | WRITE | `createCustomerAndReservation` | YES | YES | NONE | HIGH |
| `reservation.update` | reservations | `NewReservationScreen` (edit) | Update reservation fields | WRITE | `updateReservation` | YES | YES | NONE | HIGH |
| `reservation.status.cancel` | reservations | `NewReservationScreen` | Cancel reservation | WRITE | `updateReservationStatus(Cancelled)` | YES | YES | HARD | MEDIUM |
| `reservation.status.uncancel` | reservations | `NewReservationScreen` | Restore from cancelled → Draft | WRITE | `updateReservationStatus(Draft)` | YES | YES | HARD | MEDIUM |
| `reservation.update.supplierOrderNumber` | reservations | VM API / edit flows | Set supplier order number | WRITE | `updateSupplierOrderNumber` | YES | YES | NONE | LOW |
| `reservation.payment.add` | reservations | VM API | Add payment | WRITE | `addPayment` → payment DAO + dirty | YES | YES | NONE | MEDIUM |
| `reservation.payment.list` | reservations | details/edit | List payments | READ | `payments(reservationId)` | YES | YES | NONE | LOW |
| `reservation.cardStub.upsert` | reservations | `NewReservationScreen` | Upsert card stub on save | WRITE | Screen → `cardStubDao` + `syncQueueDao.markDirty` | YES | YES | NONE | HIGH |
| `reservation.share.text` | reservations | details / post-create dialog | Share as text | READ | `ShareService`, `CustomerReservationComposer` | YES | NO | SOFT | MEDIUM |
| `reservation.share.pdf` | reservations | details / post-create | Share PDF | READ | `PdfGenerator` / `ShareService` | YES | NO | SOFT | MEDIUM |
| `reservation.share.image` | reservations | details / post-create | Share image | READ | `ShareService` | YES | NO | SOFT | MEDIUM |
| `reservation.terms.effective` | reservations | share / details | Resolve effective customer terms | READ | `effectiveCustomerTerms` → `CustomerTermsRepository` | YES | PARTIAL | NONE | MEDIUM |
| `reservation.export.excel` | reservations | `ReservationsManageScreen` | Export filtered reservations XLSX | READ | `exportReservationsToExcel` | YES | NO | NONE | HIGH |
| `reservation.filter.dateRange` | reservations | `ReservationsManageScreen` | Filter by date range | READ | Screen filter state | YES | N/A | NONE | LOW |
| `reservation.filter.supplier` | reservations | `ReservationsManageScreen` | Filter by supplier | READ | Screen filter state | YES | N/A | NONE | LOW |
| `reservation.filter.status` | reservations | `ReservationsManageScreen` | Filter by status / closed | READ | Screen filter state | YES | N/A | NONE | LOW |
| `reservation.lock.agent` | reservations | `ReservationsManageScreen` | Agent-locked manage view | READ | `Routes.reservationsManageForAgent` | YES | YES | NONE | LOW |

**VM / Screen logic embedded:**  
- Commission installment calculation for list mode uses `CommissionCalculationService` inside `ReservationsManageScreen` (not only VM).  
- Card stub upsert + dirty marking is **embedded in `NewReservationScreen`**, bypassing `ReservationViewModel`.  
- Hold amount, airport mode, branch rules, price validation largely in `NewReservationScreen`.  
- Excel export formatting/commission columns built inside `ReservationViewModel.exportReservationsToExcel`.

---

### 4. Commissions (agent payout view) / agent commissions

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `commission.manage.open` | commissions | `CommissionsManage` → manage | Open commissions mode | READ | `Routes.CommissionsManage` redirect | YES | N/A | NONE | LOW |
| `commission.installments.list` | commissions | `ReservationsManageScreen` | List commission installments by payout month | READ | `CommissionCalculationService` in screen | YES | NO* | NONE | HIGH |
| `commission.export.smartExcel` | commissions | `ReservationsManageScreen` | Export smart commission workbook | READ | `exportSmartCommissionExcel` → `CommissionSmartExcelExporter` | YES | NO | NONE | HIGH |
| `commission.filter.payoutMonth` | commissions | `ReservationsManageScreen` | Select year/month payout | READ | Screen state | YES | N/A | NONE | LOW |
| `commission.summary.totals` | commissions | `ReservationsManageScreen` | Totals for payout month | READ | `CommissionCalculationService.getTotalCommission` | YES | NO* | NONE | MEDIUM |

\*Commission **amounts** are computed locally from reservation fields + settings/supplier commission %; underlying reservations sync YES.

**Also (car-sale commission alignment from Settings):**

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `commission.alignment.preview` | commissions | `SettingsScreen` dialogs | Preview car-sale commission alignment | READ | `CommissionAlignmentViewModel.onAlignClicked` | YES | YES (reads sales) | SOFT | MEDIUM |
| `commission.alignment.confirm` | commissions | Settings dialogs | Create missing commission payments | WRITE | `CommissionAlignmentViewModel.confirmAlign` → `CarSaleRepository` | YES | YES (`carSaleCommissionPayment`) | HARD | HIGH |

---

### 5. Customers

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `customer.list` | customers | `CustomersListScreen` | List/search customers | READ | `CustomerViewModel.list` → `CustomerRepository` | YES | YES | NONE | LOW |
| `customer.get` | customers | `CustomerEditScreen` / details | Get customer | READ | `CustomerViewModel.customer` | YES | YES | NONE | LOW |
| `customer.create` | customers | `CustomerEditScreen` | Create customer | WRITE | `CustomerViewModel.save` | YES | YES | NONE | MEDIUM |
| `customer.update` | customers | `CustomerEditScreen` | Update customer | WRITE | `CustomerViewModel.save` | YES | YES | NONE | MEDIUM |
| `customer.setActive` | customers | VM API | Soft activate/deactivate | WRITE | `CustomerViewModel.setActive` | YES | YES | NONE | LOW |
| `customer.delete` | customers | `CustomersListScreen` | Delete (UI present; call commented) | WRITE | Screen dialog; `vm.delete` commented | YES | YES* | HARD | MEDIUM |
| `customer.history.reservations` | customers | list/edit history dialog | View reservation history | READ | `customerReservations` / `ReservationViewModel` | YES | YES | SOFT | LOW |
| `customer.navigate.newReservation` | customers | `CustomersListScreen` | Prefill new reservation | READ | nav `new_reservation/{customerId}` | YES | N/A | NONE | LOW |
| `customer.details.view` | customers | `CustomerDetailsScreen` | View customer details | READ | Screen + reservation list | YES | YES | NONE | LOW |

\*Deletes: local delete exists in repo; cloud tombstones are a known gap (see README blockers).

**VM logic:** Duplicate/validation error paths in `CustomerViewModel.save` (`onError`).

---

### 6. Suppliers

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `supplier.list` | suppliers | `SuppliersListScreen` | List/search suppliers | READ | `SuppliersViewModel` → `SupplierRepository` | YES | YES | NONE | LOW |
| `supplier.pick` | suppliers | `SuppliersListScreen` (pickMode) | Pick supplier for reservation | READ | savedStateHandle `picked_supplier_id` | YES | N/A | NONE | LOW |
| `supplier.get` | suppliers | `SupplierEditScreen` | Get supplier | READ | `SuppliersViewModel.supplier` | YES | YES | NONE | LOW |
| `supplier.create` | suppliers | `SupplierEditScreen` | Create supplier | WRITE | `SuppliersViewModel.save` | YES | YES | NONE | MEDIUM |
| `supplier.update` | suppliers | `SupplierEditScreen` | Update supplier (incl. commission email/format) | WRITE | `SuppliersViewModel.save` | YES | YES | NONE | MEDIUM |
| `supplier.delete` | suppliers | `SuppliersListScreen` | Delete if no reservations | WRITE | `SuppliersViewModel.delete` | YES | YES* | HARD | MEDIUM |
| `supplier.commission.settings` | suppliers | `CommissionDialog` on list | Edit supplier commission % overrides | WRITE | Dialog → `vm.save` | YES | YES (on supplier) | SOFT | MEDIUM |
| `supplier.template.invoice` | suppliers | `TemplateSelectDialog` | Assign invoice import template/function code | WRITE | Dialogs + `SupplierDao` | YES | PARTIAL | NONE | HIGH |
| `supplier.template.priceList` | suppliers | `PriceListTemplateSelectDialog` | Assign price-list import template | WRITE | Dialogs + DAO | YES | PARTIAL | NONE | HIGH |
| `supplier.template.commissionReport` | suppliers | `CommissionReportTemplateSelectDialog` | Assign commission report import config | WRITE | Dialogs + `SupplierCommissionImportConfig` DAO | YES | NO | NONE | HIGH |
| `supplier.navigate.documents` | suppliers | list FAB | Open documents | READ | nav `supplier_documents/{id}` | YES | N/A | NONE | LOW |
| `supplier.navigate.branches` | suppliers | list FAB | Open branches | READ | nav `supplier_branches/{id}` | YES | N/A | NONE | LOW |
| `supplier.navigate.terms` | suppliers | `SupplierEditScreen` | Open customer terms editor | READ | nav `supplier_customer_terms/{id}` | YES | N/A | NONE | LOW |
| `supplier.navigate.monthlyReport` | suppliers | list FAB | Open monthly report | READ | nav `monthly_report/...` | YES | N/A | NONE | LOW |
| `supplier.navigate.importLog` | suppliers | list FAB | Open import log | READ | nav `import_log/{id}` | YES | N/A | NONE | LOW |
| `supplier.navigate.reconciliation` | suppliers | import type chooser | Open commission reconciliation | READ | nav `supplier_commission_reconciliation/{id}` | YES | N/A | NONE | LOW |

**VM logic:** `SuppliersViewModel.onSupplierPriceListClick` navigates after ensuring price-list readiness.

---

### 7. Branches

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `branch.list` | branches | `SupplierBranchesScreen` | List branches for supplier | READ | `SuppliersViewModel.branches` | YES | YES | NONE | LOW |
| `branch.create` | branches | `BranchEditScreen` | Create branch | WRITE | `addBranch` / `CatalogRepository.upsertBranch` | YES | YES | NONE | LOW |
| `branch.update` | branches | `BranchEditScreen` | Update branch | WRITE | `updateBranch` | YES | YES | NONE | LOW |
| `branch.delete` | branches | branches UI | Delete branch | WRITE | `SuppliersViewModel.deleteBranch` | YES | YES* | HARD | MEDIUM |
| `branch.inline.update` | branches | `NewReservationScreen` | Inline branch edit during reservation | WRITE | `ReservationViewModel.updateBranch` | YES | YES | NONE | MEDIUM |

---

### 8. Terms (supplier customer terms)

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `terms.load.effective` | terms | `SupplierCustomerTermsScreen` | Load effective terms (HE/EN) | READ | `SupplierCustomerTermsViewModel` → `CustomerTermsRepository.getEffectiveTerms` | YES | PARTIAL | NONE | MEDIUM |
| `terms.language.select` | terms | terms screen | Switch language (dirty guard) | READ/WRITE† | `selectLanguage` / discard dialogs | YES | N/A | SOFT | MEDIUM |
| `terms.term.add` | terms | terms screen | Add draft term | WRITE | `addTerm` + `CustomerTermsEditorLogic` | YES | PARTIAL | NONE | LOW |
| `terms.term.update` | terms | terms screen | Edit text/style/enabled | WRITE | `updateTerm*` | YES | PARTIAL | NONE | LOW |
| `terms.term.reorder` | terms | terms screen | Move up/down | WRITE | `moveUp`/`moveDown` | YES | PARTIAL | NONE | LOW |
| `terms.term.delete` | terms | terms screen | Delete term | WRITE | `requestDelete`/`confirmDelete` | YES | PARTIAL | HARD | LOW |
| `terms.variable.insert` | terms | terms screen | Insert template variable token | WRITE | `insertVariable` + `TemplateResolver` | YES | N/A | NONE | MEDIUM |
| `terms.save` | terms | terms screen | Persist terms | WRITE | `save` → `CustomerTermsRepository.saveTerms` (+ dirty supplier) | YES | PARTIAL | NONE | HIGH |
| `terms.reset` | terms | terms screen | Reset to defaults | WRITE | `confirmReset` | YES | PARTIAL | HARD | MEDIUM |

†Language switch may discard unsaved draft (write to UI state only until save).

**VM logic heavily embedded:** `CustomerTermsEditorLogic` + draft dirty/unsaved dialogs in `SupplierCustomerTermsViewModel`.

---

### 9. Documents (supplier)

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `document.list` | documents | `SupplierDocumentsScreen` | List docs (metadata + filesystem) | READ | Screen + `SupplierDocumentsMetadataStore` | YES | PARTIAL | NONE | MEDIUM |
| `document.preview` | documents | `DocumentPreviewScreen` | Preview document | READ | Screen | YES | PARTIAL | NONE | MEDIUM |
| `document.upload.pick` | documents | `SupplierDocumentsScreen` | Add/upload files | WRITE | Screen file copy + metadata | YES | PARTIAL | NONE | HIGH |
| `document.delete` | documents | documents screen | Delete selected files | WRITE | Screen `file.delete` + metadata | YES | PARTIAL | HARD | MEDIUM |
| `document.share` | documents | documents screen | Share selected | READ | Intent share | YES | NO | NONE | LOW |
| `document.sort` | documents | documents screen | Change sort mode | READ | Screen state | YES | N/A | NONE | LOW |

**Logic note:** Much document IO/metadata sync-with-filesystem logic is **embedded in `SuppliersScreens.kt`**, not a dedicated ViewModel.

---

### 10. Price lists

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `priceList.list` | price_lists | `SupplierPriceListsScreen` | List headers for supplier | READ | `SupplierPriceListsViewModel` → `SupplierPriceListDao` | YES | NO | NONE | LOW |
| `priceList.import` | price_lists | `PriceListImportDialog` (list FAB / supplier import) | Import price list file | WRITE | Dialog + import function codes | YES | NO | SOFT | HIGH |
| `priceList.details.view` | price_lists | `PriceListDetailsScreen` | Browse groups/models/filters | READ | `PriceListDetailsViewModel` | YES | NO | NONE | MEDIUM |
| `priceList.details.filter` | price_lists | details | Filter manufacturer/gearbox/group | READ | `onGroupSelected`, `onManufacturerFilterSelected`, … | YES | NO | NONE | LOW |

---

### 11. Commissions reconciliation (supplier report matching)

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `recon.setup.open` | reconciliation | `CommissionReconciliationScreen` | Open setup for supplier | READ | `CommissionReconciliationViewModel` | YES | NO | NONE | MEDIUM |
| `recon.file.pick` | reconciliation | screen | Pick supplier report file | WRITE‡ | `onFilePicked` | YES | NO | NONE | MEDIUM |
| `recon.email.search` | reconciliation | screen | Search mailbox for reports | READ | `searchEmailReports` | PARTIAL | PARTIAL (IMAP/cloud mailbox prefs) | NONE | HIGH |
| `recon.email.preview` | reconciliation | screen | Preview email report candidate | READ | `previewEmailReport` | YES | PARTIAL | NONE | HIGH |
| `recon.clipboard.import` | reconciliation | clipboard dialog | Import from clipboard | WRITE‡ | `onClipboardImportRequested` / `confirmClipboardReconciliation` | YES | NO | SOFT | HIGH |
| `recon.preview.run` | reconciliation | screen | Run match preview | READ | `runPreview` | YES | NO | NONE | HIGH |
| `recon.match.manual` | reconciliation | screen | Apply/clear manual match | WRITE‡ | `applyManualMatch` / `clearManualMatch` | YES | NO | NONE | HIGH |
| `recon.draft.save` | reconciliation | screen | Persist draft import + items | WRITE | `saveDraft` → `CommissionReconciliationRepository` | YES | NO | NONE | HIGH |
| `recon.approve.safe` | reconciliation | screen | Approve selected safe matches | WRITE | `approveSelectedSafe` | YES | NO | HARD | HIGH |
| `recon.export.excel` | reconciliation | screen | Export reconciliation Excel | READ | `exportExcel` | YES | NO | NONE | HIGH |
| `recon.export.json` | reconciliation | screen | Export reconciliation JSON | READ | `exportReconciliationJson` | YES | NO | NONE | MEDIUM |
| `recon.history.open` | reconciliation | screen | Open historical import | READ | `openHistoryImport` / `showHistory` | YES | NO | NONE | MEDIUM |
| `recon.filter.sort` | reconciliation | screen | Filter/sort/select rows | READ | `setFilter`, `toggleSelect*`, … | YES | N/A | NONE | MEDIUM |

‡Preview/match state may be in-memory until `saveDraft` / `approveSelectedSafe`.

**VM logic heavily embedded:** matching, diagnostics, email/clipboard gates, payment difference totals — primarily in `CommissionReconciliationViewModel` + `commission/` package (not thin repo wrappers).

---

### 12. Sales / requests / car sales

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `request.list` | sales | `RequestsScreen` | List requests | READ | `RequestsViewModel` → `RequestRepository` | YES | YES | NONE | LOW |
| `request.create` | sales | `RequestEditScreen` | Create request | WRITE | `RequestsViewModel.save` | YES | YES | NONE | MEDIUM |
| `request.update` | sales | `RequestEditScreen` | Update request | WRITE | `RequestsViewModel.save` | YES | YES | NONE | MEDIUM |
| `request.delete` | sales | `RequestsScreen` | Delete request | WRITE | `RequestsViewModel.delete` | YES | YES* | HARD | LOW |
| `request.convert.reservation` | sales | `RequestsScreen` | Prefill → new reservation | WRITE§ | savedStateHandle prefill + later `deleteRequest` | YES | YES | SOFT | HIGH |
| `request.convert.carSale` | sales | `RequestsScreen` | Prefill → car purchase | WRITE§ | prefill + optional request delete on save | YES | YES | SOFT | HIGH |
| `carSale.list` | sales | `SalesManageScreen` | List car sales + commission filters | READ | `CarSaleViewModel` / `CarSaleRepository` | YES | YES | NONE | MEDIUM |
| `carSale.create` | sales | `CarPurchaseScreen` | Create car sale | WRITE | `CarSaleViewModel.save` / `saveWithCommissionPayments` | YES | YES | NONE | HIGH |
| `carSale.update` | sales | `CarPurchaseScreen` | Update car sale | WRITE | same | YES | YES | NONE | HIGH |
| `carSale.delete` | sales | purchase/manage | Delete car sale | WRITE | `CarSaleViewModel.delete` | YES | YES* | HARD | MEDIUM |
| `carSale.commissionPayment.add` | sales | `CarPurchaseScreen` | Add commission payment draft | WRITE | `addCommissionPaymentValidated` | YES | YES | NONE | HIGH |
| `carSale.commissionPayment.update` | sales | `CarPurchaseScreen` | Update payment draft | WRITE | `updateCommissionPaymentValidated` | YES | YES | NONE | HIGH |
| `carSale.commissionPayment.delete` | sales | `CarPurchaseScreen` | Mark payment deleted | WRITE | `markCommissionPaymentDeleted` | YES | YES | SOFT | MEDIUM |
| `carSale.commission.totals` | sales | purchase/manage | Compute payment status/remaining | READ | `CarSaleCommissionPaymentLogic` | YES | N/A | NONE | MEDIUM |
| `carSale.navigate.manage` | sales | `RequestsScreen` | Open sales manage | READ | nav `CarSalesManage` | YES | N/A | NONE | LOW |

§Conversion itself is navigation + optional delete of source request after successful create.

**VM logic:** `CarSaleViewModel` embeds validation via `CarSaleCommissionPaymentLogic`; request→reservation conversion deletes request from `NewReservationScreen` / purchase save paths.

---

### 13. Yard

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `yard.home.view` | yard | `YardHomeScreen` | Yard hub | READ | Screen + `AuthViewModel` | YES | CLOUD_ONLY (role) | NONE | LOW |
| `yard.profile.load` | yard | `YardProfileScreen` | Load yard profile | READ | `YardProfileViewModel` → `YardProfileRepository` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `yard.profile.save` | yard | `YardProfileScreen` | Save yard profile | WRITE | `onSaveClicked` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `yard.fleet.list` | yard | `YardFleetScreen` | List fleet inventory | READ | `YardFleetViewModel` → `YardFleetRepository` / `CarSaleRepository` | YES | PARTIAL | NONE | MEDIUM |
| `yard.fleet.filter` | yard | fleet | Filter/sort fleet | READ | `updateStatusFilter`, ranges, query, sort | YES | N/A | NONE | LOW |
| `yard.car.create` | yard | `YardCarEditScreen` | Create yard car/sale | WRITE | `YardCarEditViewModel.onSaveClicked` | YES | PARTIAL (Room carSale YES; public publish separate) | NONE | HIGH |
| `yard.car.update` | yard | `YardCarEditScreen` | Update yard car | WRITE | same | YES | PARTIAL | NONE | HIGH |
| `yard.car.images.add` | yard | car edit | Add images | WRITE | `onAddImagesSelected` + `PublicCarRepository` | PARTIAL | CLOUD_ONLY (Storage/Firestore) | NONE | HIGH |
| `yard.car.images.remove` | yard | car edit | Remove image | WRITE | `onRemoveImage` | PARTIAL | CLOUD_ONLY | NONE | MEDIUM |
| `yard.car.publication.set` | yard | car edit | Set publication status | WRITE | `onPublicationStatusChanged` | YES | PARTIAL | NONE | MEDIUM |
| `yard.import.start` | yard | `YardImportScreen` | Start import job / upload path | WRITE | `YardImportViewModel.startImport` → `FirebaseYardImportRepository` | NO | CLOUD_ONLY | NONE | HIGH |
| `yard.import.commit` | yard | import | Commit import → local | WRITE | `commitImport` + `CloudToLocalRestoreRepository` | YES | YES (pull) | SOFT | HIGH |
| `yard.import.reset` | yard | import | Reset for new import | WRITE | `resetForNewImport` | N/A | N/A | NONE | LOW |
| `yard.smartPublish.load` | yard | `YardSmartPublishScreen` | Load publish candidates | READ | `YardSmartPublishViewModel.load` | YES | PARTIAL | NONE | MEDIUM |
| `yard.smartPublish.select` | yard | smart publish | Select cars / filters | READ | toggle/select APIs | YES | N/A | NONE | LOW |
| `yard.smartPublish.publishSelected` | yard | smart publish | Publish selected | WRITE | `publishSelected` → `PublicCarRepository` | PARTIAL | CLOUD_ONLY (public) | SOFT | HIGH |
| `yard.smartPublish.hideSelected` | yard | smart publish | Hide selected | WRITE | `hideSelected` | PARTIAL | CLOUD_ONLY | SOFT | HIGH |
| `yard.smartPublish.draftSelected` | yard | smart publish | Draft selected | WRITE | `draftSelected` | PARTIAL | CLOUD_ONLY | SOFT | HIGH |
| `yard.smartPublish.bulkFilter` | yard | smart publish | Publish/hide/draft all in filter | WRITE | `publishAllInFilter` / `hideAllInFilter` / `draftAllInFilter` | PARTIAL | CLOUD_ONLY | SOFT | HIGH |
| `yard.smartPublish.publishNewFromImport` | yard | smart publish | Publish new cars from import job | WRITE | `publishNewCarsFromImport` | PARTIAL | CLOUD_ONLY | SOFT | HIGH |

---

### 14. Reports / export

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `report.monthly.view` | reports | `MonthlyReportScreen` | Monthly supplier commission report | READ | `MonthlyReportViewModel` → `MonthlyReportRepository` | YES | NO* | NONE | HIGH |
| `report.monthly.navigateMonth` | reports | monthly | Prev/next month | READ | `prevMonth`/`nextMonth`/`setPayoutMonth` | YES | N/A | NONE | LOW |
| `report.stub.csv` | reports | `ReportsScreen` | Placeholder CSV export | READ | stub TODO | YES | NO | NONE | LOW |
| `export.snapshot.json` | export | `ExportScreen` | Export full JSON snapshot (+settings) | READ | `ExportViewModel.buildSnapshotJson*` | YES | NO | NONE | HIGH |
| `export.snapshot.import` | export | `ExportScreen` / Settings data mgmt | Import JSON snapshot | WRITE | `importSnapshotJson` | YES | NO† | HARD | HIGH |
| `export.csv.customers` | export | `ExportScreen` | Export customers CSV | READ | `buildCustomersCsv` | YES | NO | NONE | LOW |
| `export.csv.suppliers` | export | Export | Export suppliers CSV | READ | `buildSuppliersCsv` | YES | NO | NONE | LOW |
| `export.csv.branches` | export | Export | Export branches CSV | READ | `buildBranchesCsv` | YES | NO | NONE | LOW |
| `export.csv.carTypes` | export | Export | Export car types CSV | READ | `buildCarTypesCsv` | YES | NO | NONE | LOW |
| `export.csv.reservations` | export | Export | Export reservations CSV | READ | `buildReservationsCsv` | YES | NO | NONE | MEDIUM |
| `export.csv.payments` | export | Export | Export payments CSV | READ | `buildPaymentsCsv` | YES | NO | NONE | LOW |
| `export.csv.agents` | export | Export | Export agents CSV | READ | `buildAgentsCsv` | YES | NO | NONE | LOW |
| `export.csv.settings` | export | Export | Export settings CSV | READ | `buildSettingsCsv` | YES | NO | NONE | LOW |
| `export.carSales` | export | Export | Export car sales | READ | `exportCarSales` | YES | NO | NONE | LOW |
| `export.requests` | export | Export | Export requests | READ | `exportRequests` | YES | NO | NONE | LOW |
| `import.csv.customers` | export | Export | Import customers CSV | WRITE | `importCustomersCsv` | YES | NO† | HARD | HIGH |
| `import.csv.suppliers` | export | Export | Import suppliers CSV | WRITE | `importSuppliersCsv` | YES | NO† | HARD | HIGH |
| `import.csv.branches` | export | Export | Import branches CSV | WRITE | `importBranchesCsv` | YES | NO† | HARD | MEDIUM |
| `import.csv.carTypes` | export | Export | Import car types CSV | WRITE | `importCarTypesCsv` | YES | NO† | HARD | MEDIUM |
| `import.csv.reservations` | export | Export | Import reservations CSV | WRITE | `importReservationsCsv` | YES | NO† | HARD | HIGH |
| `import.csv.payments` | export | Export | Import payments CSV | WRITE | `importPaymentsCsv` | YES | NO† | HARD | HIGH |
| `import.csv.settings` | export | Export | Import settings CSV | WRITE | `importSettingsCsv` | YES | NO | HARD | MEDIUM |

\*Computed from local reservations.  
†Import mutates Room; subsequent sync may seed dirty items to cloud — not a first-class cloud import API.

**VM logic:** `ExportViewModel.importSnapshotJson` contains large inline mapping/upsert orchestration (high embedding).

---

### 15. Settings / backup / cloud

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `settings.theme.buttonColor` | settings | `SettingsScreen` | Set button color | WRITE | `SettingsStore.setButtonColor` | YES | NO | NONE | LOW |
| `settings.theme.titleColor` | settings | Settings | Set title colors | WRITE | `SettingsStore` | YES | NO | NONE | LOW |
| `settings.theme.iconColors` | settings | Settings | Reservation/customer icon colors | WRITE | `SettingsStore` | YES | NO | NONE | LOW |
| `settings.vat.set` | settings | Settings | Set VAT % | WRITE | `SettingsStore` | YES | NO | NONE | LOW |
| `settings.commission.defaults` | settings | Settings | Default commission day-band % | WRITE | `SettingsStore` | YES | NO | NONE | MEDIUM |
| `settings.screenshot.allow` | settings | Settings | Toggle screenshot allowance | WRITE | `SettingsStore` / `ScreenSecurityUtils` | YES | NO | NONE | LOW |
| `settings.mailbox.configure` | settings | `MailboxSettingsDialog` | Configure commission report mailbox | WRITE | Dialog + prefs | YES | PARTIAL | SOFT | HIGH |
| `settings.dataManagement.open` | settings | Settings | Open data management | READ | dialog | YES | N/A | NONE | LOW |
| `settings.export.navigate` | settings | data mgmt | Navigate to ExportScreen | READ | nav `export` | YES | N/A | NONE | LOW |
| `settings.debug.dbBrowser` | settings | data mgmt | Open DB browser | READ | `DebugDbBrowserScreen` | YES | NO | NONE | MEDIUM |
| `settings.backup.run` | settings | data mgmt | Run local/cloud backup worker | WRITE | `BackupWorker` via WorkManager | YES | PARTIAL | SOFT | HIGH |
| `settings.sync.now` | settings | data mgmt | Sync now (delta) | WRITE | `SyncNowViewModel` → `CloudDeltaSyncWorker` | YES | YES | NONE | HIGH |
| `settings.sync.check` | settings | `DataSyncCheckDialog` | Compare local vs cloud counts | READ | `SettingsSyncCheckViewModel` → `DataSyncCheckRepository` | YES | YES | NONE | MEDIUM |
| `settings.cloud.restore` | settings | Settings | Cloud → local restore (insert-missing) | WRITE | WorkManager + `CloudToLocalRestoreRepository` | YES | YES | HARD | HIGH |
| `settings.firestore.debugWrite` | settings | data mgmt | Write Firestore debug doc | WRITE | `FirestoreDebugLogger` | NO | CLOUD_ONLY | NONE | LOW |
| `settings.adminRole.navigate` | settings | Settings (admin) | Open role management | READ | nav `AdminRoleManagement` | NO | CLOUD_ONLY | NONE | LOW |

---

### 16. Admin

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `admin.home.dashboard` | admin | `AdminHomeScreen` | Load admin dashboard | READ | `AdminDashboardViewModel` → `data.admin.FirebaseAdminRepository` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `admin.yards.list` | admin | `AdminYardsScreen` | List/search yards | READ | `AdminYardsViewModel` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `admin.yards.filter` | admin | yards | Filter by status / search | READ | `onStatusFilterChanged`, `performSearch` | NO | CLOUD_ONLY | NONE | LOW |
| `admin.yard.details` | admin | `AdminYardDetailsScreen` | View yard details | READ | `AdminYardDetailsViewModel` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `admin.yard.status.save` | admin | yard details | Save yard status + reason | WRITE | `saveStatus` | NO | CLOUD_ONLY | SOFT | MEDIUM |
| `admin.yard.importer.save` | admin | yard details | Assign importer id/version | WRITE | `saveImporter` | NO | CLOUD_ONLY | SOFT | MEDIUM |
| `admin.roles.pending.list` | admin | `AdminRoleManagementScreen` | List pending role requests | READ | `AdminViewModel.loadPendingRequests` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `admin.roles.request.resolve` | admin | role mgmt | Approve/reject role request | WRITE | `resolveRoleRequest` → Cloud Function | NO | CLOUD_ONLY | HARD | HIGH |
| `admin.roles.user.search` | admin | role mgmt | Search users | READ | `searchUsers` | NO | CLOUD_ONLY | NONE | MEDIUM |
| `admin.roles.user.set` | admin | role mgmt | Set user primary role | WRITE | `setUserRole` → Cloud Function | NO | CLOUD_ONLY | HARD | HIGH |

---

### 17. Agents

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `agent.list` | agents | `AgentsListScreen` | List agents | READ | `AgentsViewModel` → `CatalogRepository` | YES | YES | NONE | LOW |
| `agent.create` | agents | `AgentEditScreen` | Create agent | WRITE | `AgentsViewModel.save` | YES | YES | NONE | LOW |
| `agent.update` | agents | `AgentEditScreen` | Update agent | WRITE | `AgentsViewModel.save` | YES | YES | NONE | LOW |
| `agent.delete` | agents | `AgentsListScreen` | Delete agent | WRITE | `AgentsViewModel.delete` | YES | YES* | HARD | MEDIUM |
| `agent.history.reservations` | agents | list history dialog | View agent reservations | READ | `ReservationViewModel.reservationsByAgent` | YES | YES | SOFT | LOW |
| `agent.navigate.lockedManage` | agents | list | Open agent-locked reservations manage | READ | `Routes.reservationsManageForAgent` | YES | YES | NONE | LOW |

---

### 18. Imports (supplier Excel / logs)

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `import.excel.reservations` | imports | `SuppliersListScreen` import chooser | Import supplier Excel via function code | WRITE | `ImportViewModel.importExcelForSupplier` → `ImportDispatcher` | YES | NO† | SOFT | HIGH |
| `import.priceList.file` | imports | `PriceListImportDialog` | Import price list | WRITE | Dialog + price list DAOs | YES | NO | SOFT | HIGH |
| `import.commission.navigate` | imports | import chooser | Navigate to reconciliation | READ | requires `SupplierCommissionImportConfig` | YES | NO | NONE | MEDIUM |
| `import.log.list` | imports | `ImportLogScreen` | View import run log entries | READ | `ImportLogViewModel` / DAOs | YES | NO | NONE | MEDIUM |

†Imported reservations become local Room rows and can later dirty-sync as `reservation`.

---

### 19. Debug (navigable support)

| OPERATION_ID | MODULE | SCREEN | ACTION_NAME | R/W | SOURCE_FILES | LOCAL | CLOUD | CONFIRM | COMPLEXITY |
|--------------|--------|--------|-------------|-----|--------------|-------|-------|---------|------------|
| `debug.db.browse` | debug | `DebugDbBrowserScreen` | Browse Room tables | READ | `DebugDbBrowserViewModel` → `DebugDatabaseRepository` | YES | NO | NONE | MEDIUM |

---

## C. Where business logic is embedded in ViewModels / Screens

| Location | Embedded logic (high signal) |
|----------|------------------------------|
| `ReservationViewModel` | UID-scoped flows; create/update; Excel + smart commission export; commission installment sums via `CommissionCalculationService` |
| `NewReservationScreen` (`Screens.kt`) | Validation matrix (hold/dates/branch/airport); cardStub DAO writes + dirty marks; cancel/uncancel dialogs; share composition; request delete after convert |
| `ReservationsManageScreen` | Commission mode filtering independent of date filters; installment projection; export progress UI |
| `CommissionReconciliationViewModel` | File/email/clipboard ingest; matching; safe-approve; diagnostics; Excel/JSON export |
| `CustomerTermsEditorLogic` + `SupplierCustomerTermsViewModel` | Draft editing, unsaved dialogs, reset/delete confirmations, template variables |
| `CarSaleViewModel` + `CarSaleCommissionPaymentLogic` | Payment validation, remaining/status, batch save of payments with sale |
| `ExportViewModel` | Full snapshot JSON build/import; per-entity CSV import mapping |
| `ImportViewModel` + `ImportDispatcher` | Supplier-specific Excel function codes |
| `CommissionAlignmentViewModel` | Preview/align car-sale commission payments |
| `YardCarEditViewModel` / `YardSmartPublishViewModel` | Catalog variant selection; public publish/hide/draft orchestration |
| `YardImportViewModel` | Cloud import job + commit + restore hook |
| `AuthViewModel` | Navigation/auth state machine, role selection gating |
| `AdminViewModel` | Cloud Functions callable orchestration |
| `SuppliersScreens.kt` (documents) | Filesystem + metadata store; delete/share; not ViewModel-centric |

---

## D. Totals

Counting discrete **OPERATION_ID** rows above (navigable/business actions).

### Reconciliation note (AGENT-001)

An automated parse of every `OPERATION_ID` table row found a discrepancy versus the original Phase 0 summary claim:

| Source | TOTAL | READ | WRITE |
|--------|------:|-----:|------:|
| Original Phase 0 summary claim | 196 | 98 | 98 |
| **Authoritative row parse (AGENT-001)** | **204** | **105** | **99** |

Cause: the summary arithmetic under-counted module sections present in this document (for example reports+export split and footnote-marked WRITE rows such as `WRITE‡` / `READ/WRITE†`). The Agent API registry uses the **authoritative row parse**.

| Metric | Count |
|--------|-------|
| **TOTAL_OPERATIONS** | **204** |
| **READ** | **105** |
| **WRITE** | **99** |
| Modules covered | auth, dashboard, reservations, commissions, customers, suppliers, branches, terms, documents, price_lists, reconciliation, sales, yard, reports/export, settings/backup/cloud, admin, agents, imports, debug |

### By cloud support (approx.)

| CLOUD_SUPPORT | Count (approx.) |
|---------------|-----------------|
| YES | ~70 |
| PARTIAL | ~35 |
| NO / N/A | ~55 |
| CLOUD_ONLY | ~36 |

### By confirmation

| CONFIRMATION_LEVEL | Approx. |
|--------------------|---------|
| NONE | majority (~140) |
| SOFT | ~30 |
| HARD | ~26 |

---

## E. Agent API implications (operation layer)

1. Prefer wrapping **Repository** methods for CRUD; do not call Screen-embedded DAO paths (card stubs, document FS) without a first-class service.
2. **Commission installment views** and **monthly reports** are derived READ ops — expose as calculators, not Firestore collections.
3. **Reconciliation / price lists / import logs / settings** are Device-Executor first (LOCAL / NO cloud entity map).
4. **Yard public publish** and **Admin/Auth** are Cloud-Executor native (`CLOUD_ONLY` or Firestore yards).
5. Any WRITE that currently relies on `sync_queue.markDirty` must remain Device-side until server command APIs exist (see README blockers: no server business validation; deletes lack tombstones).

---

## F. Key source file index

| Area | Primary files |
|------|----------------|
| Routes / Nav | `ui/navigation/NavGraph.kt` |
| Reservations | `ui/vm/ReservationViewModel.kt`, `data/Repositories.kt` (`ReservationRepository`), `ui/screens/Screens.kt`, `ui/screens/ReservationsManageScreen.kt`, `ui/screens/ReservationDetailsScreen.kt` |
| Customers | `ui/vm/CustomerViewModel.kt`, `CustomerRepository`, `ui/screens/CustomersScreens.kt` |
| Suppliers/Branches/Docs | `ui/vm/SuppliersViewModel.kt`, `SupplierRepository`, `CatalogRepository`, `ui/screens/SuppliersScreens.kt` |
| Terms | `ui/vm/SupplierCustomerTermsViewModel.kt`, `CustomerTermsRepository`, `CustomerTermsEditorLogic.kt` |
| Price lists | `SupplierPriceListsViewModel`, `PriceListDetailsViewModel`, `SupplierPriceListDao` |
| Reconciliation | `CommissionReconciliationViewModel`, `commission/CommissionReconciliationRepository.kt` |
| Sales | `RequestsViewModel`, `CarSaleViewModel`, `RequestRepository`, `CarSaleRepository`, `RequestsScreens.kt`, `SalesManageScreen.kt` |
| Agents | `AgentsViewModel`, `AgentsScreens.kt` |
| Export/Import | `ExportViewModel`, `ImportViewModel`, `ExportScreen.kt`, `ImportDispatcher` |
| Settings/Sync | `SettingsReportsScreens.kt`, `SyncNowViewModel`, `SettingsSyncCheckViewModel`, `CloudDeltaSyncWorker`, `BackupWorker`, `CloudToLocalRestoreRepository` |
| Yard | `Yard*ViewModel`, `YardFleetRepository`, `YardProfileRepository`, `PublicCarRepository`, `FirebaseYardImportRepository` |
| Admin/Auth | `AuthViewModel`, `FirebaseAuthRepository`, `AdminViewModel`, `Admin*ViewModel`, `data.admin.FirebaseAdminRepository` |
| Reports | `MonthlyReportViewModel`, `MonthlyReportRepository` |

---

*End of 02-OPERATION-INVENTORY.md*
