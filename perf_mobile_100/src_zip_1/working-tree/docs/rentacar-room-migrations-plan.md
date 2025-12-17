# Rent_a_Car Room Migration Plan (Design Only)

## Overview

Rent_a_Car is a car rental management Android application that uses Room for local data persistence. The database stores critical business data including customer records, supplier information, rental reservations, payments, commissions, and related operational data. The application currently uses manual Room migrations, with some early migrations (18->20) implementing a comprehensive backup/rollback pattern similar to HealthExpert, while later migrations (20->32) use simpler, direct SQL changes.

**Why we need a safe, non-destructive migration system:**
- **Business-critical data:** Loss of customer records, reservations, or payment history would severely impact business operations
- **User trust:** Data loss in production would damage user confidence
- **Regulatory compliance:** Financial and contract data may need to be preserved for legal/accounting purposes
- **Recovery complexity:** Restoring lost data from backups or manual re-entry is time-consuming and error-prone

This document outlines a design plan to establish a consistent, safety-first migration architecture for Rent_a_Car, inspired by HealthExpert's proven approach, while respecting Rent_a_Car's existing migration history and schema.

---

## Current Database Overview

### Database Configuration

- **Database Class:** `AppDatabase`
- **File Path:** `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
- **Current Version:** `32`
- **Schema Export:** `exportSchema = true` (schema files are exported, unlike HealthExpert)
- **Database Name:** `rentacar.db`
- **Instantiation:** Database is created via `DatabaseModule.provideDatabase(context)` in `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`

### Entities / Tables

The database contains **16 entities** organized into business-critical and auxiliary categories:

| Entity / Table | Purpose | Criticality | Notes |
|----------------|---------|------------|-------|
| **Customer** | Customer records (name, phone, TZ ID, address, email) | **High** | Core business entity |
| **Supplier** | Rental car suppliers (name, contact info, commission rules, import settings) | **High** | Core business entity |
| **Branch** | Supplier branch locations | **High** | Required for reservations |
| **CarType** | Vehicle categories (sedan, compact, etc.) | **High** | Required for reservations |
| **Agent** | Sales agents/employees | **High** | Required for commissions |
| **Reservation** | Rental reservations (dates, customer, supplier, pricing) | **High** | Core business entity |
| **Payment** | Payment records linked to reservations | **High** | Financial data |
| **CardStub** | Credit card authorization stubs | **High** | Financial/security data |
| **CommissionRule** | Commission calculation rules | **High** | Financial data |
| **Request** | Customer requests/quotes | **Medium** | Business data, can be regenerated |
| **CarSale** | Vehicle sales records | **Medium** | Business data |
| **SupplierTemplate** | Excel import templates for supplier monthly reports | **Medium** | Configuration data |
| **SupplierMonthlyHeader** | Monthly supplier report headers | **Medium** | Imported data, can be re-imported |
| **SupplierMonthlyDeal** | Individual deals in monthly reports | **Medium** | Imported data, can be re-imported |
| **SupplierImportRun** | Import execution logs | **Low** | Audit/logging data |
| **SupplierImportRunEntry** | Individual import row logs | **Low** | Audit/logging data |
| **SupplierPriceListHeader** | Price list headers (year/month) | **Medium** | Configuration data, can be re-imported |
| **SupplierPriceListItem** | Individual price list items | **Medium** | Configuration data, can be re-imported |
| **SyncQueueEntity** | Delta sync queue for Firebase | **Low** | Can be regenerated |

**Criticality Guidelines:**
- **High:** Data loss would cause business disruption or legal issues
- **Medium:** Data loss is inconvenient but can be recovered or regenerated
- **Low:** Data loss is acceptable (logs, caches, temporary data)

---

## Existing Migration Strategy

### Migration History

Rent_a_Car currently has **14 migrations** from version 18 to 32:

| From→To | Migration Object | Type | Safety Pattern |
|---------|-----------------|------|----------------|
| 18→19 | `MIGRATION_18_19` | ALTER TABLE (add column) | ✅ Comprehensive backup/rollback |
| 19→20 | `MIGRATION_19_20` | ALTER TABLE (add column) | ✅ Comprehensive backup/rollback |
| 20→21 | `MIGRATION_20_21` | DROP INDEX, CREATE INDEX | ⚠️ Simple logging only |
| 21→22 | `MIGRATION_21_22` | CREATE TABLE (3 new tables) | ⚠️ Simple logging only |
| 22→23 | `MIGRATION_22_23` | ALTER TABLE (add column) | ⚠️ Simple logging only |
| 23→24 | `MIGRATION_23_24` | ALTER TABLE (add column) | ⚠️ Simple logging only |
| 24→25 | `MIGRATION_24_25` | CREATE TABLE (2 new tables) | ⚠️ Simple logging only |
| 25→26 | `MIGRATION_25_26` | ALTER TABLE (add column) | ⚠️ Simple logging only |
| 26→27 | `MIGRATION_26_27` | ALTER TABLE (add column) | ⚠️ Simple logging only |
| 27→28 | `MIGRATION_27_28` | No-op (placeholder) | ⚠️ Simple logging only |
| 28→29 | `MIGRATION_28_29` | UPDATE (data fix) | ⚠️ Simple logging only |
| 29→30 | `MIGRATION_29_30` | CREATE TABLE (2 new tables) | ⚠️ Simple logging only |
| 30→31 | `MIGRATION_30_31` | ALTER TABLE (add column) | ⚠️ Simple logging only |
| 31→32 | `MIGRATION_31_32` | CREATE TABLE (sync_queue) | ⚠️ Simple logging only |

### Current Migration Patterns

#### Pattern 1: Comprehensive Backup/Rollback (Migrations 18→19, 19→20)

These migrations follow a safety-first approach similar to HealthExpert:

**Before Migration:**
1. Create backup tables for ALL critical tables: `CREATE TABLE X_backup AS SELECT * FROM X`
2. Create emergency JSON backup file in `Downloads/MyApp/Backups/`
3. Log backup creation

**During Migration:**
- Execute schema change (ALTER TABLE ADD COLUMN)

**After Success:**
- Drop all backup tables

**On Failure:**
- Attempt rollback: `DROP TABLE IF EXISTS X` then `ALTER TABLE X_backup RENAME TO X`
- If rollback fails, throw original exception

**Example (MIGRATION_19_20):**
```kotlin
// Backup ALL tables
database.execSQL("CREATE TABLE Customer_backup AS SELECT * FROM Customer")
database.execSQL("CREATE TABLE Reservation_backup AS SELECT * FROM Reservation")
// ... (all other tables)

