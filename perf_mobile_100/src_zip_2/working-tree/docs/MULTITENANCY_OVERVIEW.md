# Multi-Tenancy / Per-User Data Model

## Overview

The Rent_a_Car application implements a **per-user data isolation model** (multi-tenancy) where each Firebase user has completely isolated data. This ensures that:

- **No cross-user data leaks**: Users cannot see or access data belonging to other users
- **Multiple users per device**: The app supports multiple users on the same device with complete data separation
- **Firebase Auth integration**: User identity is managed via Firebase Authentication, and the Firebase UID is used as the data scoping key

This design was introduced in database version 33 (migration 32→33) and affects all user-specific business data in the application.

## Core concepts

### user_uid Column

All user-specific tables include a `user_uid TEXT` column (nullable) that stores the Firebase UID of the user who owns the data row. This column is used to:

- **Filter queries**: All DAO queries on user-specific data filter by `user_uid` to ensure users only see their own data
- **Scope inserts/updates**: New rows are automatically assigned the current user's UID
- **Backfill legacy data**: Existing rows from pre-migration versions are backfilled with the current user's UID after login

**Tables with `user_uid`:**
- Core entities: Customer, Supplier, Branch, CarType, Reservation, Payment, CardStub, CommissionRule, Agent, Request, CarSale
- Import entities: SupplierTemplate, SupplierMonthlyHeader, SupplierMonthlyDeal, SupplierImportRun, SupplierImportRunEntry, SupplierPriceListHeader, SupplierPriceListItem

### CurrentUserProvider

`CurrentUserProvider` is a singleton object that serves as the **single source of truth** for the current Firebase user UID. It provides:

- `getCurrentUid(): String?` - Returns the current Firebase user UID, or `null` if not logged in
- `requireCurrentUid(): String` - Returns the current UID or throws `IllegalStateException` if not logged in

**Location:** `com.rentacar.app.data.auth.CurrentUserProvider`

**Implementation:** Wraps `AuthProvider.auth.currentUser?.uid` from Firebase Auth

**Usage:** All Repositories use `CurrentUserProvider` to obtain the UID before querying or writing data.

### UserUidBackfill

`UserUidBackfill` is a utility class that handles **backfilling `user_uid` for legacy and restored data**. It:

- Runs automatically after successful Firebase login (triggered in `NavGraph`)
- Updates all rows where `user_uid IS NULL` to the current user's Firebase UID
- Is **idempotent**: Safe to call multiple times; only updates NULL rows
- Processes all 17 user-specific tables in a single transaction

**Location:** `com.rentacar.app.data.UserUidBackfill`

**Trigger:** Automatic via `LaunchedEffect` in `NavGraph.kt` when `authState.isLoggedIn` becomes true

**Use cases:**
- Upgrading from pre-migration database versions (legacy data)
- Restoring backup files that don't include `user_uid`
- Re-assigning orphaned data after user changes

## Data flow

The data flow for multi-tenant operations follows this pattern:

```
Firebase Auth (currentUser.uid)
    ↓
CurrentUserProvider.getCurrentUid()
    ↓
Repository (obtains UID, sets on entity if null)
    ↓
DAO (receives UID parameter, filters queries by user_uid)
    ↓
Room Database (stores row with user_uid column)
```

### Example: Creating a Customer

1. **UI/ViewModel** calls `customerRepository.upsert(customer)`
2. **Repository** (`CustomerRepository`):
   - Calls `CurrentUserProvider.requireCurrentUid()` to get current UID
   - If `customer.userUid` is null, creates `customer.copy(userUid = uid)`
   - Calls `customerDao.upsert(customerWithUid)`
3. **DAO** (`CustomerDao`):
   - Inserts/updates the customer row with `user_uid` set
4. **Database**: Row is stored with `user_uid` populated

### Example: Querying Reservations

1. **UI/ViewModel** calls `reservationRepository.getAllReservations()`
2. **Repository** (`ReservationRepository`):
   - Calls `CurrentUserProvider.getCurrentUid()` (returns null if not logged in)
   - If UID is null, returns empty Flow
   - Otherwise, calls `reservationDao.getAll(uid)`
3. **DAO** (`ReservationDao`):
   - Executes `SELECT * FROM Reservation WHERE user_uid = :currentUid ORDER BY dateFrom DESC`
