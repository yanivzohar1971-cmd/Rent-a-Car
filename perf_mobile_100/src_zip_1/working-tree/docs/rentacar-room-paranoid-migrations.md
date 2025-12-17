# Rent_a_Car Room "Paranoid Safety" Migration Architecture (Design Only)

## Overview

Rent_a_Car is a car rental management Android application that stores **business-critical data** in a Room database. The database contains customer records, supplier information, rental reservations, payment history, commission calculations, and related operational data. Loss of this data would severely impact business operations, damage user trust, and potentially violate regulatory compliance requirements.

**Why we aim for maximum data safety:**
- **Zero tolerance for silent data loss:** Any migration failure must be detected, logged, and recoverable
- **Never destructive without backups:** No migration should modify or delete data without creating recoverable backups first
- **Multiple safety layers:** If one backup mechanism fails, others must provide recovery paths
- **Forensic recovery capability:** Even in worst-case scenarios, data should be recoverable from external backups
- **Production-grade reliability:** The system must work correctly in production, not just in development

This document defines a **multi-layer, paranoid-safe migration architecture** for Rent_a_Car, inspired by HealthExpert's proven approach but adapted to Rent_a_Car's specific schema and business requirements. The architecture provides multiple independent safety nets, ensuring that data loss is virtually impossible even in edge cases.

**Design Philosophy:**
- **Defense in depth:** Multiple independent backup mechanisms
- **Fail-safe defaults:** If a backup fails, the migration should not proceed
- **Comprehensive logging:** Every step is logged for debugging and audit trails
- **Recovery-first design:** Every backup mechanism must have a clear recovery path

---

## Current State (Summary)

### Database Configuration