// Create emergency JSON backup
val backupFile = File(backupDir, "emergency_migration_backup_$timestamp.json")
backupFile.writeText("Emergency backup created before migration to version 20 - ${Date()}")

// Perform migration
database.execSQL("ALTER TABLE Request ADD COLUMN isQuote INTEGER NOT NULL DEFAULT 0")
database.execSQL("ALTER TABLE Reservation ADD COLUMN isQuote INTEGER NOT NULL DEFAULT 0")

// On success: drop backups
database.execSQL("DROP TABLE Customer_backup")
// ...

// On failure: rollback
try {
    database.execSQL("DROP TABLE IF EXISTS Customer")
    database.execSQL("ALTER TABLE Customer_backup RENAME TO Customer")
    // ... (restore all tables)
} catch (restoreException: Exception) {
    throw e // Original migration exception
}
```

#### Pattern 2: Simple Migrations (Migrations 20→32)

Later migrations use a simpler pattern:
- Direct SQL execution (ALTER TABLE, CREATE TABLE, UPDATE)
- Basic try/catch with logging
- No backup tables
- No rollback mechanism

**Example (MIGRATION_30_31):**
```kotlin
try {
    android.util.Log.i("Migration", "Starting migration from 30 to 31 - Adding price_list_import_function_code")
    database.execSQL("ALTER TABLE Supplier ADD COLUMN price_list_import_function_code INTEGER")
    android.util.Log.i("Migration", "Migration 30->31 completed successfully")
} catch (e: Exception) {
    android.util.Log.e("Migration", "Migration 30->31 failed", e)
    throw e
}
```

### Current Safety Mechanisms

**Strengths:**
- ✅ Early migrations (18→20) use comprehensive backup/rollback
- ✅ All migrations have logging (start, success, failure)
- ✅ Try/catch blocks prevent silent failures

**Gaps:**
- ⚠️ **No `fallbackToDestructiveMigration()`:** If a migration fails and there's no rollback, Room will throw an exception and the app won't start. This is actually safer than destructive migration, but means failed migrations require manual intervention.
- ⚠️ **Inconsistent safety levels:** Migrations 20→32 don't use backup tables, even for critical data changes (e.g., MIGRATION_28_29 performs UPDATE on Reservation data without backup)
- ⚠️ **No JSON backup for later migrations:** Only migrations 18→20 create external JSON backups
- ⚠️ **Data modification without backup:** MIGRATION_28_29 updates existing Reservation data (fixing scientific notation) without creating backup tables

### Risk Profile

**High-Risk Areas:**
1. **MIGRATION_28_29:** Updates existing Reservation data (externalContractNumber, supplierOrderNumber) and supplier_monthly_deal.contract_number without backup. If this migration fails mid-execution, data could be corrupted.
2. **MIGRATION_20_21:** Drops and recreates an index. While indexes don't contain data, if this fails, the database might be in an inconsistent state.
3. **Future migrations on critical tables:** Any migration that modifies Customer, Reservation, Payment, or Supplier data without backup is risky.

**Medium-Risk Areas:**
1. **CREATE TABLE migrations:** Generally safe, but if they fail after creating some tables but not others, foreign key constraints might be violated.
2. **ALTER TABLE ADD COLUMN:** Generally safe (SQLite supports this), but if the migration fails, the schema might be partially updated.

**Low-Risk Areas:**
1. **CREATE TABLE for logging/audit tables:** Low risk (can be recreated)
2. **ALTER TABLE for non-critical columns:** Low risk (additive changes)

---

## Lessons from HealthExpert

Based on `docs/healthExpert-room-migrations.md`, HealthExpert's migration system demonstrates several key principles:

### 1. Comprehensive Backup Pattern for Critical Migrations

HealthExpert uses a **two-layer backup strategy** for high-risk migrations (versions 25-31):
- **In-database backup tables:** `CREATE TABLE X_backup AS SELECT * FROM X` for all critical tables
- **External JSON backup:** Emergency backup files in `Downloads/HealthExpert/Backups/` for external recovery

This ensures that even if the in-database rollback fails, data can be recovered from the JSON backup.

### 2. Automatic Rollback on Failure

Every migration with backup tables includes a rollback mechanism:
- On exception, attempt to restore all tables from backup
- If rollback succeeds, log success and rethrow original exception (prevents partial state)
- If rollback fails, log error and rethrow (triggers fallback mechanism)

### 3. Logging and Error Detection

HealthExpert uses comprehensive logging:
- `Log.i("Migration", "Starting migration X->Y")`
- `Log.i("Migration", "Emergency backup created before migration X->Y")`
- `Log.i("Migration", "Migration X->Y completed successfully")`
- `Log.e("Migration", "Migration X->Y failed, attempting rollback", e)`
- `Log.e("Migration", "Rollback X->Y failed", restoreException)`

This enables debugging and monitoring of migration health in production.

### 4. Fallback Strategy

HealthExpert uses `fallbackToDestructiveMigration()` as a **last resort**:
- Only triggers if migration AND rollback both fail
- Acceptable because backups are created before migration
- Provides a safety net for edge cases

### 5. Evolution to Simpler Migrations

HealthExpert evolved from comprehensive backups (25-31) to simpler migrations (32-46):
- Later migrations are mostly ALTER TABLE ADD COLUMN or CREATE TABLE
- These are inherently safer (additive changes)
- Still use try/catch and logging, but skip backup tables

**Key Takeaway:** The backup pattern is reserved for **high-risk migrations** (dropping tables, modifying existing data, complex schema changes), while simpler additive changes use a lighter safety approach.

See `docs/healthExpert-room-migrations.md` for detailed examples and implementation patterns.

---

## Proposed Architecture for Safe Migrations in Rent_a_Car

### Core Principles

1. **Risk-Based Safety Levels:** Different migration types require different safety mechanisms
2. **Consistent Patterns:** All migrations follow the same safety pattern for their risk level
3. **Reusable Infrastructure:** Common backup/rollback logic is extracted into helper components
4. **Backward Compatibility:** Existing migrations remain unchanged to avoid breaking deployed apps
5. **Developer-Friendly:** Clear guidelines and helpers make it easy to write safe migrations

### Component: MigrationSafetyManager

A new helper component (to be implemented) that provides reusable safety mechanisms:

**Responsibilities:**
1. **Backup Creation:**
   - Create backup tables for specified critical tables
   - Create emergency JSON backup file in `Downloads/RentACar/Backups/`
   - Log backup creation with timestamps

2. **Rollback Execution:**
   - Restore tables from backup tables on failure
   - Handle partial failures gracefully
   - Log rollback success/failure

3. **Logging:**
   - Standardized log messages for all migration events
   - Consistent log tags: `"Migration"` for all migration-related logs
   - Include version numbers, table names, and error details

**Proposed API (design only):**
```kotlin
// Conceptual API - not implemented yet
class MigrationSafetyManager(
    private val database: SupportSQLiteDatabase,
    private val context: Context
) {
    /**
     * Creates backup tables for specified critical tables.
     * @param tableNames List of table names to backup
     * @return BackupResult indicating success/failure
     */
    suspend fun createBackupTables(tableNames: List<String>): BackupResult
    
    /**
     * Creates emergency JSON backup file for critical tables.
     * @param tableNames List of table names to export
     * @return Path to backup file, or null if failed
     */
    suspend fun createEmergencyJsonBackup(tableNames: List<String>): String?
    
    /**
     * Attempts to restore tables from backup tables.
     * @param tableNames List of table names to restore
     * @return RestoreResult indicating success/failure
     */
    suspend fun rollbackFromBackupTables(tableNames: List<String>): RestoreResult
    
    /**
     * Drops backup tables after successful migration.
     * @param tableNames List of backup table names to drop
     */
    fun dropBackupTables(tableNames: List<String>)
}
```

### Migration Risk Categories

#### High-Risk Migrations

**Definition:** Migrations that could cause data loss or corruption if they fail.

**Examples:**
- Dropping tables or columns
- Modifying existing data (UPDATE statements)
- Changing primary keys or foreign keys
- Complex schema rewrites (CREATE TABLE AS SELECT with transformations)
- Removing unique constraints that might cause data conflicts

**Required Safety Level:**
- ✅ Backup tables for all affected critical tables
- ✅ Emergency JSON backup file
- ✅ Comprehensive logging (start, backup, migration, success/failure, rollback)
- ✅ Automatic rollback on failure
- ✅ Re-throw exception after rollback (prevents partial state)

**Example Pattern (conceptual):**
```kotlin
val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        val safetyManager = MigrationSafetyManager(database, context)
        val criticalTables = listOf("Customer", "Reservation", "Payment", "Supplier")
        
        try {
            // 1. Create backups
            safetyManager.createBackupTables(criticalTables)
            safetyManager.createEmergencyJsonBackup(criticalTables)
            
            // 2. Perform migration
            database.execSQL("UPDATE Reservation SET ...")
            
            // 3. Drop backups on success
            safetyManager.dropBackupTables(criticalTables.map { "${it}_backup" })
            
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            // 4. Rollback on failure
            android.util.Log.e("Migration", "Migration X->Y failed, attempting rollback", e)
            try {
                safetyManager.rollbackFromBackupTables(criticalTables)
                android.util.Log.i("Migration", "Rollback X->Y completed successfully")
            } catch (restoreException: Exception) {
                android.util.Log.e("Migration", "Rollback X->Y failed", restoreException)
            }
            throw e
        }
    }
}
```

#### Medium-Risk Migrations

**Definition:** Migrations that are generally safe but could cause issues if they fail partway through.

**Examples:**
- Creating new tables with foreign keys (if creation fails partway, FK constraints might be violated)
- Adding columns with complex default values
- Creating multiple related tables in one migration

**Required Safety Level:**
- ✅ Comprehensive logging (start, migration steps, success/failure)
- ✅ Try/catch with clear error messages
- ⚠️ Backup tables optional (only if modifying existing critical data)
- ⚠️ JSON backup optional

**Example Pattern (conceptual):**
```kotlin
val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        try {
            android.util.Log.i("Migration", "Starting migration X->Y")
            
            // Create first table
            database.execSQL("CREATE TABLE IF NOT EXISTS NewTable1 (...)")
            android.util.Log.d("Migration", "Created NewTable1")
            
            // Create second table
            database.execSQL("CREATE TABLE IF NOT EXISTS NewTable2 (...)")
            android.util.Log.d("Migration", "Created NewTable2")
            
            // Create indices
            database.execSQL("CREATE INDEX IF NOT EXISTS ...")
            
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration X->Y failed", e)
            throw e
        }
    }
}
```

#### Low-Risk Migrations

**Definition:** Migrations that are inherently safe and unlikely to cause data loss.

**Examples:**
- Adding a nullable column with no default value
- Adding a column with a simple default value (INTEGER DEFAULT 0, TEXT DEFAULT '')
- Creating a new table with no foreign keys
- Creating indices

**Required Safety Level:**
- ✅ Basic logging (start, success/failure)
- ✅ Try/catch
- ❌ No backup tables needed
- ❌ No JSON backup needed

**Example Pattern (conceptual):**
```kotlin
val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        try {
            android.util.Log.i("Migration", "Starting migration X->Y")
            database.execSQL("ALTER TABLE TableName ADD COLUMN newColumn INTEGER DEFAULT 0")
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration X->Y failed", e)
            throw e
        }
    }
}
```

### Fallback Strategy

**Proposed Approach:**
- **Do NOT use `fallbackToDestructiveMigration()` in production builds**
- **Use `fallbackToDestructiveMigration()` only in debug builds** (for development/testing)
- **In production:** If migration fails and rollback fails, throw exception (app won't start, but data is preserved)
- **Recovery:** Manual intervention required (restore from JSON backup, fix migration, redeploy)

**Rationale:**
- Destructive migration in production would cause data loss
- Better to fail fast and require manual recovery than silently lose data
- JSON backups provide recovery path

**Implementation (conceptual):**
```kotlin
Room.databaseBuilder(...)
    .addMigrations(...)
    .apply {
        if (BuildConfig.DEBUG) {
            fallbackToDestructiveMigration() // Only in debug builds
        }
        // Production: no fallback, fail fast
    }
    .build()
