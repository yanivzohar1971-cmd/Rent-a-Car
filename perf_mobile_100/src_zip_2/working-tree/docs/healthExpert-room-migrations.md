# HealthExpert Room Migration Architecture

## Overview

HealthExpert uses an advanced Room database migration system that prioritizes **data safety** and **automatic rollback** capabilities. The system has evolved from comprehensive backup/rollback mechanisms in early migrations (versions 25-31) to simpler, more focused migrations in later versions (32-46). The migration strategy emphasizes preventing data loss through in-database backup tables and emergency JSON backups.

**Why is it "advanced"?**
- Automatic backup of ALL tables before each migration
- Automatic rollback on failure
- Emergency JSON backup files for external recovery
- Comprehensive logging at every step
- Fallback to destructive migration only as last resort

---

## Database Overview

### Database Class
- **File Path:** `app/src/main/java/com/example/healthexpert/data/AppDatabase.kt`
- **Class Name:** `AppDatabase`
- **Current Version:** `46`
- **Schema Export:** `exportSchema = false` (schema files are not exported)

### Version History
The database has evolved through 21 migrations from version 25 to 46:
- **Versions 25-31:** Comprehensive backup/rollback pattern with full table backups
- **Versions 32-46:** Simplified migrations (ALTER TABLE, CREATE TABLE) without full backup pattern

### Entities
The database contains 23 entities including:
- Core data: `Food`, `PersonalFood`, `Meal`, `Settings`, `WaterDaily`, `WeightDaily`
- Workout data: `WorkoutItem`, `WorkoutSet`, `WorkoutDay`, `WorkoutExercise`, `SuperSet`
- Metrics: `MetricEntry`, `DailyMetrics`
- Sync: `SyncState`, `PendingSync`
- Social: `Coach`, `Group`, `Program`, `Invite`
- Logging: `ChangelogEntry`, `ChangeTracking`, `StepEntity`, `LogEntity`

---

## Migration Strategy

### Approach: Manual Migration Objects

HealthExpert uses **manual `Migration` objects** exclusively. It does NOT use:
- `@AutoMigration` annotations
- `AutoMigrationSpec` classes
- Room's automatic schema generation for migrations

### Migration Registration

All migrations are registered in `buildDatabase()` method:

```kotlin
Room.databaseBuilder(
    context.applicationContext,
    AppDatabase::class.java,
    "health_expert.db"
)
.addMigrations(
    MIGRATION_25_26, MIGRATION_26_27, MIGRATION_27_28, 
    MIGRATION_28_29, MIGRATION_29_30, MIGRATION_30_31, 
    MIGRATION_31_32, MIGRATION_32_33, MIGRATION_33_34, 
    MIGRATION_34_35, MIGRATION_35_36, MIGRATION_36_37, 
    MIGRATION_37_38, MIGRATION_38_39, MIGRATION_39_40, 
    MIGRATION_40_41, MIGRATION_41_42, MIGRATION_42_43, 
    MIGRATION_43_44, MIGRATION_44_45, MIGRATION_45_46
)
.fallbackToDestructiveMigration()
.build()
```

### Fallback Strategy

`fallbackToDestructiveMigration()` is used as a **last resort safety net**. This means:
- If a migration fails and rollback also fails, Room will drop and recreate the database
- This is acceptable because the system creates backups before migrations
- The fallback is used in both debug and release builds

---

## Auto-Migration Details

**HealthExpert does NOT use Room's `@AutoMigration` feature.**

All migrations are manually implemented as `Migration` objects. There are no `AutoMigrationSpec` classes.

---

## Safety and Data-Integrity Mechanisms

### 1. Comprehensive Table Backup Pattern (Versions 25-31)

Early migrations use a **full backup/rollback pattern**:

**Before Migration:**
1. Create backup tables for ALL existing tables: `CREATE TABLE X_backup AS SELECT * FROM X`
2. Create emergency JSON backup file in `Downloads/HealthExpert/Backups/`
3. Log backup creation