- **Database Class:** `AppDatabase`
- **File Path:** `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
- **Current Version:** `32`
- **Schema Export:** `exportSchema = true` (schema files exported to `app/schemas/`)
- **Database Name:** `rentacar.db`
- **Database File Location:** `context.getDatabasePath("rentacar.db")` (typically `data/data/com.rentacar.app/databases/rentacar.db`)
- **Instantiation:** Database is created via `DatabaseModule.provideDatabase(context)` in `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`

### Key Entities / Tables

The database contains **17 entities** (16 business entities + 1 sync entity):

**High Criticality (Core Business Data):**
- `Customer` - Customer records (name, phone, TZ ID, address, email)
- `Supplier` - Rental car suppliers (name, contact info, commission rules, import settings)
- `Branch` - Supplier branch locations
- `CarType` - Vehicle categories (sedan, compact, etc.)
- `Agent` - Sales agents/employees
- `Reservation` - Rental reservations (dates, customer, supplier, pricing)
- `Payment` - Payment records linked to reservations
- `CardStub` - Credit card authorization stubs
- `CommissionRule` - Commission calculation rules

**Medium Criticality (Business Data, Recoverable):**
- `Request` - Customer requests/quotes
- `CarSale` - Vehicle sales records
- `SupplierTemplate` - Excel import templates
- `SupplierMonthlyHeader` - Monthly supplier report headers
- `SupplierMonthlyDeal` - Individual deals in monthly reports
- `SupplierPriceListHeader` - Price list headers
- `SupplierPriceListItem` - Individual price list items

**Low Criticality (Logs/Audit, Regenerable):**
- `SupplierImportRun` - Import execution logs
- `SupplierImportRunEntry` - Individual import row logs
- `SyncQueueEntity` - Delta sync queue for Firebase

### Current Migration Strategy

**Migration History:**
- **14 migrations** from version 18 to 32
- **Migrations 18→20:** Use comprehensive backup/rollback pattern (backup tables + JSON backup)
- **Migrations 20→32:** Use simple pattern (direct SQL, basic logging, no backup tables)

**Current Safety Mechanisms:**
- ✅ Early migrations (18→20) create backup tables for all critical tables
- ✅ Early migrations create emergency JSON backup files
- ✅ All migrations have basic logging (start, success, failure)
- ✅ Early migrations have rollback logic (restore from backup tables on failure)

**Current Gaps:**
- ⚠️ **No `fallbackToDestructiveMigration()`:** If a migration fails and rollback fails, the app won't start (this is actually safer than destructive migration, but requires manual intervention)
- ⚠️ **No DB file-level backup:** If Room corrupts the entire database file, there's no file-level recovery
- ⚠️ **Inconsistent safety levels:** Later migrations (20→32) don't use backup tables, even for critical data changes
- ⚠️ **No pre-migration file backup:** Migrations 18→20 create JSON backups, but not a full DB file copy
- ⚠️ **Data modification without backup:** MIGRATION_28_29 updates existing Reservation data without creating backup tables

**Migration Registration:**
- All migrations registered in `DatabaseModule.provideDatabase()` via `.addMigrations(...)`
- No `fallbackToDestructiveMigration()` is currently used
- Database builder: `Room.databaseBuilder(context, AppDatabase::class.java, "rentacar.db")`

---

## Target Safety Levels

The architecture defines **3 safety levels** for migrations, each with specific requirements. Every migration must be classified into one of these levels, and the appropriate safety mechanisms must be applied.

### Level 1 – Low-Risk Migration

**Definition:** Migrations that are inherently safe and unlikely to cause data loss.

**Examples:**
- Adding a nullable column with no default value
- Adding a column with a simple default value (INTEGER DEFAULT 0, TEXT DEFAULT '', BOOLEAN DEFAULT 0)
- Creating a new table with no foreign keys to existing tables
- Creating indices on existing tables
- Adding a new entity that doesn't reference existing data

**Safety Requirements:**
- ✅ **Clear logging:** Log migration start, each step, and completion
- ✅ **Try/catch:** Wrap migration in try/catch, log errors, rethrow exceptions
- ✅ **No destructive SQL:** Must not use DROP TABLE, DROP COLUMN, or DELETE without WHERE
- ⚠️ **Backup tables:** Optional (not required, but can be used for extra safety)
- ❌ **DB file backup:** Not required
- ❌ **JSON export:** Not required

**Success Criteria:**
- Migration completes without exceptions
- All SQL statements execute successfully
- Database schema matches expected state
- No data loss or corruption

**Failure Handling:**
- If migration fails, exception is logged and rethrown
- Room will prevent app startup (no fallback to destructive migration in production)
- Manual intervention required (fix migration, redeploy)

### Level 2 – Medium-Risk Migration

**Definition:** Migrations that are generally safe but could cause issues if they fail partway through.

**Examples:**
- Adding a NOT NULL column with a default value (requires data transformation)
- Creating multiple related tables with foreign keys in one migration
- Adding foreign key constraints to existing tables
- Creating complex indices that might fail on large datasets
- Modifying table structure that affects existing queries

**Safety Requirements:**
- ✅ **Comprehensive logging:** Log migration start, each step, intermediate states, and completion
- ✅ **Try/catch with detailed error context:** Log table names, row counts, error details
- ✅ **Transactional where possible:** Use SQLite transactions to ensure atomicity
- ✅ **Backup tables for affected critical tables:** If migration touches High-criticality tables, create backup tables
- ⚠️ **DB file backup:** Optional (recommended if modifying critical tables)
- ⚠️ **JSON export:** Optional (recommended for critical tables being modified)

**Success Criteria:**
- Migration completes without exceptions
- All SQL statements execute successfully
- Database schema matches expected state
- Data integrity verified (foreign keys valid, constraints satisfied)
- No data loss or corruption

**Failure Handling:**
- If migration fails, attempt rollback from backup tables (if created)
- Log rollback success/failure
- If rollback fails, exception is logged and rethrown
- Room will prevent app startup
- Manual intervention required (restore from DB file backup or JSON backup if available)

### Level 3 – High-Risk / Critical Migration

**Definition:** Migrations that could cause significant data loss or corruption if they fail.

**Examples:**
- Dropping tables or columns
- Changing primary keys
- Modifying existing data (UPDATE statements on critical tables)
- Major schema transformations (CREATE TABLE AS SELECT with transformations)
- Removing unique constraints that might cause data conflicts
- Any migration that touches **Reservation**, **Payment**, **Customer**, or **Supplier** data
- Complex data migrations (e.g., splitting one table into multiple, merging tables)

**Safety Requirements (Non-Negotiable):**

1. **Layer A – DB File Backup (Required):**
   - Create a timestamped copy of the entire DB file before migration
   - Store in `context.filesDir/RentACar/Backups/db/rentacar_{timestamp}.db`
   - Optionally copy to `Environment.DIRECTORY_DOWNLOADS/RentACar/Backups/` for user-accessible backup
   - Verify backup file exists and is readable before proceeding

2. **Layer B – Table-Level Backup (Required):**
   - Create backup tables (`*_backup`) for ALL affected critical tables
   - Use `CREATE TABLE X_backup AS SELECT * FROM X` for each table
   - Verify backup tables exist and have correct row counts before proceeding
   - Log backup table creation with row counts

3. **Layer C – JSON Export (Required for Critical Tables):**
   - Export affected High-criticality tables to JSON files
   - Store in `context.filesDir/RentACar/Backups/json/{table}_{timestamp}.json`
   - Optionally copy to `Environment.DIRECTORY_DOWNLOADS/RentACar/Backups/` for user access
   - Verify JSON files are valid and contain data before proceeding

4. **Layer D – Comprehensive Logging (Required):**
   - Log migration start with version numbers
   - Log each backup layer creation (file, tables, JSON) with success/failure
   - Log each migration step with details
   - Log rollback attempts with success/failure
   - Log final state (success or failure with error details)

5. **Rollback Strategy (Required):**
   - On migration failure, attempt rollback in this order:
     1. Restore from backup tables (Layer B)
     2. If backup table restore fails, attempt to restore from DB file backup (Layer A)
     3. Log all rollback attempts and outcomes
   - If all rollback attempts fail, log critical error and rethrow exception

6. **Fallback Behavior:**
   - **MUST NOT use `fallbackToDestructiveMigration()` in production builds**
   - **MAY use `fallbackToDestructiveMigration()` only in debug builds** (behind `BuildConfig.DEBUG` flag)
   - In production: If migration and rollback both fail, app won't start (fail-fast, data preserved)

**Success Criteria:**
- All backup layers created successfully
- Migration completes without exceptions
- All SQL statements execute successfully
- Database schema matches expected state
- Data integrity verified
- Backup tables dropped (or kept for debugging, configurable)
- No data loss or corruption

**Failure Handling:**
- If any backup layer fails to create, migration should NOT proceed (fail-fast)
- If migration fails, attempt rollback from backup tables
- If backup table rollback fails, attempt to restore from DB file backup
- If all rollback attempts fail, log critical error with all available information
- Exception is rethrown, preventing app startup
- Manual recovery required (use DB file backup or JSON backup)

---

## Multi-Layer Safety Design

The architecture uses **4 independent safety layers**, each providing a different recovery mechanism. If one layer fails, others remain available.

### Layer A – Whole DB File Backup (Pre-Open Backup)

**Purpose:** Ultimate safety net - preserves the entire database file before any migration runs.

**When Used:**
- **Level 3 migrations:** Always (required)
- **Level 2 migrations:** Optional (recommended if modifying critical tables)
- **Level 1 migrations:** Not used

**Implementation Design:**

1. **Trigger Point:**
   - Before `Room.databaseBuilder(...).build()` is called
   - Check if DB file exists via `context.getDatabasePath("rentacar.db")`
   - If DB exists and version will change, create backup

2. **Backup Location:**
   - **Primary:** `context.filesDir/RentACar/Backups/db/rentacar_{timestamp}.db`
   - **Secondary (optional):** `Environment.DIRECTORY_DOWNLOADS/RentACar/Backups/rentacar_{timestamp}.db`
   - Timestamp format: `yyyyMMdd_HHmmss` (e.g., `20240115_143022`)

3. **Backup Process:**
   - Copy entire DB file using `File.copyTo()` or `Files.copy()`
   - Verify backup file exists and size matches original
   - Log backup creation with file path and size
   - If backup fails, log error and optionally abort migration (for Level 3)

4. **Recovery Process:**
   - If migration fails and rollback fails, manual recovery can:
     1. Stop the app
     2. Delete corrupted `rentacar.db` file
     3. Copy backup file to `rentacar.db` location
     4. Restart app (will be at previous version, can retry migration after fix)

5. **Cleanup:**
   - Keep last N backups (e.g., last 5) in internal storage
   - Keep last M backups (e.g., last 2) in Downloads folder
   - Delete older backups to prevent storage bloat
   - Cleanup runs after successful migration

**Responsibilities:**
- `DbFileBackupManager` class (to be implemented)
- Methods: `createInternalDbBackup()`, `createExternalDbBackup()`, `listBackups()`, `restoreFromBackup(backupFile: File)`

### Layer B – Table-Level Backup for Critical Migrations

**Purpose:** In-database backup tables that allow fast rollback without file operations.

**When Used:**
- **Level 3 migrations:** Always (required for all affected critical tables)
- **Level 2 migrations:** Optional (if modifying critical tables)
- **Level 1 migrations:** Not used

**Implementation Design:**

1. **Backup Table Creation:**
   - For each critical table: `CREATE TABLE X_backup AS SELECT * FROM X`
   - Verify backup table exists and has correct row count
   - Log backup table creation with table name and row count

2. **Affected Tables:**
   - **Always backup (High criticality):** Customer, Supplier, Branch, CarType, Agent, Reservation, Payment, CardStub, CommissionRule
   - **Conditional backup (Medium criticality):** If migration modifies these tables, backup them too
   - **Never backup (Low criticality):** SupplierImportRun, SupplierImportRunEntry, SyncQueueEntity

3. **Backup Process:**
   - Before migration: Create backup tables for all affected critical tables
   - Verify backup tables have data (row count > 0 or matches original)
   - Log each backup table creation

4. **Rollback Process:**
   - On migration failure:
     1. Drop main table: `DROP TABLE IF EXISTS X`
     2. Restore from backup: `ALTER TABLE X_backup RENAME TO X`
     3. Verify restoration (check row count)
     4. Log rollback success/failure
   - If rollback fails for any table, log error and continue with other tables
   - After all rollbacks, rethrow original exception

5. **Cleanup:**
   - On successful migration: Drop backup tables (`DROP TABLE IF EXISTS X_backup`)
   - On failed migration: Keep backup tables for manual inspection
   - Backup tables can be manually dropped after verification

**Responsibilities:**
- `TableBackupManager` class (to be implemented)
- Methods: `createBackupTables(tableNames: List<String>)`, `dropBackupTables(tableNames: List<String>)`, `restoreFromBackupTables(tableNames: List<String>)`, `verifyBackupTables(tableNames: List<String>): Boolean`

### Layer C – JSON Export (Optional but Recommended)

**Purpose:** Human-readable backup for forensic recovery and manual data inspection.

**When Used:**
- **Level 3 migrations:** Always (required for critical tables)
- **Level 2 migrations:** Optional (recommended for critical tables)
- **Level 1 migrations:** Not used

**Implementation Design:**

1. **Export Format:**
   - JSON array of objects, one object per row
   - Column names as keys, values as strings (for simplicity in Phase 1)
   - Example: `[{"id": "1", "name": "John", ...}, {"id": "2", "name": "Jane", ...}]`

2. **Export Location:**
   - **Primary:** `context.filesDir/RentACar/Backups/json/{table}_{timestamp}.json`
   - **Secondary (optional):** `Environment.DIRECTORY_DOWNLOADS/RentACar/Backups/{table}_{timestamp}.json`

3. **Export Process:**
   - For each critical table:
     1. Query all rows: `SELECT * FROM table`
     2. Convert each row to JSON object
     3. Write to JSON file
     4. Verify file exists and is valid JSON
     5. Log export success with file path and row count

4. **Recovery Process:**
   - Manual recovery (future work):
     1. Parse JSON file
     2. Insert rows into database using DAO or direct SQL
     3. Verify data integrity

5. **Cleanup:**
   - Keep last N JSON backups (e.g., last 5) per table
   - Delete older backups
   - Cleanup runs after successful migration

**Responsibilities:**
- `JsonBackupManager` class (to be implemented)
- Methods: `exportTableAsJson(tableName: String): File?`, `exportTablesAsJson(tableNames: List<String>): List<File>`, `listJsonBackups(tableName: String?): List<File>`

### Layer D – Logging & Telemetry

**Purpose:** Comprehensive logging for debugging, audit trails, and monitoring migration health.

**When Used:**
- **All migrations:** Always (required at all levels)

**Implementation Design:**

1. **Log Destinations:**
   - **Primary:** Android Logcat with tag `RentACarDbMigration`
   - **Secondary (optional):** Persistent log file in `context.filesDir/RentACar/Backups/logs/migration_{timestamp}.log`
   - **Tertiary (future):** Optional in-database log table for queryable history

2. **Log Levels:**
   - **INFO:** Migration start, backup creation, migration steps, success
   - **WARN:** Non-critical issues (backup optional step failed, cleanup failed)
   - **ERROR:** Migration failure, rollback failure, backup failure
   - **DEBUG:** Detailed step-by-step information (row counts, file sizes, etc.)

3. **What to Log:**

   **Migration Start:**
   - Migration version (from X to Y)
   - Safety level (1/2/3)
   - Affected tables
   - Timestamp

   **Backup Creation (Layer A):**
   - DB file backup creation start
   - Backup file path
   - Backup file size
   - Success/failure

   **Backup Creation (Layer B):**
   - Each backup table creation
   - Table name and row count
   - Success/failure

   **Backup Creation (Layer C):**
   - Each JSON export
   - Table name, file path, row count
   - Success/failure

   **Migration Execution:**
   - Each SQL statement executed
   - Row counts affected (if applicable)
   - Success/failure of each step

   **Migration Completion:**
   - Overall success/failure
   - Total duration
   - Final database version

   **Rollback (if needed):**
   - Rollback attempt start
   - Each table restoration
   - Rollback success/failure
   - Final state

4. **Log Format:**
   - Consistent format: `[Level] [Tag] [Message] [Details]`
   - Example: `[INFO] [RentACarDbMigration] [Migration 32->33 started] [Level: 3, Tables: Customer, Reservation]`
   - Include timestamps, version numbers, table names, file paths, error messages

5. **Log Retention:**
   - Keep last N log files (e.g., last 10)
   - Delete older logs
   - Logs can be exported for analysis

**Responsibilities:**
- `MigrationLogger` class (to be implemented, or use Android Log directly with consistent tags)
- Methods: `logMigrationStart(from: Int, to: Int, level: Int, tables: List<String>)`, `logBackupCreated(layer: String, details: String)`, `logMigrationStep(step: String, success: Boolean)`, `logMigrationComplete(success: Boolean, duration: Long)`, `logRollback(attempted: Boolean, success: Boolean, details: String)`

---

## Integration Points in the Code (Design Only)

This section describes where the safety mechanisms will be integrated into the existing codebase, without providing actual implementation code.

### 1. Database Builder Integration

**Current Location:**
- `DatabaseModule.provideDatabase(context: Context)` in `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`

**Integration Points:**

**A. Pre-DB-Open File Backup (Layer A):**
- Before `Room.databaseBuilder(...).build()` is called:
  1. Check if DB file exists
  2. Check current DB version (if DB exists, query `PRAGMA user_version`)
  3. If version will change (current < target), trigger `DbFileBackupManager.createInternalDbBackup()`
  4. For Level 3 migrations, also create external backup in Downloads folder
  5. Verify backup was created successfully
  6. If backup fails for Level 3, abort database opening (throw exception or return null)

**B. Migration Registration:**
- Existing `.addMigrations(...)` call remains
- Each migration object will internally use safety managers
- No changes to migration registration API

**C. Fallback Strategy:**
- Add conditional `fallbackToDestructiveMigration()`:
  - Only in debug builds: `if (BuildConfig.DEBUG) { .fallbackToDestructiveMigration() }`
  - Never in production builds
  - This ensures production never loses data silently

### 2. Migration Object Integration

**Current Location:**
- All `MIGRATION_X_Y` objects in `DatabaseModule.kt`

**Integration Points:**

**A. Migration Classification:**
- Each migration must declare its safety level (1/2/3)
- Can be done via:
  - Comment in code: `// Level 3: Modifies Reservation data`
  - Or future: Enum/annotation on migration object