```

### Critical Tables List

Based on the entity criticality analysis, the following tables should always be backed up in high-risk migrations:

**Always Backup (High Criticality):**
- Customer
- Supplier
- Branch
- CarType
- Agent
- Reservation
- Payment
- CardStub
- CommissionRule

**Conditional Backup (Medium Criticality - backup if being modified):**
- Request
- CarSale
- SupplierTemplate
- SupplierMonthlyHeader
- SupplierMonthlyDeal
- SupplierPriceListHeader
- SupplierPriceListItem

**No Backup Needed (Low Criticality):**
- SupplierImportRun
- SupplierImportRunEntry
- SyncQueueEntity

---

## Phased Rollout Plan

### Phase 1 – Infrastructure Only (No Behavior Change)

**Goal:** Implement reusable safety infrastructure without changing existing migrations.

**Tasks:**
1. Create `MigrationSafetyManager` class with backup/rollback methods
2. Create `DatabaseBackupManager` class for JSON backup/restore (similar to HealthExpert's approach)
3. Add unit tests for backup/rollback logic
4. Document the new infrastructure in code comments

**Deliverables:**
- `app/src/main/java/com/rentacar/app/data/migration/MigrationSafetyManager.kt`
- `app/src/main/java/com/rentacar/app/data/migration/DatabaseBackupManager.kt`
- Unit tests
- Updated developer documentation

**Success Criteria:**
- Infrastructure compiles and tests pass
- No changes to existing migrations
- No changes to database version or schema

### Phase 2 – Apply to Future Migrations

**Goal:** Use new safety infrastructure for all new migrations (version 33+).

**Tasks:**
1. Update developer workflow documentation
2. Create migration template/example using new infrastructure
3. Enforce code review requirement: all new migrations must use appropriate safety level

**Deliverables:**
- Updated `docs/rentacar-room-migrations-plan.md` with developer workflow
- Example migration in code comments or separate example file
- Code review checklist

**Success Criteria:**
- Next migration (32→33) uses new infrastructure
- All team members understand when to use high/medium/low-risk patterns

### Phase 3 – Optional Refactor of Old Migrations

**Goal:** Improve safety of selected high-risk legacy migrations.

**Candidates for Refactoring:**
- **MIGRATION_28_29:** High priority (modifies existing Reservation data without backup)
- **MIGRATION_20_21:** Medium priority (index changes, generally safe but could be improved)

**Approach:**
1. **DO NOT modify migrations that are already deployed** (18→31). These migrations have already run on user devices. Changing them could cause issues if a user downgrades and upgrades again.
2. **Only refactor if:** Migration is known to have caused issues, or migration is very recent and hasn't been widely deployed yet.

**Tasks (if refactoring is approved):**
1. Create backup of current migration code
2. Refactor migration to use new infrastructure
3. Test migration on devices with real data
4. Verify rollback works correctly
5. Deploy with caution (monitor logs)

**Success Criteria:**
- Refactored migrations work correctly on test devices
- Rollback tested and verified
- No regressions in existing functionality

### Phase 4 – Developer Workflow and Documentation

**Goal:** Establish clear guidelines and tooling for developers.

**Tasks:**
1. Create developer checklist (see next section)
2. Add migration templates to codebase
3. Update onboarding documentation
4. Create migration testing guide

**Deliverables:**
- Developer workflow checklist
- Migration code templates
- Testing guide
- Onboarding documentation update

**Success Criteria:**
- New developers can write safe migrations without guidance
- All migrations follow consistent patterns
- Code reviews are faster (clear checklist)

---

## Developer Workflow for Future Schema Changes

### Checklist for Creating a New Migration

#### Step 1: Assess Risk Level

**Questions to ask:**
- [ ] Does this migration modify existing data (UPDATE, DELETE)?
- [ ] Does this migration drop tables or columns?
- [ ] Does this migration change primary keys or foreign keys?
- [ ] Does this migration create multiple related tables with foreign keys?
- [ ] Does this migration only add a nullable column or create a new table?

**Risk Level Decision:**
- **High:** If any of the first 4 questions is "yes"
- **Medium:** If question 5 is "yes" and migration creates multiple related tables
- **Low:** If migration only adds a column or creates a single simple table

#### Step 2: Update Database Version

1. Open `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
2. Increment `version` in `@Database` annotation (e.g., from 32 to 33)
3. If adding a new entity, add it to the `entities = [...]` list
4. If adding a new DAO, add `abstract fun newDao(): NewDao` method

