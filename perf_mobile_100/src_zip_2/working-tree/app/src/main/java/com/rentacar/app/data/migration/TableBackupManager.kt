package com.rentacar.app.data.migration

import android.util.Log
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Manages table-level backups and rollback (Layer B of the paranoid safety architecture).
 * 
 * Creates backup tables (*_backup) for critical tables before migrations,
 * allowing fast in-database rollback if migration fails.
 * 
 * This class operates purely via SQL and does not know about Room entities.
 * This is infrastructure-only and is NOT wired into migrations yet (Phase 1).
 */
class TableBackupManager(
    private val database: SupportSQLiteDatabase
) {
    private val tag = "TableBackupManager"

    /**
     * Creates backup tables for the given table names.
     * 
     * For each tableName, creates a backup table named "${tableName}_backup"
     * containing all rows from the original table.
     * 
     * Example: For "Reservation", creates "Reservation_backup" with all reservation rows.
     * 
     * @param tableNames List of table names to backup
     * @throws Exception if backup creation fails for any table
     */
    fun createBackupTables(tableNames: List<String>) {
        for (tableName in tableNames) {
            val backupTable = "${tableName}_backup"
            try {
                Log.i(tag, "Creating backup table: $backupTable FROM $tableName")
                MigrationLogger.debug("Creating backup table: $backupTable")

                // Drop existing backup table if it exists (shouldn't happen, but be safe)
                database.execSQL("DROP TABLE IF EXISTS $backupTable")

                // Create backup table with all data
                database.execSQL("CREATE TABLE $backupTable AS SELECT * FROM $tableName")

                // Optionally log row count (cheap query)
                try {
                    val cursor = database.query("SELECT COUNT(*) FROM $backupTable")
                    cursor.use {
                        if (it.moveToFirst()) {
                            val rowCount = it.getInt(0)
                            Log.i(tag, "Backup table $backupTable created with $rowCount rows")
                            MigrationLogger.debug("Backup table $backupTable: $rowCount rows")
                        }
                    }
                } catch (e: Exception) {
                    // Row count is optional, don't fail if it doesn't work
                    Log.d(tag, "Could not get row count for $backupTable", e)
                }

                MigrationLogger.logBackupCreated("Layer B (Table)", "Table: $backupTable")
            } catch (e: Exception) {
                Log.e(tag, "Failed to create backup table for $tableName", e)
                MigrationLogger.error("Failed to create backup table: $backupTable", e)
                throw e
            }
        }
    }

    /**
     * Drops backup tables after a successful migration.
     * 
     * This should be called after migration succeeds to clean up backup tables.
     * Errors are logged but not rethrown (migration already succeeded).
     * 
     * @param tableNames List of table names whose backup tables should be dropped
     */
    fun dropBackupTables(tableNames: List<String>) {
        for (tableName in tableNames) {
            val backupTable = "${tableName}_backup"
            try {
                Log.i(tag, "Dropping backup table: $backupTable")
                MigrationLogger.debug("Dropping backup table: $backupTable")
                database.execSQL("DROP TABLE IF EXISTS $backupTable")
            } catch (e: Exception) {
                // We log but do not rethrow, because migration already succeeded
                Log.e(tag, "Failed to drop backup table $backupTable", e)
                MigrationLogger.warn("Failed to drop backup table: $backupTable", e)
            }
        }
    }

    /**
     * Attempts to restore tables from their backup counterparts.
     * 
     * For each tableName:
     * 1. Drops the main table (if it exists)
     * 2. Renames the backup table back to the main table name
     * 
     * NOTE: This is a low-level building block. Actual migration code is expected to:
     * - Drop/rename/prepare main tables as needed before calling this
     * - Handle exceptions appropriately
     * 
     * @param tableNames List of table names to restore
     * @throws Exception if restoration fails for any table
     */
    fun restoreFromBackup(tableNames: List<String>) {
        for (tableName in tableNames) {
            val backupTable = "${tableName}_backup"
            try {
                Log.i(tag, "Restoring $tableName from $backupTable")
                MigrationLogger.debug("Restoring $tableName from $backupTable")

                // Drop the main table if it exists
                database.execSQL("DROP TABLE IF EXISTS $tableName")

                // Rename backup table back to main table
                database.execSQL("ALTER TABLE $backupTable RENAME TO $tableName")

                Log.i(tag, "Successfully restored $tableName from $backupTable")
                MigrationLogger.info("Restored table: $tableName")
            } catch (e: Exception) {
                Log.e(tag, "Failed to restore $tableName from $backupTable", e)
                MigrationLogger.error("Failed to restore table: $tableName", e)
                throw e
            }
        }
    }

    /**
     * Verifies that backup tables exist for the given table names.
     * 
     * @param tableNames List of table names to verify
     * @return true if all backup tables exist, false otherwise
     */
    fun verifyBackupTables(tableNames: List<String>): Boolean {
        for (tableName in tableNames) {
            val backupTable = "${tableName}_backup"
            try {
                // Try to query the backup table - if it doesn't exist, this will throw
                val cursor = database.query("SELECT COUNT(*) FROM $backupTable")
                cursor.close()
            } catch (e: Exception) {
                Log.w(tag, "Backup table $backupTable does not exist or is not accessible")
                MigrationLogger.warn("Backup table verification failed: $backupTable")
                return false
            }
        }
        return true
    }
}