**B. Level 3 Migration Pattern:**
- At start of `migrate()` method:
  1. Create `MigrationSafetyManager` instance
  2. Call `prepareHighRiskMigration(criticalTables, dumpJson = true)`
     - This internally calls Layer A (if not done pre-open), Layer B, Layer C
  3. Verify all backups created successfully
  4. If any backup fails, throw exception (fail-fast)
- Execute migration SQL
- On success: Call `dropBackups(criticalTables)`
- On failure: Call `restoreFromBackups(criticalTables)`, then rethrow exception

**C. Level 2 Migration Pattern:**
- At start of `migrate()` method:
  1. Optionally create `MigrationSafetyManager` instance
  2. If modifying critical tables, call `prepareMediumRiskMigration(criticalTables, dumpJson = false)`
  3. Execute migration SQL
  4. On success: Optionally drop backups
  5. On failure: Attempt rollback if backups exist, then rethrow exception

**D. Level 1 Migration Pattern:**
- Simple pattern:
  1. Log migration start
  2. Execute migration SQL
  3. Log success/failure
  4. On failure: Rethrow exception

### 3. Helper Classes Integration

**New Package:**
- `app/src/main/java/com/rentacar/app/data/migration/`

**Classes to Create:**
- `DbFileBackupManager` - Layer A (file backup)
- `TableBackupManager` - Layer B (table backup/restore)
- `JsonBackupManager` - Layer C (JSON export)
- `MigrationSafetyManager` - Coordinator that uses all three
- `MigrationLogger` (optional) - Centralized logging helper

