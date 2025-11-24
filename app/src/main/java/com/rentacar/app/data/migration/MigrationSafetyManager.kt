package com.rentacar.app.data.migration

import android.content.Context
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * High-level coordinator for safe database migrations.
 * 
 * Composes the three safety layers (A, B, C) and provides a unified API
 * for preparing high-risk and medium-risk migrations.
 * 
 * This is infrastructure-only and is NOT wired into migrations yet (Phase 1).
 * Future migrations will use this manager to ensure comprehensive backup coverage.
 * 
 * Usage (future):
 * ```kotlin
 * val safetyManager = MigrationSafetyManager(context, database)
 * safetyManager.prepareHighRiskMigration(listOf("Customer", "Reservation"), dumpJson = true)
 * // ... perform migration ...
 * safetyManager.dropBackups(listOf("Customer", "Reservation"))
 * ```
 */
class MigrationSafetyManager(
    private val context: Context,
    private val database: SupportSQLiteDatabase
) {
    private val dbFileBackupManager = DbFileBackupManager(context)
    private val tableBackupManager = TableBackupManager(database)
    private val jsonBackupManager = JsonBackupManager(context, database)

    /**
     * Prepares a high-safety environment for a high-risk migration (Level 3).
     * 
     * This method:
     * 1. Creates DB file backup (Layer A - best effort, logs failure but continues)
     * 2. Creates backup tables for all specified tables (Layer B - required)
     * 3. Optionally exports JSON backups (Layer C - if dumpJson is true)
     * 
     * NOTE: In Phase 1, this is infrastructure-only. When wired into migrations,
     * Level 3 migrations should verify all backups succeeded before proceeding.
     * 
     * @param tableNames List of critical table names to backup
     * @param dumpJson Whether to create JSON exports (default: true for Level 3)
     */
    fun prepareHighRiskMigration(tableNames: List<String>, dumpJson: Boolean = true) {
        MigrationLogger.info("Preparing high-risk migration for tables: ${tableNames.joinToString(", ")}")

        // Layer A: DB file backup (best-effort)
        // Note: In future, Level 3 migrations should verify this succeeded
        val internalBackup = dbFileBackupManager.createInternalDbBackup()
        if (internalBackup == null) {
            MigrationLogger.warn("Internal DB file backup failed (continuing with table backups)")
        }

        // Try external backup too (best-effort)
        dbFileBackupManager.createExternalDbBackupIfPossible()

        // Layer B: Table-level backups (required)
        try {
            tableBackupManager.createBackupTables(tableNames)
            MigrationLogger.info("Table backups created successfully for ${tableNames.size} tables")
        } catch (e: Exception) {
            MigrationLogger.error("Failed to create table backups", e)
            throw e // Re-throw - table backups are required for Level 3
        }

        // Layer C: JSON exports (optional but recommended)
        if (dumpJson) {
            val jsonFiles = jsonBackupManager.exportTablesAsJson(tableNames)
            if (jsonFiles.size == tableNames.size) {
                MigrationLogger.info("JSON backups created successfully for ${jsonFiles.size} tables")
            } else {
                MigrationLogger.warn("JSON backup incomplete: ${jsonFiles.size}/${tableNames.size} files created")
            }

            // Also try external JSON backups (best-effort)
            tableNames.forEach { tableName ->
                jsonBackupManager.exportTableAsJsonExternal(tableName)
            }
        }

        MigrationLogger.info("High-risk migration preparation completed")
    }

    /**
     * Prepares a medium-safety environment for a medium-risk migration (Level 2).
     * 
     * This method:
     * 1. Optionally creates DB file backup (if createFileBackup is true)
     * 2. Creates backup tables for specified critical tables (if any)
     * 3. Optionally exports JSON backups (if dumpJson is true)
     * 
     * @param tableNames List of critical table names to backup (if migration affects them)
     * @param createFileBackup Whether to create DB file backup (default: false for Level 2)
     * @param dumpJson Whether to create JSON exports (default: false for Level 2)
     */
    fun prepareMediumRiskMigration(
        tableNames: List<String>,
        createFileBackup: Boolean = false,
        dumpJson: Boolean = false
    ) {
        MigrationLogger.info("Preparing medium-risk migration for tables: ${tableNames.joinToString(", ")}")

        // Layer A: DB file backup (optional for Level 2)
        if (createFileBackup) {
            val internalBackup = dbFileBackupManager.createInternalDbBackup()
            if (internalBackup == null) {
                MigrationLogger.warn("Internal DB file backup failed (continuing)")
            }
        }

        // Layer B: Table-level backups (if tables are specified)
        if (tableNames.isNotEmpty()) {
            try {
                tableBackupManager.createBackupTables(tableNames)
                MigrationLogger.info("Table backups created for ${tableNames.size} tables")
            } catch (e: Exception) {
                MigrationLogger.warn("Failed to create table backups (continuing)", e)
                // For Level 2, we don't fail if backups fail - just log and continue
            }
        }

        // Layer C: JSON exports (optional for Level 2)
        if (dumpJson && tableNames.isNotEmpty()) {
            jsonBackupManager.exportTablesAsJson(tableNames)
        }

        MigrationLogger.info("Medium-risk migration preparation completed")
    }

    /**
     * Drops backup tables after a successful migration.
     * 
     * This should be called after migration completes successfully.
     * 
     * @param tableNames List of table names whose backup tables should be dropped
     */
    fun dropBackups(tableNames: List<String>) {
        MigrationLogger.info("Dropping backup tables for: ${tableNames.joinToString(", ")}")
        tableBackupManager.dropBackupTables(tableNames)
        MigrationLogger.info("Backup tables dropped")
    }

    /**
     * Attempts to restore tables from backup tables.
     * 
     * This should be called if migration fails, before rethrowing the exception.
     * 
     * @param tableNames List of table names to restore
     * @throws Exception if restoration fails
     */
    fun restoreFromBackups(tableNames: List<String>) {
        MigrationLogger.info("Attempting rollback for tables: ${tableNames.joinToString(", ")}")
        try {
            tableBackupManager.restoreFromBackup(tableNames)
            MigrationLogger.logRollback(attempted = true, success = true, "Restored ${tableNames.size} tables")
        } catch (e: Exception) {
            MigrationLogger.logRollback(attempted = true, success = false, "Failed to restore: ${e.message}")
            throw e
        }
    }

    /**
     * Verifies that backup tables exist for the given table names.
     * 
     * @param tableNames List of table names to verify
     * @return true if all backup tables exist, false otherwise
     */
    fun verifyBackups(tableNames: List<String>): Boolean {
        return tableBackupManager.verifyBackupTables(tableNames)
    }
}