#### Step 3: Create Migration Object

1. Open `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`
2. Create new `MIGRATION_X_Y` object following the appropriate pattern:

**High-Risk Pattern:**
```kotlin
private val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        val safetyManager = MigrationSafetyManager(database, context)
        val criticalTables = listOf("Customer", "Reservation", "Payment", "Supplier")
        
        try {
            // 1. Create backups
            safetyManager.createBackupTables(criticalTables)
            safetyManager.createEmergencyJsonBackup(criticalTables)
            
            android.util.Log.i("Migration", "Starting migration X->Y")
            
            // 2. Perform migration
            database.execSQL("...")
            
            // 3. Drop backups on success
            safetyManager.dropBackupTables(criticalTables.map { "${it}_backup" })
            
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration X->Y failed, attempting rollback", e)
            try {
                safetyManager.rollbackFromBackupTables(criticalTables)
                android.util.Log.i("Migration", "Rollback X->Y completed successfully")
            } catch (restoreException: Exception) {
                android.util.Log.e("Migration", "Rollback X->Y failed", restoreException)
            }
            throw e
        }
    }
}
```

**Medium-Risk Pattern:**
```kotlin
private val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        try {
            android.util.Log.i("Migration", "Starting migration X->Y")
            
            // Perform migration steps
            database.execSQL("CREATE TABLE IF NOT EXISTS ...")
            database.execSQL("CREATE INDEX IF NOT EXISTS ...")
            
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration X->Y failed", e)
            throw e
        }
    }
}
```