**Dependencies:**
- `DbFileBackupManager` needs: `Context`, database file path
- `TableBackupManager` needs: `SupportSQLiteDatabase` (from migration)
- `JsonBackupManager` needs: `Context`, `SupportSQLiteDatabase`
- `MigrationSafetyManager` needs: `Context`, `SupportSQLiteDatabase`, composes the three managers

**No Dependencies on:**
- Room entities or DAOs (works with raw SQL)
- Existing migration code (backward compatible)
- Database version (works with any version)

### 4. Flow Diagram (Conceptual)

**Level 3 Migration Flow:**
```
1. App starts, DatabaseModule.provideDatabase() called
2. Check if DB exists and version will change
3. If yes, DbFileBackupManager.createInternalDbBackup() [Layer A]
4. Room.databaseBuilder(...).build() called
5. Room detects version change, triggers MIGRATION_X_Y
6. Migration.migrate() called
7. MigrationSafetyManager.prepareHighRiskMigration() called
   - TableBackupManager.createBackupTables() [Layer B]
   - JsonBackupManager.exportTablesAsJson() [Layer C]
   - MigrationLogger.logBackupCreated() [Layer D]
8. Verify all backups created
9. Execute migration SQL
10. On success:
    - TableBackupManager.dropBackupTables()
    - MigrationLogger.logMigrationComplete()
11. On failure:
    - TableBackupManager.restoreFromBackupTables()
    - MigrationLogger.logRollback()
    - Rethrow exception
12. Room handles exception (no fallback in production)
```

