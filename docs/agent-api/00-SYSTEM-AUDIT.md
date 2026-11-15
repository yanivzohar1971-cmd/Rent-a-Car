# 00 — System Audit

**Verified:** 2026-11-15 against `feature/claude-agent-api` @ `f60512d`  
**Scope:** Repository / module inventory only. No implementation changes.

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
| `firestore.indexes.json` | Composite indexes for sync queries |
| `storage.rules` | Cloud Storage rules |
| `database.rules.json` | Realtime Database rules (presence / device presence only) |
| `functions/` | Firebase Cloud Functions (Node) |

**Verified:** No product flavors. No `applicationIdSuffix`. Build types: `debug` / `release` only.

## 3. Android application module

| Item | Value |
|------|--------|
| Module | `:app` |
| `namespace` / `applicationId` | `com.rentacar.app` |
| `minSdk` | 26 |
| `targetSdk` / `compileSdk` | 35 |
| Kotlin JVM | 17 |
| Compose | Enabled (`buildFeatures.compose = true`) |
| Room schema export | `app/schemas` |
| KSP | Room compiler |

### Dependencies (high-signal)

- Jetpack Compose + Navigation Compose
- Room + WorkManager
- Firebase BOM: Auth, Firestore, Storage, Functions, Crashlytics, Analytics, App Check Play Integrity
- ML Kit Document Scanner, CameraX, Guava ListenableFuture
- Apache POI / Commons Compress (Excel / ZIP imports)
- Kotlin Serialization + Coroutines
- **No Hilt / Dagger** — manual composition root in `RentACarApp`

## 4. Kotlin package structure

Root package: `com.rentacar.app`

| Package / area | Responsibility | Key entry |
|----------------|----------------|-----------|
| `RentACarApp` | Application, DB open, cloud bootstrap, WorkManager schedule | `app/src/main/java/com/rentacar/app/RentACarApp.kt` |
| `data` | Room entities, DAOs, `AppDatabase`, TypeConverters | `data/AppDatabase.kt` |
| `data` | Room entities/DAOs + many repositories | `data/Repositories.kt`, `data/*Dao*` |
| `data.sync` | Dirty queue, restore, SyncDirtyMarker | `data/sync/*` |
| `data.auth` | Firebase auth repository | `data/auth/AuthRepository.kt` |
| `di` | Manual composition root | `di/DatabaseModule.kt` |
| `work` | WorkManager sync worker | `work/CloudDeltaSyncWorker.kt` |
| `ui` | Compose screens, ViewModels, navigation | `ui/*` |
| `ui.navigation` | `NavGraph`, `Routes` | `ui/navigation/NavGraph.kt` |
| `commission` | Commission reconciliation domain/presentation | `commission/*` |
| `emailimport` | Supplier commission report parsers | `emailimport/*` |
| `reports` | Excel/report exporters | `reports/*` |

## 5. Build variants / environments

| Variant | applicationId | Notes |
|---------|---------------|-------|
| `debug` | `com.rentacar.app` | Same ID as release; minify off; `isDebuggable true` |
| `release` | `com.rentacar.app` | Minify + shrink; ProGuard |

**Verified finding:** Debug and release **cannot coexist** on one device. No dedicated Firebase/dev project wiring was found in Gradle flavors.

Safe non-production environment: **not present** as a first-class build product. See [DEV-ENVIRONMENT-SAFETY.md](./DEV-ENVIRONMENT-SAFETY.md).

## 6. Room database

| Item | Value |
|------|--------|
| Class | `com.rentacar.app.data.AppDatabase` |
| Name | `"rentacar.db"` |
| Version | **44** |
| Entities | **34** (see entity inventory) |
| DAOs | **34** interfaces |
| Converters | `Converters` (lists/enums/JSON-ish fields) |
| Schema JSON | `app/schemas/com.rentacar.app.data.AppDatabase/44.json` |

Open path: `RentACarApp` → `Room.databaseBuilder(...).addMigrations(...).build()`.

Migrations: extensive `MIGRATION_*` chain inside `AppDatabase` companion (versions up through 44).

## 7. Repository layer (verified classes)

| Repository | Path | Notes |
|------------|------|-------|
| `ReservationRepository` | `repository/ReservationRepository.kt` | Core rental CRUD + holds |
| `CustomerRepository` | `repository/CustomerRepository.kt` | Customers |
| `SupplierRepository` | `repository/SupplierRepository.kt` | Suppliers |
| `SupplierBranchRepository` | `repository/SupplierBranchRepository.kt` | Branches |
| `SupplierDocumentRepository` | `repository/SupplierDocumentRepository.kt` | Docs + cloud upload hooks |
| `SupplierCustomerTermsRepository` | `repository/SupplierCustomerTermsRepository.kt` | Terms (local + cloud sync path) |
| `CarTypeRepository` | `repository/CarTypeRepository.kt` | Catalog |
| `AgentRepository` | `repository/AgentRepository.kt` | Agents |
| `AgencyRepository` | `repository/AgencyRepository.kt` | Agencies |
| `CompanyRepository` | `repository/CompanyRepository.kt` | Companies |
| `RequestRepository` | `repository/RequestRepository.kt` | Sales requests |
| `SaleRepository` | `repository/SaleRepository.kt` | Vehicle sales |
| `CommissionPaymentRepository` | `repository/CommissionPaymentRepository.kt` | Payments |
| `CommissionHoldRepository` | `repository/CommissionHoldRepository.kt` | Commission holds |
| `CloudAuthRepository` | `data/cloud/CloudAuthRepository.kt` | Firebase Auth |
| `CloudSyncRepository` | `data/cloud/CloudSyncRepository.kt` | Legacy/full sync helpers |
| `CloudDeltaSync` / worker path | `data/cloud/CloudDeltaSyncWorker.kt` | Delta upload/download |
| `CloudToLocalRestoreRepository` | `data/cloud/CloudToLocalRestoreRepository.kt` | Cloud → Room restore |
| `BackupRepository` | `repository/BackupRepository.kt` | Local ZIP backup/restore |
| `CloudBackupRepository` | `data/cloud/CloudBackupRepository.kt` | Cloud backup metadata |
| Yard / vehicle sale repos | under `repository/` + `ui/yardSale/` | Local sales yard |

