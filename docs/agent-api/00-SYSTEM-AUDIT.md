# 00 — System Audit

**Verified:** 2026-11-15 against `feature/claude-agent-api` (docs commit follows baseline `f60512d`)  
**Scope:** Repository / module inventory only. No application implementation changes.  
**Corrections:** Follow-up pass removed stale paths (`CloudSyncRepository`, App Check, RTDB presence worker, invent­ed agency/company repos).

## 1. Repository location

| Item | Value |
|------|--------|
| Path | `C:/Users/Yaniv/source/repos/Rent_a_Car` |
| Remote | `https://github.com/yanivzohar1971-cmd/Rent-a-Car.git` |
| Stable branch | `main` |
| Baseline commit | `f60512d714050643129eeea533374c8a785fd738` |
| Dev branch | `feature/claude-agent-api` |

## 2. Root Gradle / project shape

Single Android application project (not multi-module library set).

| Path | Role |
|------|------|
| `settings.gradle` | Includes `:app` only; `rootProject.name = 'Rent a Car'` |
| `build.gradle` | Root plugins: Android Application, Kotlin Android, Google Services, Firebase Crashlytics, Kotlin Serialization (apply false) |
| `gradle.properties` | JVM args, AndroidX, non-transitive R |
| `app/build.gradle` | Application module configuration |
| `app/google-services.json` | Firebase project binding (do not document secrets) |
| `firestore.rules` | Cloud Firestore security rules (UID path isolation) |
| `firestore.indexes.json` | Composite indexes |
| `storage.rules` | Cloud Storage rules |
| `functions/` | Firebase Cloud Functions (Node) |

**Not present in tree:** `database.rules.json` (earlier citation was incorrect).

**Verified:** No product flavors. No `applicationIdSuffix`. Build types: `debug` / `release` only.

## 3. Android application module

| Item | Value |
|------|--------|
| Module | `:app` |
| `namespace` / `applicationId` | `com.rentacar.app` |
| `minSdk` | 26 |
| `targetSdk` / `compileSdk` | 35 |
| Kotlin JVM | 17 |
| Compose | Enabled |
| Room schema export | `app/schemas` |
| KSP | Room compiler |

### Dependencies (high-signal)

- Jetpack Compose + Navigation Compose
- Room + WorkManager
- Firebase BOM: Auth, Firestore, Storage, Functions, Crashlytics, Analytics (**no App Check / Play Integrity dependency found in `app/build.gradle`**)
- ML Kit Document Scanner, CameraX, Guava ListenableFuture
- Apache POI / Commons Compress (Excel / ZIP imports)
- Kotlin Serialization + Coroutines
- **No Hilt / Dagger** — manual composition root in `DatabaseModule` / `NavGraph`

## 4. Kotlin package structure

Root package: `com.rentacar.app`

| Package / area | Responsibility | Key entry |
|----------------|----------------|-----------|
| `data` | Room entities/DAOs + many repositories | `data/AppDatabase.kt`, `data/Repositories.kt` |
| `data.sync` | Dirty queue, restore, SyncDirtyMarker | `data/sync/*` |
| `data.auth` | Firebase auth | `data/auth/AuthRepository.kt` (`FirebaseAuthRepository`) |
| `data.admin` | Admin Firestore helpers | `FirebaseAdminRepository` |
| `di` | Manual composition root | `di/DatabaseModule.kt` |
| `work` | WorkManager sync / restore / backup | `work/CloudDeltaSyncWorker.kt`, `CloudRestoreWorker.kt`, `BackupWorker.kt` |
| `ui` | Compose screens, ViewModels, navigation | `ui/*` |
| `ui.navigation` | `NavGraph`, `Routes` | `ui/navigation/NavGraph.kt` |
| `domain` | Commission calculator / business dates | `domain/CommissionCalculator.kt`, `CommissionCalculationService` |
| `commission` | Reconciliation domain/presentation | `commission/*` |
| `emailimport` | Supplier commission report parsers | `emailimport/*` |
| `reports` | Excel/report exporters | `reports/*` |

## 5. Build variants / environments

| Variant | applicationId | Notes |
|---------|---------------|-------|
| `debug` | `com.rentacar.app` | Same ID as release |
| `release` | `com.rentacar.app` | Minify + shrink |