---

## Manual Recovery & Tools (Future Work)

This section describes a future "Recovery Tools" screen that would allow administrators to manage backups and perform manual recovery. This is **not part of the current implementation** but should be designed now so the backup infrastructure supports it.

### Recovery Tools Screen (Design Concept)

**Access:**
- Debug/admin-only screen (hidden behind feature flag or admin password)
- Accessible from Settings screen or via deep link
- Only visible in debug builds or for admin users

**Features:**

**1. Backup List View:**
- Display all available backups:
  - DB file backups (Layer A) with timestamp, file size, location
  - JSON backups (Layer C) grouped by table, with timestamp, row count
- Show backup age (days since creation)
- Indicate which backup is "latest" (most recent)

**2. Backup Export:**
- Share backup files via:
  - Email attachment
  - Google Drive / Dropbox
  - Local file system (Downloads folder)
- Export single backup or all backups as ZIP
- Include metadata (timestamp, version, table names)

**3. Backup Inspection:**
- View JSON backup contents (read-only)
- Search/filter rows in JSON backup
- Verify backup integrity (check file size, JSON validity)

**4. Manual Recovery:**
- **Warning:** Strong warnings about data loss
- **Confirmation:** Require explicit confirmation (type "RESTORE" to confirm)
- **Process:**
  1. Stop app (close database connections)
  2. Backup current DB (safety measure)
  3. Replace `rentacar.db` with selected backup file
  4. Restart app
  5. Verify database integrity
  6. Log recovery operation