## 8. ViewModels / UI modules (high-level)

Compose navigation is centralized in `NavGraph.kt` with `Routes` object. Major screen groups:

- Auth / Setup / Cloud bind
- Dashboard / Admin
- Reservations (list, editor, calendar, import)
- Customers
- Suppliers (list, editor, branches, documents, customer terms)
- Sales / Requests / Closed deals
- Commissions (dashboard, statement, payments, holds, reports)
- Yard sale / Vehicles
- Settings / Backup / Cloud sync UI
- Reports / Exports

Full operation trace: [02-OPERATION-INVENTORY.md](./02-OPERATION-INVENTORY.md).

## 9. Domain services

| Area | Classes | Role |
|------|---------|------|
| Commission engine | `domain/commission/CommissionCalculator.kt`, `CommissionStatusResolver.kt`, related | Status + outstanding calc |
| Sales domain | `domain/sales/*` | Sale pricing / commission inputs |
| Hold matching | Used from commission UI / repos | Match payments to periods |

**Verified:** Significant financial logic lives in domain + ViewModels (not Cloud Functions). Agent API must reuse these — not reimplement in MCP.

## 10. Background workers

| Worker | Path | Role |
|--------|------|------|
| `CloudDeltaSyncWorker` | `data/cloud/CloudDeltaSyncWorker.kt` | Bidirectional delta sync |
| `CloudPresenceHeartbeatWorker` | `data/cloud/*` / workers | RTDB presence |
| Other WorkManager jobs | `workers/*` | Reminders / maintenance (inspect per file) |

Scheduling: `RentACarApp` registers periodic / one-time work when cloud is bound.

## 11. Authentication / authorization (summary)

- **Auth:** Firebase Authentication via `CloudAuthRepository` (email/password and related flows in UI).
- **Tenant boundary:** Firestore paths under `users/{uid}/...` — UID isolation in `firestore.rules`.
- **Roles:** No rich RBAC layer found in Room; authorization is primarily “signed-in Firebase user owns data”.
- **App Check:** Play Integrity configured in Gradle dependencies.

Details: [05-SECURITY-AUDIT.md](./05-SECURITY-AUDIT.md).

## 12. Cloud-related modules

| Component | Evidence |
|-----------|----------|
| Provider | **Firebase** (Auth, Firestore, Storage, Functions, RTDB presence, Crashlytics, Analytics, App Check) |
| Sync path | `users/{uid}/{collection}` |
| Functions | `functions/src/index.ts` (and compiled `lib/`) — **not** full rental business command API |
| Rules | `firestore.rules`, `storage.rules`, `database.rules.json` |

**Verified:** Backend is Firebase, not a custom REST monolith. Do not assume Cloud Functions validate reservation/commission writes today.

## 13. Sync / backup / import-export

| Capability | Location |
|------------|----------|
| Dirty marking | `SyncDirtyMarker`, `sync_queue` entity/DAO |
| Delta sync | `CloudDeltaSyncWorker` |
| Restore cloud→local | `CloudToLocalRestoreRepository` |
| Local backup ZIP | `BackupRepository` |
| Excel / supplier imports | `util` + reservation/supplier import screens |
| Document scan / storage | Supplier documents + Firebase Storage |

## 14. Existing API clients

No OpenAPI/Retrofit business API for core rental CRUD was found. Network access is Firebase SDK–centric (Firestore/Storage/Functions/Auth).

## 15. Tests

| Area | Finding |
|------|---------|
| Unit tests | Present under `app/src/test/` (domain/util coverage partial) |
| Instrumented | Present under `app/src/androidTest/` (not full business surface) |
| Sync/financial E2E | Incomplete relative to Agent API needs |

See [TEST-STRATEGY.md](./TEST-STRATEGY.md).

## 16. Important configuration files (no secrets)

| File | Purpose |
|------|---------|
| `app/build.gradle` | SDKs, deps, build types |
| `app/src/main/AndroidManifest.xml` | Components, permissions |
| `app/google-services.json` | Firebase project (never paste secrets) |
| `firestore.rules` | Authorization for cloud docs |
| `firestore.indexes.json` | Query indexes |
| `functions/package.json` | Functions runtime |
| `app/proguard-rules.pro` | Release shrinking |

## 17. Architecture inventory verdict

Rent a Car is a **single-module Compose Android app** with:

1. **Room 44** as primary operational store  
2. **Firebase UID-scoped Firestore** as cloud mirror for a **subset** of entities  
3. **WorkManager delta sync** with dirty-queue upload + cloud watermark download  
4. **Manual DI** in `RentACarApp`  
5. Business rules concentrated in **repositories + domain + ViewModels**  
6. **No** separate Agent API, MCP server, or capability registry yet

This inventory is the factual baseline for all subsequent Agent API design docs.
