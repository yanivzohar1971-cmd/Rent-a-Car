# Database Migrations

This document describes database migrations for the Rent_a_Car Android application.

## Version 33 – Multi-tenant user_uid migration

### Goal

The application transitioned from a single-tenant model to a per-user (multi-tenant) model by introducing a `user_uid` column on all user-specific tables. This change ensures that each Firebase user has isolated data with no cross-user data leaks. The migration enables the app to support multiple users on the same device while maintaining complete data separation.

### Schema changes

Migration 32→33 adds a `user_uid TEXT` column (nullable) to the following 17 tables:

#### Core Business Entities

1. **Customer** (`Customer`)
   - Holds customer/contact information (name, phone, email, address, etc.)
   - `user_uid`: nullable, not indexed

2. **Supplier** (`Supplier`)
   - Holds supplier information (name, contact details, commission settings, import configuration)
   - `user_uid`: nullable, not indexed

3. **Branch** (`Branch`)
   - Holds branch locations for suppliers
   - `user_uid`: nullable, not indexed

4. **CarType** (`CarType`)
   - Holds car type/category definitions
   - `user_uid`: nullable, not indexed

5. **Reservation** (`Reservation`)
   - Holds rental reservation records (dates, prices, status, customer/supplier/branch references)
   - `user_uid`: nullable, not indexed

6. **Payment** (`Payment`)
   - Holds payment records linked to reservations
   - `user_uid`: nullable, not indexed

7. **CardStub** (`CardStub`)
   - Holds credit card stub information (last 4 digits, expiry, holder info) for reservations
   - `user_uid`: nullable, not indexed

8. **CommissionRule** (`CommissionRule`)
   - Holds commission percentage rules based on rental duration
   - `user_uid`: nullable, not indexed

9. **Agent** (`Agent`)
   - Holds agent/salesperson information
   - `user_uid`: nullable, not indexed

10. **Request** (`Request`)
    - Holds customer rental/purchase requests
    - `user_uid`: nullable, not indexed

11. **CarSale** (`CarSale`)
    - Holds car sale transaction records
    - `user_uid`: nullable, not indexed

#### Import/Configuration Entities

12. **SupplierTemplate** (`supplier_template`)
    - Holds Excel column mapping templates for supplier imports
    - `user_uid`: nullable, not indexed

13. **SupplierMonthlyHeader** (`supplier_monthly_header`)
    - Holds monthly import summary/header records from supplier Excel files
    - `user_uid`: nullable, not indexed

14. **SupplierMonthlyDeal** (`supplier_monthly_deal`)
    - Holds detailed deal/transaction records from supplier Excel imports
    - `user_uid`: nullable, not indexed

15. **SupplierImportRun** (`supplier_import_run`)
    - Holds import execution log records
    - `user_uid`: nullable, not indexed

16. **SupplierImportRunEntry** (`supplier_import_run_entry`)
    - Holds individual import entry log records
    - `user_uid`: nullable, not indexed

17. **SupplierPriceListHeader** (`supplier_price_list_header`)
    - Holds price list header records for supplier price imports
    - `user_uid`: nullable, not indexed

18. **SupplierPriceListItem** (`supplier_price_list_item`)
    - Holds individual price list item records
    - `user_uid`: nullable, not indexed

**Note:** All `user_uid` columns are nullable (`TEXT` without `NOT NULL` constraint) to support:
- Legacy data from pre-migration versions (which will be backfilled)
- Restored backup files that don't include `user_uid`

### Data migration behavior

#### Legacy Data Handling

Existing rows from database versions 32 and earlier do not have a `user_uid` value (the column is `NULL`). The migration itself only adds the column structure; it does not populate values.

#### UserUidBackfill

After a user logs in, `UserUidBackfill.backfillUserUidForCurrentUser()` is automatically triggered (via `NavGraph`). This utility:

1. **Runs automatically** after successful Firebase authentication
2. **Updates all NULL `user_uid` values** in all 17 tables to the current logged-in user's Firebase UID
3. **Is idempotent**: Only updates rows where `user_uid IS NULL`, so it's safe to call multiple times
4. **Handles restored backups**: When data is restored from a backup file (which may not include `user_uid`), the backfill will assign the current user's UID to all restored rows

**Backfill execution:**
- Triggered in `NavGraph.kt` via `LaunchedEffect` when `authState.isLoggedIn` becomes true
- Runs in a Room transaction for atomicity
- Processes all 17 tables in a single transaction
- Logs progress and errors for debugging