**5. Backup Cleanup:**
- Delete old backups (older than N days)
- Delete backups by count (keep only last N)
- Free up storage space
- Show storage usage before/after cleanup

**6. Migration History:**
- View migration log files
- See which migrations ran, when, success/failure
- Export migration logs for analysis

### Recovery Workflow (Manual)

**Scenario 1: Migration Failed, Need to Restore from DB File Backup**

1. Open Recovery Tools screen
2. Select DB file backup (timestamped file)
3. Confirm restore (with warnings)
4. App closes database, replaces file, restarts
5. App opens at previous version
6. Developer fixes migration code
7. Redeploy app with fixed migration

**Scenario 2: Data Corruption, Need to Restore Specific Tables from JSON**

1. Open Recovery Tools screen
2. Select JSON backup for affected table
3. View JSON contents to verify
4. Export JSON for manual inspection if needed
5. Use "Restore Table from JSON" feature (future)
   - Parse JSON
   - Clear existing table data
   - Insert rows from JSON
   - Verify row count matches

**Scenario 3: Forensic Analysis**

1. Export all backups (DB files + JSON files)
2. Analyze backups on external system
3. Identify data loss or corruption
4. Plan recovery strategy
5. Execute recovery via Recovery Tools or manual SQL

### Backup Storage Management

