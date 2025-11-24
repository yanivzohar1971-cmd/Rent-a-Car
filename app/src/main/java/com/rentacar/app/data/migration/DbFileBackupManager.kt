package com.rentacar.app.data.migration

import android.content.Context
import android.os.Environment
import android.util.Log
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Manages database file-level backups (Layer A of the paranoid safety architecture).
 * 
 * Creates timestamped copies of the entire database file before migrations.
 * This provides the ultimate safety net - even if Room corrupts the database,
 * the raw file can be restored.
 * 
 * This class is infrastructure-only and is NOT wired into migrations yet (Phase 1).
 */
class DbFileBackupManager(
    private val context: Context,
    private val dbName: String = "rentacar.db"
) {
    private val tag = "DbFileBackupManager"
    private val timestampFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)

    companion object {
        private const val INTERNAL_BACKUP_DIR = "RentACar/Backups/db"
        private const val EXTERNAL_BACKUP_DIR = "RentACar/Backups"
    }

    /**
     * Returns the current Room database file, or null if it does not exist.
     */
    fun getCurrentDbFile(): File? {
        val dbFile = context.getDatabasePath(dbName)
        return if (dbFile.exists()) dbFile else null
    }

    /**
     * Creates a timestamped backup copy of the DB file under the app's filesDir.
     * 
     * Path: filesDir/RentACar/Backups/db/rentacar_{timestamp}.db
     * 
     * This method is side-effect free if the DB does not exist yet (returns null).
     * 
     * @return The backup file if created successfully, null otherwise
     */
    fun createInternalDbBackup(): File? {
        val source = getCurrentDbFile() ?: run {
            Log.i(tag, "No DB file found, skipping internal backup")
            return null
        }

        return try {
            val backupDir = File(context.filesDir, INTERNAL_BACKUP_DIR)
            if (!backupDir.exists() && !backupDir.mkdirs()) {
                Log.e(tag, "Failed to create backup directory: ${backupDir.absolutePath}")
                return null
            }

            val timestamp = timestampFormat.format(Date())
            val backupFile = File(backupDir, "rentacar_$timestamp.db")

            source.copyTo(target = backupFile, overwrite = false)
            
            val fileSize = backupFile.length()
            Log.i(tag, "Internal DB backup created: ${backupFile.absolutePath} [Size: ${fileSize} bytes]")
            MigrationLogger.logBackupCreated("Layer A (Internal)", "File: ${backupFile.name}, Size: ${fileSize} bytes")
            
            backupFile
        } catch (e: IOException) {
            Log.e(tag, "Error creating internal DB backup", e)
            MigrationLogger.error("Failed to create internal DB backup", e)
            null
        } catch (e: Exception) {
            Log.e(tag, "Unexpected error creating internal DB backup", e)
            MigrationLogger.error("Unexpected error creating internal DB backup", e)
            null
        }
    }

    /**
     * Best-effort: tries to create a backup copy under Environment.DIRECTORY_DOWNLOADS.
     * 
     * Path: Downloads/RentACar/Backups/rentacar_{timestamp}.db
     * 
     * This is optional; failures must NOT crash the app.
     * If external storage is not available or permissions are missing, returns null.
     * 
     * @return The backup file if created successfully, null otherwise
     */
    fun createExternalDbBackupIfPossible(): File? {
        val source = getCurrentDbFile() ?: run {
            Log.i(tag, "No DB file found, skipping external backup")
            return null
        }

        return try {
            // Check if external storage is available
            val externalStorageState = Environment.getExternalStorageState()
            if (externalStorageState != Environment.MEDIA_MOUNTED) {
                Log.w(tag, "External storage not available (state: $externalStorageState), skipping external backup")
                MigrationLogger.warn("External storage not available, skipping external backup")
                return null
            }

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val backupDir = File(downloadsDir, EXTERNAL_BACKUP_DIR)
            
            if (!backupDir.exists() && !backupDir.mkdirs()) {
                Log.e(tag, "Failed to create external backup directory: ${backupDir.absolutePath}")
                MigrationLogger.error("Failed to create external backup directory: ${backupDir.absolutePath}")
                return null
            }

            val timestamp = timestampFormat.format(Date())
            val backupFile = File(backupDir, "rentacar_$timestamp.db")

            source.copyTo(target = backupFile, overwrite = false)
            
            val fileSize = backupFile.length()
            Log.i(tag, "External DB backup created: ${backupFile.absolutePath} [Size: ${fileSize} bytes]")
            MigrationLogger.logBackupCreated("Layer A (External)", "File: ${backupFile.name}, Size: ${fileSize} bytes")
            
            backupFile
        } catch (e: SecurityException) {
            Log.w(tag, "Permission denied for external backup", e)
            MigrationLogger.warn("Permission denied for external backup", e)
            null
        } catch (e: IOException) {
            Log.w(tag, "IO error creating external backup", e)
            MigrationLogger.warn("IO error creating external backup", e)
            null
        } catch (e: Exception) {
            Log.w(tag, "Unexpected error creating external backup", e)
            MigrationLogger.warn("Unexpected error creating external backup", e)
            null
        }
    }

    /**
     * Lists all internal backup files, sorted by modification time (newest first).
     * 
     * @return List of backup files, or empty list if none exist
     */
    fun listInternalBackups(): List<File> {
        val backupDir = File(context.filesDir, INTERNAL_BACKUP_DIR)
        return if (backupDir.exists() && backupDir.isDirectory) {
            backupDir.listFiles { _, name -> name.startsWith("rentacar_") && name.endsWith(".db") }
                ?.sortedByDescending { it.lastModified() }
                ?: emptyList()
        } else {
            emptyList()
        }
    }

    /**
     * Cleans up old internal backups, keeping only the most recent [maxCount] files.
     * 
     * @param maxCount Maximum number of backups to keep (default: 5)
     */
    fun cleanupOldInternalBackups(maxCount: Int = 5) {
        val backups = listInternalBackups()
        if (backups.size <= maxCount) {
            Log.d(tag, "No cleanup needed: ${backups.size} backups (max: $maxCount)")
            return
        }

        val toDelete = backups.drop(maxCount)
        var deletedCount = 0
        for (file in toDelete) {
            try {
                if (file.delete()) {
                    deletedCount++
                } else {
                    Log.w(tag, "Failed to delete old backup: ${file.absolutePath}")
                }
            } catch (e: Exception) {
                Log.w(tag, "Error deleting old backup: ${file.absolutePath}", e)
            }
        }

        if (deletedCount > 0) {
            Log.i(tag, "Cleaned up $deletedCount old internal backups (kept $maxCount)")
            MigrationLogger.info("Cleaned up $deletedCount old internal backups")
        }
    }
}