**During Migration:**
- Execute the actual schema change (CREATE TABLE, ALTER TABLE, etc.)

**After Successful Migration:**
- Drop all backup tables: `DROP TABLE X_backup`

**On Failure:**
- Attempt rollback: `DROP TABLE IF EXISTS X` then `ALTER TABLE X_backup RENAME TO X`
- If rollback fails, throw original exception (triggers `fallbackToDestructiveMigration()`)

**Example (MIGRATION_27_28):**
```kotlin
// Backup ALL tables
database.execSQL("CREATE TABLE Food_backup AS SELECT * FROM Food")
database.execSQL("CREATE TABLE PersonalFood_backup AS SELECT * FROM PersonalFood")
// ... (all other tables)

// Create emergency JSON backup
val backupFile = File(backupDir, "emergency_migration_backup_$timestamp.json")
backupFile.writeText("Emergency backup created before migration to version 28 - ${Date()}")

// Perform migration
database.execSQL("CREATE TABLE ChangelogEntry (...)")

// On success: drop backups
database.execSQL("DROP TABLE Food_backup")
// ...

// On failure: rollback
try {
    database.execSQL("DROP TABLE IF EXISTS Food")
    database.execSQL("ALTER TABLE Food_backup RENAME TO Food")
    // ... (restore all tables)
} catch (restoreException: Exception) {
    throw e // Original migration exception
}
```

### 2. Simplified Migrations (Versions 32-46)

Later migrations are simpler and do NOT use the full backup pattern:
- Direct `ALTER TABLE` or `CREATE TABLE` statements
- No backup tables created
- Still use try/catch with logging
- Rely on `fallbackToDestructiveMigration()` if they fail

**Example (MIGRATION_32_33):**
```kotlin
try {
    android.util.Log.i("Migration", "Starting migration 32->33")
    database.execSQL("ALTER TABLE PersonalFood ADD COLUMN calories REAL")
    android.util.Log.i("Migration", "Migration 32->33 completed successfully")
} catch (e: Exception) {
    android.util.Log.e("Migration", "Migration 32->33 failed", e)
    throw e
}
```

### 3. Logging

Every migration includes comprehensive logging:
- `Log.i("Migration", "Starting migration X->Y")`
- `Log.i("Migration", "Emergency backup created before migration X->Y")`
- `Log.i("Migration", "Migration X->Y completed successfully")`
- `Log.e("Migration", "Migration X->Y failed, attempting rollback", e)`
- `Log.e("Migration", "Rollback X->Y failed", restoreException)`

### 4. Emergency JSON Backups

Some migrations (25-31) create emergency JSON backup files:
- Location: `Downloads/HealthExpert/Backups/emergency_migration_backup_{timestamp}.json`
- Created before migration starts
- Contains timestamp and version info
- Used for external recovery if in-database rollback fails

### 5. No Destructive Migrations in Production

The system never intentionally drops tables or data:
- All migrations are additive (CREATE TABLE, ALTER TABLE ADD COLUMN)
- No DROP TABLE statements (except for backup tables after success)
- `fallbackToDestructiveMigration()` only triggers if migration AND rollback both fail

### 6. DatabaseMigrationManager Helper

HealthExpert includes a `DatabaseMigrationManager` class (`app/src/main/java/com/example/healthexpert/backup/DatabaseMigrationManager.kt`):
- Wraps migration with full backup via `DatabaseBackupManager`
- Checks if database has data before backing up
- Performs migration and can restore from backup on failure
- Not directly used by Room migrations (migrations run automatically), but available for manual migration workflows

---

## Developer Workflow in HealthExpert

### When Adding a New Entity/Table

1. **Update `@Database` annotation:**
   - Add new entity to `entities = [...]` list
   - Increment `version` (e.g., from 46 to 47)