**Low-Risk Pattern:**
```kotlin
private val MIGRATION_X_Y = object : Migration(X, Y) {
    override fun migrate(database: SupportSQLiteDatabase) {
        try {
            android.util.Log.i("Migration", "Starting migration X->Y")
            database.execSQL("ALTER TABLE TableName ADD COLUMN newColumn INTEGER DEFAULT 0")
            android.util.Log.i("Migration", "Migration X->Y completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration X->Y failed", e)
            throw e
        }
    }
}
```

#### Step 4: Register Migration

1. In `DatabaseModule.provideDatabase()`, add the new migration to `.addMigrations(...)`:
```kotlin
.addMigrations(
    MIGRATION_18_19, MIGRATION_19_20, ..., MIGRATION_X_Y  // Add new migration here
)
```

#### Step 5: Test Migration Locally

**Testing Checklist:**
- [ ] Create a test database at version X (previous version)
- [ ] Populate test database with sample data (including critical tables)
- [ ] Run app with new version (Y)
- [ ] Verify migration completes successfully
- [ ] Verify data integrity (all data preserved, new schema correct)
- [ ] If high-risk: Test rollback by intentionally causing migration to fail
- [ ] Verify rollback restores data correctly

**Testing Tools:**
- Use Room's `MigrationTestHelper` for unit tests
- Use real device/emulator with test data for integration tests
- Check logs for migration success/failure messages