4. **Database**: Returns only rows where `user_uid` matches the current user

## Affected areas

The following functional areas are user-scoped (filtered by `user_uid`):

### Core Business Data
- **Customers**: Contact information, identification, addresses
- **Suppliers**: Supplier details, commission settings, import configuration
- **Branches**: Branch locations linked to suppliers
- **Reservations**: Rental reservations with dates, prices, status
- **Payments**: Payment records linked to reservations
- **Card Stubs**: Credit card information (last 4 digits, expiry) for reservations
- **Agents**: Salesperson/agent information
- **Car Types**: Car category/type definitions
- **Commission Rules**: Commission percentage rules based on rental duration
- **Requests**: Customer rental/purchase requests
- **Car Sales**: Car sale transaction records

### Import/Configuration Data
- **Supplier Templates**: Excel column mapping templates for imports (fully user-scoped)
- **Monthly Import Headers**: Summary records from supplier monthly Excel imports (fully user-scoped)
- **Monthly Import Deals**: Detailed transaction records from monthly imports (fully user-scoped)
- **Import Run Logs**: Execution logs for import operations (fully user-scoped)
- **Import Run Entries**: Individual entry logs for imports (fully user-scoped)
- **Price List Headers**: Price list header records for supplier price imports (fully user-scoped)
- **Price List Items**: Individual price list item records (fully user-scoped)

**Note:** All import flows (Excel imports, price list imports, import logs) are now fully user-scoped. Import services (`ImportDispatcher`, `PriceListImportDispatcher`, `ExcelImportService`) obtain `userUid` via `CurrentUserProvider` and pass it to all DAO calls. All imported entities have `user_uid` set before insert.

## Developer guidelines

### When working with user-scoped data

#### ✅ DO:

1. **Always obtain `user_uid` via `CurrentUserProvider`** in Repositories:
   ```kotlin
   private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
   ```

2. **Set `user_uid` automatically on entities** before insert/update if it's null:
   ```kotlin
   val entityWithUid = if (entity.userUid == null) entity.copy(userUid = uid) else entity
   ```

3. **Pass `user_uid` to DAO queries** that filter by it:
   ```kotlin
   fun getAll(): Flow<List<Entity>> {
       val uid = CurrentUserProvider.getCurrentUid() ?: return flowOf(emptyList())
       return dao.getAll(uid)
   }
   ```

4. **Add `user_uid` to new user-specific tables** and include it in migrations:
   ```kotlin
   @Entity
   data class NewEntity(
       // ... other fields ...
       @ColumnInfo(name = "user_uid") val userUid: String? = null
   )
   ```

5. **Update migration** to add `user_uid` column:
   ```kotlin
   database.execSQL("ALTER TABLE NewEntity ADD COLUMN user_uid TEXT")
   ```

6. **Add table to `UserUidBackfill.USER_SPECIFIC_TABLES`** list if it needs backfill support

7. **Filter all DAO queries** on user-specific tables by `user_uid`:
   ```kotlin
   @Query("SELECT * FROM Entity WHERE user_uid = :currentUid ORDER BY name")
   fun getAll(currentUid: String): Flow<List<Entity>>
   ```

#### ❌ DON'T:

1. **Don't hardcode or assume user UID** - always use `CurrentUserProvider`
2. **Don't skip `user_uid` filtering** in DAO queries on user-specific tables
3. **Don't insert rows without setting `user_uid`** - let Repositories handle it automatically
4. **Don't use raw SQL queries** without including `user_uid` in WHERE clauses
5. **Don't create new user-specific tables** without `user_uid` column
6. **Don't forget to update `UserUidBackfill`** when adding new user-scoped tables

### Common pitfalls

#### 1. Forgetting to filter by `user_uid`

**Problem:**
```kotlin
@Query("SELECT * FROM Customer ORDER BY lastName")
fun getAll(): Flow<List<Customer>>  // ❌ Missing user_uid filter
```

**Solution:**
```kotlin
@Query("SELECT * FROM Customer WHERE user_uid = :currentUid ORDER BY lastName")
fun getAll(currentUid: String): Flow<List<Customer>>  // ✅ Filters by user_uid
```