**Storage Locations:**
- **Internal:** `context.filesDir/RentACar/Backups/` (app-private, not user-accessible)
- **External:** `Environment.DIRECTORY_DOWNLOADS/RentACar/Backups/` (user-accessible)

**Retention Policy:**
- Keep last 5 DB file backups (internal)
- Keep last 2 DB file backups (external/Downloads)
- Keep last 5 JSON backups per table (internal)
- Keep last 2 JSON backups per table (external/Downloads)
- Keep last 10 migration log files
- Delete backups older than 30 days automatically

**Storage Limits:**
- Warn if backup storage exceeds 100MB
- Block new backups if storage exceeds 500MB (require cleanup first)
- Show storage usage in Recovery Tools screen

---

## Developer Checklist for Future Schema Changes

This checklist must be followed for **every** new migration in Rent_a_Car. It ensures consistent safety practices and prevents data loss.

### Pre-Development

- [ ] **Understand the change:** What schema change is needed? Why?
- [ ] **Assess impact:** Which tables are affected? Which are critical?
- [ ] **Classify risk level:** Is this Level 1, 2, or 3? (See Target Safety Levels section)
- [ ] **Review similar migrations:** Look at existing migrations for similar patterns
- [ ] **Plan rollback:** If migration fails, how will we recover?

### Development

- [ ] **Update database version:** Increment version in `AppDatabase.kt` (e.g., 32 → 33)
- [ ] **Update entities (if needed):** Add new entities to `@Database(entities = [...])` list
- [ ] **Add DAO methods (if needed):** Add `abstract fun newDao(): NewDao` to `AppDatabase`
- [ ] **Create migration object:** Create `MIGRATION_X_Y` in `DatabaseModule.kt`
- [ ] **Classify migration:** Add comment indicating safety level (Level 1/2/3)
- [ ] **Implement safety mechanisms:**
  - [ ] **Level 1:** Basic logging, try/catch
  - [ ] **Level 2:** Optional backup tables, comprehensive logging
  - [ ] **Level 3:** 
    - [ ] DB file backup (Layer A)
    - [ ] Backup tables for all affected critical tables (Layer B)
    - [ ] JSON export for critical tables (Layer C)
    - [ ] Comprehensive logging (Layer D)
    - [ ] Rollback logic
- [ ] **Register migration:** Add to `.addMigrations(...)` in `DatabaseModule.provideDatabase()`
- [ ] **Add logging:** Log migration start, each step, success/failure

### Testing