#### Step 6: Code Review

**Review Checklist:**
- [ ] Migration follows appropriate risk-level pattern
- [ ] All critical tables are backed up (if high-risk)
- [ ] Logging is comprehensive and clear
- [ ] Error handling is appropriate
- [ ] Migration is registered in `addMigrations()`
- [ ] Database version is incremented
- [ ] New entities/DAOs are added to `AppDatabase` (if applicable)

#### Step 7: Deploy and Monitor

**Post-Deployment:**
- [ ] Monitor crash reports for migration-related errors
- [ ] Check logs for migration success/failure in production
- [ ] Verify no user reports of data loss
- [ ] If issues occur, have rollback plan ready (JSON backup recovery)

---

## Summary

This design document outlines a comprehensive plan to establish a safety-first migration architecture for Rent_a_Car, inspired by HealthExpert's proven approach. The key principles are:

1. **Risk-Based Safety:** Different migration types require different safety mechanisms
2. **Reusable Infrastructure:** Common backup/rollback logic in `MigrationSafetyManager`
3. **Consistent Patterns:** All migrations follow clear, documented patterns
4. **Backward Compatibility:** Existing migrations remain unchanged
5. **Developer-Friendly:** Clear guidelines and templates make it easy to write safe migrations

The phased rollout plan ensures that:
- Infrastructure is built and tested before use
- New migrations immediately benefit from improved safety
- Legacy migrations are only refactored if necessary and safe
- Developers have clear guidelines and tooling

**Next Steps:**
1. Review and approve this design document
2. Implement Phase 1 (infrastructure) in a separate implementation task
3. Apply new infrastructure to next migration (Phase 2)
4. Monitor and iterate based on real-world usage

---

## References

- **HealthExpert Migration Architecture:** `docs/healthExpert-room-migrations.md`
- **Rent_a_Car Database:** `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
- **Rent_a_Car Migrations:** `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`
- **Room Migration Documentation:** [Android Developer Guide](https://developer.android.com/training/data-storage/room/migrating-db-versions)