**Important:** The backfill assigns all legacy/restored data to the currently logged-in user. If multiple users share a device, each user's login will backfill any NULL rows to their own UID. This is intentional: restored backups are assumed to belong to the user performing the restore.

### Runtime behavior impact

#### DAO Query Filtering

Most DAO queries now require a `user_uid` parameter and filter results accordingly:

- **CustomerDao**: All queries filter by `user_uid` (getById, listActive, getAll, search, delete, findByTzExcluding, getCount)
- **ReservationDao**: All queries filter by `user_uid` (getById, getAll, getOpen, getByCustomer, getBySupplier, getByAgent, getByBranch, findBySupplierAndExternalNumber)
- **PaymentDao**: Queries filter by `user_uid` (getForReservation)
- **SupplierDao**: Main queries filter by `user_uid` (getAll, getById, getIdByName, upsert)
- **BranchDao**: Main queries filter by `user_uid` (getBySupplier, upsert)
- **CarTypeDao**: Queries filter by `user_uid` (getAll)
- **AgentDao**: Queries filter by `user_uid` (getAll)
- **RequestDao**: Queries filter by `user_uid` (getAll)
- **CarSaleDao**: Queries filter by `user_uid` (getAll)
- **CommissionRuleDao**: Queries filter by `user_uid` (getAll)
- **CardStubDao**: Queries filter by `user_uid` (getForReservation)

**Note:** All DAO methods now filter by `user_uid` and accept `userUid` parameters. See "Core DAO user_uid scoping (resolved)" section below for details.

#### Repository Layer

All Repositories now:

1. **Obtain `user_uid`** via `CurrentUserProvider.getCurrentUid()` or `CurrentUserProvider.requireCurrentUid()`
2. **Set `user_uid` automatically** on entities before insert/update if it's null:
   ```kotlin
   val entityWithUid = if (entity.userUid == null) entity.copy(userUid = uid) else entity
   ```
3. **Pass `user_uid` to DAOs** for all filtered queries

**Repositories updated:**
- `ReservationRepository`
- `CatalogRepository` (suppliers, branches, carTypes, agents)
- `SupplierRepository`
- `CustomerRepository`
- `RequestRepository`
- `CarSaleRepository`

#### UI/Flow Impact

All UI screens and flows that read/write user-specific data must now go through user-aware Repositories. The Repositories handle `user_uid` automatically, so ViewModels and UI code typically don't need changes, but they must ensure users are logged in before accessing data.

### Risks and caveats

#### Core DAO user_uid scoping (resolved)

All core DAOs have been updated to filter by `user_uid` and accept `userUid` parameters. The following DAOs are now fully user-scoped:

**RequestDao:**
- ✅ `delete(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**SupplierDao:**
- ✅ `delete(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ Utility methods (`updateTemplateForSupplier()`, `getSupplierNameById()`, `getImportFunctionCode()`, etc.) filter by `user_uid` where applicable

**BranchDao:**
- ✅ `getById(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getAllOnce(currentUid: String)` - Now filters by `user_uid`
- ✅ `findBySupplierAndName(supplierId: Long, name: String, currentUid: String)` - Now filters by `user_uid`
- ✅ `delete(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`

**CarTypeDao:**
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**AgentDao:**
- ✅ `delete(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**ReservationDao:**
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**PaymentDao:**
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**CommissionRuleDao:**
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**CardStubDao:**
- ✅ `getAll(currentUid: String)` - Now filters by `user_uid`
- ✅ `deleteForReservation(reservationId: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**CarSaleDao:**
- ✅ `delete(id: Long, currentUid: String)` - Now filters by `user_uid`
- ✅ `getCount(currentUid: String)` - Now filters by `user_uid`
- ✅ All other queries filter by `user_uid`

**Status:** All core DAOs now use `userUid` parameters and filter queries by `user_uid`. Repositories pass `userUid` obtained from `CurrentUserProvider` to all DAO calls.

#### Import-related DAOs (resolved)

**Import-related DAOs (SupplierTemplateDao, SupplierMonthlyHeaderDao, SupplierMonthlyDealDao, SupplierPriceListDao, ImportLogDao):**
- ✅ **RESOLVED**: All queries in these DAOs now filter by `user_uid`
- ✅ **RESOLVED**: All import services (ImportDispatcher, PriceListImportDispatcher, ExcelImportService) now pass `userUid` to DAO calls
- ✅ **RESOLVED**: All inserted import entities now have `user_uid` set before insert

#### Areas to review / potential gaps

All previously identified gaps in core DAOs and import DAOs have been resolved. The multi-tenant implementation is now complete with all user-scoped tables properly filtered by `user_uid`.

**Status:** No known remaining gaps. All DAO queries filter by `user_uid`, and all Repositories pass `userUid` obtained from `CurrentUserProvider`.

### Import pipeline user_uid scoping (resolved)

All import-related tables and DAOs are now fully scoped by `user_uid`. This includes:

- **Excel import services**: `ImportDispatcher`, `PriceListImportDispatcher`, `ExcelImportService` all obtain `userUid` via `CurrentUserProvider` and pass it to all DAO calls
- **Import log handling**: `ImportLogViewModel` and all import log DAO calls are user-scoped
- **Entity inserts**: All import entities (`SupplierImportRun`, `SupplierImportRunEntry`, `SupplierMonthlyHeader`, `SupplierMonthlyDeal`, `SupplierPriceListHeader`, `SupplierPriceListItem`, `SupplierTemplate`) have `user_uid` set before insert
- **DAO queries**: All queries in Import DAOs now include `WHERE user_uid = :currentUid` filtering

The import pipeline is now fully multi-tenant safe with no cross-user data leakage risk.

### Upgrade path

#### Expected Upgrade Flow

1. **User upgrades app** from version with DB 32 (or earlier) to version with DB 33
2. **Room migration 32→33 runs** on first app launch:
   - Adds `user_uid TEXT` column to all 17 tables
   - Existing rows have `user_uid = NULL`
   - Migration completes successfully
3. **User logs in** (or is already logged in)
4. **UserUidBackfill runs automatically**:
   - Updates all rows with `user_uid IS NULL` to the current user's Firebase UID
   - All legacy data is now associated with the logged-in user
5. **App continues normally** with user-scoped data

#### Manual Testing Scenarios

**Scenario 1: Upgrade from older version with existing data**
1. Install app version with DB 32 (or earlier)
2. Create some test data (customers, suppliers, reservations)
3. Upgrade to app version with DB 33
4. Verify migration runs without errors
5. Log in with Firebase account
6. Verify all existing data is visible (backfill should have assigned `user_uid`)
7. Create new data and verify it has `user_uid` set
8. Log out and log in with different user
9. Verify original user's data is not visible (new user should see empty/their own data)

**Scenario 2: Restore backup after migration**
1. Export backup from pre-migration version (or version without `user_uid` in backup format)
2. Upgrade to DB 33
3. Log in with Firebase account
4. Restore backup
5. Verify restored data has `user_uid = NULL` initially
6. Verify backfill runs and assigns current user's UID to restored rows
7. Verify restored data is visible and functional

**Scenario 3: Multiple users on same device**
1. Log in as User A, create some data
2. Log out
3. Log in as User B
4. Verify User B does not see User A's data
5. Create data as User B
6. Log out and log back in as User A
7. Verify User A only sees their own data (User B's data should not be visible)

**Scenario 4: Data isolation verification**
1. Log in as User A
2. Note the count of customers/reservations
3. Log out and log in as User B
4. Verify User B sees different (or empty) data
5. Create data as User B
6. Log out and log back in as User A
7. Verify User A's data count is unchanged (User B's new data should not appear)

### Migration SQL (Reference)

The migration executes the following SQL statements:

```sql
ALTER TABLE Customer ADD COLUMN user_uid TEXT;
ALTER TABLE Supplier ADD COLUMN user_uid TEXT;
ALTER TABLE Branch ADD COLUMN user_uid TEXT;
ALTER TABLE CarType ADD COLUMN user_uid TEXT;
ALTER TABLE Reservation ADD COLUMN user_uid TEXT;
ALTER TABLE Payment ADD COLUMN user_uid TEXT;
ALTER TABLE CardStub ADD COLUMN user_uid TEXT;
ALTER TABLE CommissionRule ADD COLUMN user_uid TEXT;
ALTER TABLE Agent ADD COLUMN user_uid TEXT;
ALTER TABLE Request ADD COLUMN user_uid TEXT;
ALTER TABLE CarSale ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_template ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_monthly_header ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_monthly_deal ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_import_run ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_import_run_entry ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_price_list_header ADD COLUMN user_uid TEXT;
ALTER TABLE supplier_price_list_item ADD COLUMN user_uid TEXT;
```