2. **Create Migration Object:**
   - Add `MIGRATION_46_47` object in `AppDatabase.kt` companion object
   - Use pattern:
     ```kotlin
     val MIGRATION_46_47 = object : Migration(46, 47) {
         override fun migrate(database: SupportSQLiteDatabase) {
             try {
                 android.util.Log.i("Migration", "Starting migration 46->47")
                 database.execSQL("CREATE TABLE IF NOT EXISTS NewTable (...)")
                 android.util.Log.i("Migration", "Migration 46->47 completed successfully")
             } catch (e: Exception) {
                 android.util.Log.e("Migration", "Migration 46->47 failed", e)
                 throw e
             }
         }
     }
     ```

3. **Register Migration:**
   - Add `MIGRATION_46_47` to `.addMigrations(...)` list in `buildDatabase()`

4. **Add DAO Method:**
   - Add `abstract fun newTableDao(): NewTableDao` to `AppDatabase`

### When Adding/Removing a Column

1. **Update Entity Class:**
   - Add/remove field in the entity data class
   - Update `@Database` version

2. **Create Migration:**
   - For adding: `ALTER TABLE TableName ADD COLUMN columnName TYPE`
   - For removing: SQLite doesn't support DROP COLUMN directly; use CREATE TABLE AS SELECT with new schema, then RENAME

3. **Register Migration:**
   - Add to `.addMigrations(...)`

### When Renaming a Field/Table

1. **Update Entity:**
   - Rename field in entity class
   - Update `@Database` version

2. **Create Migration:**
   - For table rename: `ALTER TABLE OldName RENAME TO NewName`
   - For column rename: SQLite doesn't support directly; use CREATE TABLE AS SELECT with new column names

3. **Register Migration**

### Conventions

- **Naming:** `MIGRATION_{from}_{to}` (e.g., `MIGRATION_46_47`)
- **Location:** All migrations defined in `AppDatabase.kt` companion object
- **Logging:** Always log start, success, and failure
- **Error Handling:** Always wrap in try/catch and rethrow on failure

---

## Adapting This Pattern to Rent_a_Car (Design Only)

### Current State of Rent_a_Car

- **Database Version:** 32
- **Migration Pattern:** Similar to HealthExpert (manual migrations with backup/rollback)
- **Location:** Migrations in `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`
- **Current Migrations:** 18->32 (14 migrations)
- **Schema Export:** `exportSchema = true` (unlike HealthExpert)

### What to Copy/Adapt

#### 1. Comprehensive Backup Pattern (for Critical Migrations)

**Reusable Pattern:**
- Create backup tables before migration: `CREATE TABLE X_backup AS SELECT * FROM X`
- Create emergency JSON backup file
- On success: drop backup tables
- On failure: rollback from backup tables

**Adaptation:**
- Apply to Rent_a_Car's critical migrations (e.g., adding new core tables)
- Use Rent_a_Car's table names (Customer, Supplier, Reservation, etc.)
- Adjust backup directory path to Rent_a_Car's convention

#### 2. Simplified Migration Pattern (for Non-Critical Changes)

**Reusable Pattern:**
- Direct SQL execution with try/catch
- Comprehensive logging
- Let `fallbackToDestructiveMigration()` handle failures

**Adaptation:**
- Already used in Rent_a_Car for simpler migrations (30->31, 31->32)
- Continue using this pattern for ALTER TABLE ADD COLUMN operations

#### 3. Migration Registration Pattern

**Reusable Pattern:**
- All migrations in one place (companion object or module)
- Explicit registration in `.addMigrations(...)`
- Clear version progression

**Adaptation:**
- Rent_a_Car already uses this pattern in `DatabaseModule.kt`
- Keep existing structure, just add new migrations following the same pattern

#### 4. Logging Standards

**Reusable Pattern:**
- Consistent log tags: `"Migration"`
- Log start, success, failure, rollback
- Use `Log.i()` for info, `Log.e()` for errors

**Adaptation:**
- Rent_a_Car already uses similar logging
- Standardize on HealthExpert's exact log message format for consistency

### What Must Be Rewritten