Debug and release **cannot coexist** on one device. No dedicated Firebase/dev flavor. See [DEV-ENVIRONMENT-SAFETY.md](./DEV-ENVIRONMENT-SAFETY.md).

## 6. Room database

| Item | Value |
|------|--------|
| Class | `com.rentacar.app.data.AppDatabase` |
| Name | `"rentacar.db"` |
| Version | **44** |
| Entities | **34** |
| Schema JSON | `app/schemas/com.rentacar.app.data.AppDatabase/44.json` |

## 7. Repository layer (verified)

Primary CRUD lives in `data/Repositories.kt` and related `data/*` types (not a separate `repository/` package for core rental):

| Type | Notes |
|------|-------|
| `ReservationRepository`, customer/supplier/request/car-sale repos | Room + `SyncDirtyMarker` |
| `CatalogRepository` | Agents, car types, branches helpers |
| `CustomerTermsRepository` | Terms; marks supplier dirty; cloud payload nested on supplier |
| `FirebaseAuthRepository` | Auth |
| `CloudToLocalRestoreRepository` | Cloud → Room restore |
| Yard / admin / public car repos | Mixed Room + Firestore |

**Absent (do not cite):** `CloudSyncRepository`, `AgencyRepository`, `CompanyRepository`, `CloudAuthRepository` as previously sketched names.

## 8. ViewModels / UI

Navigation: `NavGraph.kt` + `Routes`. Role start destinations: YARD → `YardHome`, ADMIN → `AdminHome`, else `Dashboard`. Full ops: [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md) (**196** operations).

## 9. Domain services

| Area | Classes | Role |
|------|---------|------|
| Rental commission math | `domain/CommissionCalculator.kt`, `CommissionCalculationService`, `CommissionBusinessDates` | Installments / % tiers |
| Car-sale commission status | `CarSaleCommissionPaymentLogic` | UNPAID/PARTIAL/PAID/NO_COMMISSION |
| Reconciliation | `CommissionReconciliationService`, `CommissionReconciliationApprovalService`, `CommissionComparisonMapper` | Match / approve / totals |

**Not found:** `CommissionStatusResolver`.

## 10. Background workers

| Worker | Path | Role |
|--------|------|------|
| `CloudDeltaSyncWorker` | `work/CloudDeltaSyncWorker.kt` | **Upload only** (dirty queue → Firestore) |
| `CloudRestoreWorker` | `work/CloudRestoreWorker.kt` | Manual cloud → local restore |
| `BackupWorker` | `work/` | Backup jobs |

**Not found:** `CloudPresenceHeartbeatWorker` / RTDB presence sync worker in the Android tree.

## 11. Authentication / authorization (summary)

- Firebase Auth via `FirebaseAuthRepository` / `AuthViewModel` (email/password, Google).
- UID tenancy: Room `user_uid` + Firestore `users/{uid}/...`.
- Admin: claims / profile / `config/admins` + Cloud Functions `setUserRole` / `resolveRoleRequest`.
- **App Check:** not wired (contrary to earlier draft).

## 12. Cloud modules

Firebase Auth, Firestore, Storage, Functions, Crashlytics, Analytics. Sync collections listed in [03-SYNC-ARCHITECTURE.md](./03-SYNC-ARCHITECTURE.md). Rules: `firestore.rules`, `storage.rules` only in-repo.

## 13. Sync / backup / import-export

| Capability | Location |
|------------|----------|
| Dirty marking | `SyncDirtyMarker`, `sync_queue` |
| Upload | `CloudDeltaSyncWorker` |
| Restore | `CloudToLocalRestoreRepository` / `CloudRestoreWorker` |
| Export/import | `ExportViewModel`, `ImportViewModel`, supplier Excel |
| Documents | Local FS + metadata; Storage for some blobs |

## 14. Tests

Partial unit/instrumented under `app/src/test` and `app/src/androidTest`. Incomplete vs Agent API needs — [TEST-STRATEGY.md](./TEST-STRATEGY.md).

## 15. Verdict

Single-module Compose app; Room v44 operational store; Firebase UID-scoped mirror for **12** entity types via **upload worker + separate restore**; business rules in Android domain/UI; no Agent API yet.