- [ ] **Create test database:** Create a database at previous version (X) with sample data
- [ ] **Populate test data:** Add realistic data to all affected tables (especially critical ones)
- [ ] **Test migration:** Run app with new version, verify migration completes
- [ ] **Verify data integrity:**
  - [ ] All existing data preserved
  - [ ] New schema correct (columns, tables, indices)
  - [ ] Foreign keys valid
  - [ ] Row counts match expectations
- [ ] **Test rollback (Level 3 only):**
  - [ ] Intentionally cause migration to fail (e.g., invalid SQL)
  - [ ] Verify rollback restores data correctly
  - [ ] Verify app doesn't start (fail-fast behavior)
- [ ] **Test backup creation (Level 3 only):**
  - [ ] Verify DB file backup created
  - [ ] Verify backup tables created
  - [ ] Verify JSON exports created
  - [ ] Verify backups are readable and contain data
- [ ] **Test on real device:** Test migration on physical device with real data (if possible)

### Code Review

- [ ] **Migration follows safety level requirements:** All requirements for the migration's level are met
- [ ] **Critical tables backed up (if Level 3):** All affected High-criticality tables have backups
- [ ] **Logging is comprehensive:** All steps are logged with appropriate detail
- [ ] **Error handling is correct:** Try/catch blocks, rollback logic, exception rethrowing
- [ ] **No destructive SQL without backup:** No DROP/DELETE without backup (Level 3)
- [ ] **Migration is registered:** Added to `.addMigrations(...)`
- [ ] **Database version incremented:** Version number updated in `AppDatabase.kt`
- [ ] **Code follows patterns:** Migration follows the same pattern as other migrations of the same level

### Deployment

- [ ] **Monitor logs:** After deployment, monitor Logcat for migration-related logs
- [ ] **Check crash reports:** Monitor for migration-related crashes or errors
- [ ] **Verify user reports:** Check for any user reports of data loss or corruption
- [ ] **Have recovery plan ready:** Know how to recover if migration fails in production
  - [ ] DB file backup location
  - [ ] JSON backup location
  - [ ] Rollback procedure
  - [ ] Contact information for support

### Post-Deployment

- [ ] **Verify migration success:** Check logs to confirm migration completed successfully for all users
- [ ] **Monitor for issues:** Watch for any data integrity issues or performance problems
- [ ] **Document migration:** Update migration documentation if needed
- [ ] **Cleanup old backups (optional):** After confirming migration success, cleanup old backups if storage is a concern

---

## Summary

This document defines a **paranoid-safe, multi-layer migration architecture** for Rent_a_Car that provides maximum protection against data loss. The architecture uses four independent safety layers:

1. **Layer A – DB File Backup:** Ultimate safety net, preserves entire database file
2. **Layer B – Table-Level Backup:** Fast in-database rollback mechanism
3. **Layer C – JSON Export:** Human-readable backup for forensic recovery
4. **Layer D – Comprehensive Logging:** Audit trail and debugging capability

Migrations are classified into three safety levels (1/2/3), with Level 3 migrations requiring all safety mechanisms. The architecture is designed to be:

- **Fail-safe:** If backups fail, migration doesn't proceed (for Level 3)
- **Recoverable:** Multiple independent recovery paths
- **Auditable:** Comprehensive logging at every step
- **Production-ready:** No destructive fallback in production builds

**Next Steps:**
1. Review and approve this design document
2. Implement infrastructure (Phase 1): Create helper classes (`DbFileBackupManager`, `TableBackupManager`, `JsonBackupManager`, `MigrationSafetyManager`)
3. Integrate into migrations (Phase 2): Wire safety mechanisms into new migrations
4. Test thoroughly: Verify all safety mechanisms work correctly
5. Deploy with confidence: Know that data is protected by multiple safety layers

**Key Principle:** *"It's better to fail fast and require manual recovery than to silently lose data."*

---

## References

- **HealthExpert Migration Architecture:** `docs/healthExpert-room-migrations.md`
- **Rent_a_Car Migration Plan:** `docs/rentacar-room-migrations-plan.md`
- **Rent_a_Car Database:** `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
- **Rent_a_Car Migrations:** `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`
- **Room Migration Documentation:** [Android Developer Guide](https://developer.android.com/training/data-storage/room/migrating-db-versions)