#### 1. Table-Specific Backup Lists

**HealthExpert backs up:** Food, PersonalFood, Meal, Settings, WaterDaily, WeightDaily, WorkoutItem, etc.

**Rent_a_Car must back up:** Customer, Supplier, Branch, CarType, Reservation, Payment, CardStub, CommissionRule, Agent, Request, CarSale, etc.

**Action:** Rewrite backup table creation/restoration for Rent_a_Car's schema.

#### 2. Backup Directory Paths

**HealthExpert:** `Downloads/HealthExpert/Backups/`

**Rent_a_Car:** Should use `Downloads/RentACar/Backups/` or similar

**Action:** Update file paths in migration code.

#### 3. DatabaseMigrationManager Integration

**HealthExpert:** Has `DatabaseMigrationManager` that wraps migrations with JSON backups.

**Rent_a_Car:** Currently doesn't have this helper class.

**Action:** Optionally create similar helper, or keep migrations inline in `DatabaseModule.kt`.

### Potential Risks / Gotchas

#### 1. Schema Complexity Differences

- **HealthExpert:** 23 entities, many with complex relationships
- **Rent_a_Car:** 16 entities, different relationship patterns

**Risk:** Backup/restore logic must account for Rent_a_Car's specific foreign key constraints and relationships.

#### 2. Migration Version Gaps

- **HealthExpert:** Migrations from 25->46 (21 migrations)
- **Rent_a_Car:** Migrations from 18->32 (14 migrations)

**Risk:** If adapting the comprehensive backup pattern, ensure it works for Rent_a_Car's current version and future migrations.

#### 3. exportSchema Difference

- **HealthExpert:** `exportSchema = false`
- **Rent_a_Car:** `exportSchema = true`

**Consideration:** Rent_a_Car's schema export might help with migration planning, but doesn't change the migration implementation pattern.

#### 4. Foreign Key Constraints

- Both databases likely have foreign keys
- Backup/restore must preserve referential integrity

**Risk:** When restoring from backup tables, ensure foreign key constraints are satisfied.

#### 5. Index Preservation

- Migrations should preserve existing indices
- New indices should be created in migrations if needed

**Risk:** Backup/restore pattern might not preserve indices automatically; may need explicit index creation.

### Recommended Approach for Rent_a_Car

1. **For Critical Migrations (new tables, major schema changes):**
   - Use comprehensive backup/rollback pattern from HealthExpert
   - Adapt table list to Rent_a_Car's entities
   - Create emergency JSON backups

2. **For Simple Migrations (ADD COLUMN, minor changes):**
   - Continue using simplified pattern (already in use)
   - Add comprehensive logging following HealthExpert's format

3. **Migration Location:**
   - Keep migrations in `DatabaseModule.kt` (current location)
   - Or move to `AppDatabase.kt` companion object (like HealthExpert) for consistency

4. **Testing Strategy:**
   - Test migrations on devices with real data
   - Verify backup/restore works correctly
   - Ensure `fallbackToDestructiveMigration()` is truly last resort

---

## File References

### HealthExpert Files
- **Main Database:** `app/src/main/java/com/example/healthexpert/data/AppDatabase.kt`
- **Migration Manager:** `app/src/main/java/com/example/healthexpert/backup/DatabaseMigrationManager.kt`
- **Backup Manager:** `app/src/main/java/com/example/healthexpert/backup/DatabaseBackupManager.kt`

### Rent_a_Car Files (for reference)
- **Main Database:** `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`
- **Database Module:** `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`

---

## Summary

HealthExpert's migration system is "advanced" because it:
1. **Prioritizes data safety** through comprehensive backups
2. **Automatically rolls back** on failure
3. **Logs everything** for debugging
4. **Uses destructive migration only as last resort**

The pattern is well-suited for adaptation to Rent_a_Car, with the main work being:
- Adapting table lists to Rent_a_Car's schema
- Updating file paths
- Maintaining the same safety-first philosophy