**Impact:** Users could see data belonging to other users (security/data leak issue).

#### 2. Inserting rows without setting `user_uid`

**Problem:**
```kotlin
suspend fun insert(customer: Customer): Long {
    return dao.upsert(customer)  // ❌ customer.userUid might be null
}
```

**Solution:**
```kotlin
suspend fun insert(customer: Customer): Long {
    val uid = getCurrentUid()
    val customerWithUid = if (customer.userUid == null) customer.copy(userUid = uid) else customer
    return dao.upsert(customerWithUid)  // ✅ Always has user_uid set
}
```

**Impact:** Rows with `user_uid = NULL` won't be visible to any user after backfill runs, or will be assigned to the next user who logs in.

#### 3. Using raw SQL without including `user_uid` in WHERE/INDEX

**Problem:**
```kotlin
@Query("SELECT COUNT(*) FROM Customer WHERE active = 1")
suspend fun getActiveCount(): Int  // ❌ Missing user_uid filter
```

**Solution:**
```kotlin
@Query("SELECT COUNT(*) FROM Customer WHERE active = 1 AND user_uid = :currentUid")
suspend fun getActiveCount(currentUid: String): Int  // ✅ Filters by user_uid
```

**Impact:** Count includes data from all users, not just the current user.

#### 4. Not handling null UID gracefully

**Problem:**
```kotlin
fun getAll(): Flow<List<Entity>> {
    val uid = CurrentUserProvider.getCurrentUid()  // Could be null
    return dao.getAll(uid)  // ❌ May crash or return wrong data
}
```

**Solution:**
```kotlin
fun getAll(): Flow<List<Entity>> {
    val uid = CurrentUserProvider.getCurrentUid() ?: return flowOf(emptyList())
    return dao.getAll(uid)  // ✅ Returns empty list if not logged in
}
```

**Impact:** App may crash when user is not logged in, or may show data from a previous session.

#### 5. Forgetting to add new table to backfill

**Problem:**
- New table `NewEntity` has `user_uid` column
- Migration adds the column
- But `UserUidBackfill.USER_SPECIFIC_TABLES` doesn't include it

**Solution:**
```kotlin
private val USER_SPECIFIC_TABLES = listOf(
    // ... existing tables ...
    "NewEntity"  // ✅ Add new table here
)
```

**Impact:** Legacy/restored data in the new table won't be backfilled, so rows will have `user_uid = NULL` and won't be visible to users.

### Testing multi-tenant behavior

When testing features that involve user-scoped data:

1. **Test with multiple users**: Log in as User A, create data, log out, log in as User B, verify User B doesn't see User A's data
2. **Test with null UID**: Verify app handles logged-out state gracefully (shows empty data or login screen)
3. **Test backfill**: Restore a backup from pre-migration version, log in, verify all data is visible and has `user_uid` set
4. **Test data isolation**: Create data as User A, verify User B cannot access it via any query

## Architecture notes

### Why nullable `user_uid`?

The `user_uid` column is nullable (`TEXT` without `NOT NULL`) to support:

1. **Legacy data**: Rows from pre-migration versions have `user_uid = NULL` until backfill runs
2. **Restored backups**: Backup files may not include `user_uid`, so restored rows start as NULL
3. **Migration safety**: Adding a NOT NULL column to existing tables would require providing a default value, which is complex when the value depends on the logged-in user

### Why backfill after login?

The backfill runs after login (not during migration) because:

1. **User context required**: We need the Firebase UID to assign to rows, which is only available after authentication
2. **Idempotent operation**: Backfill only updates NULL rows, so it's safe to run multiple times
3. **Handles restore scenarios**: When backups are restored, backfill ensures all restored data is assigned to the current user

### Why not use Firebase Firestore rules?

This application uses **local Room database** for primary data storage, with optional sync to Firestore. The multi-tenant model is implemented at the **database layer** (Room) rather than relying solely on Firestore security rules. This ensures:

- **Offline support**: Data isolation works even when offline
- **Performance**: No network calls needed for data filtering
- **Consistency**: Same isolation model for local and synced data

## Related documentation

- [Database Migrations](MIGRATIONS.md) - Detailed migration 32→33 documentation
- [Data Schema](DATA_SCHEMA.md) - Complete database schema reference

