package com.rentacar.app.data.migration

import android.util.Log

/**
 * Centralized logging utility for Room database migrations.
 * 
 * Provides consistent logging with a stable tag for all migration-related operations.
 * This is Layer D of the paranoid safety architecture.
 * 
 * Usage:
 * - MigrationLogger.info("Migration 32->33 started")
 * - MigrationLogger.error("Migration failed", exception)
 */
object MigrationLogger {
    private const val TAG = "RentACarDbMigration"

    /**
     * Log an informational message.
     */
    fun info(message: String) {
        Log.i(TAG, message)
    }

    /**
     * Log a warning message, optionally with a throwable.
     */
    fun warn(message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.w(TAG, message, throwable)
        } else {
            Log.w(TAG, message)
        }
    }

    /**
     * Log an error message, optionally with a throwable.
     */
    fun error(message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(TAG, message, throwable)
        } else {
            Log.e(TAG, message)
        }
    }

    /**
     * Log a debug message (for detailed step-by-step information).
     */
    fun debug(message: String) {
        Log.d(TAG, message)
    }

    /**
     * Log migration start with version and level information.
     */
    fun logMigrationStart(from: Int, to: Int, level: Int, tables: List<String>? = null) {
        val tablesInfo = if (tables != null && tables.isNotEmpty()) {
            " [Tables: ${tables.joinToString(", ")}]"
        } else {
            ""
        }
        info("Migration $from->$to started [Level: $level]$tablesInfo")
    }

    /**
     * Log backup creation for a specific layer.
     */
    fun logBackupCreated(layer: String, details: String) {
        info("Backup created [Layer: $layer] $details")
    }

    /**
     * Log a migration step execution.
     */
    fun logMigrationStep(step: String, success: Boolean) {
        if (success) {
            debug("Migration step completed: $step")
        } else {
            error("Migration step failed: $step")
        }
    }

    /**
     * Log migration completion with duration.
     */
    fun logMigrationComplete(success: Boolean, duration: Long) {
        val status = if (success) "completed successfully" else "failed"
        info("Migration $status [Duration: ${duration}ms]")
    }

    /**
     * Log rollback attempt and result.
     */
    fun logRollback(attempted: Boolean, success: Boolean, details: String) {
        if (attempted) {
            if (success) {
                info("Rollback completed successfully: $details")
            } else {
                error("Rollback failed: $details")
            }
        } else {
            warn("Rollback not attempted: $details")
        }
    }
}

