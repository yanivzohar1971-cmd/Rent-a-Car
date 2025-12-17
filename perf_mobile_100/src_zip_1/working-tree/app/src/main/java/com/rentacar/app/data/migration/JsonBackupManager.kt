package com.rentacar.app.data.migration

import android.content.Context
import android.os.Environment
import android.util.Log
import androidx.sqlite.db.SupportSQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Manages JSON export of table data (Layer C of the paranoid safety architecture).
 * 
 * Exports table contents to human-readable JSON files for forensic recovery.
 * This allows manual data inspection and recovery even if all other backup mechanisms fail.
 * 
 * This class is infrastructure-only and is NOT wired into migrations yet (Phase 1).
 */
class JsonBackupManager(
    private val context: Context,
    private val database: SupportSQLiteDatabase
) {
    private val tag = "JsonBackupManager"
    private val timestampFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)

    companion object {
        private const val INTERNAL_BACKUP_DIR = "RentACar/Backups/json"
        private const val EXTERNAL_BACKUP_DIR = "RentACar/Backups"
    }

    /**
     * Dumps the contents of a single table into a JSON file.
     * 
     * The output format is a JSON array of row objects, with column names as keys.
     * For Phase 1, all values are serialized as strings for simplicity.
     * 
     * Path: filesDir/RentACar/Backups/json/{tableName}_{timestamp}.json
     * 
     * @param tableName Name of the table to export
     * @return The JSON file if created successfully, null otherwise
     */
    fun exportTableAsJson(tableName: String): File? {
        return try {
            val cursor = database.query("SELECT * FROM $tableName")
            cursor.use {
                val resultArray = JSONArray()
                val columnNames = cursor.columnNames

                var rowCount = 0
                while (cursor.moveToNext()) {
                    val obj = JSONObject()
                    for (i in columnNames.indices) {
                        val name = columnNames[i]
                        // For Phase 1 we serialize everything as string to keep it simple
                        val value = cursor.getString(i)
                        obj.put(name, value ?: JSONObject.NULL)
                    }
                    resultArray.put(obj)
                    rowCount++
                }

                val backupDir = File(context.filesDir, INTERNAL_BACKUP_DIR)
                if (!backupDir.exists() && !backupDir.mkdirs()) {
                    Log.e(tag, "Failed to create JSON backup directory: ${backupDir.absolutePath}")
                    MigrationLogger.error("Failed to create JSON backup directory: ${backupDir.absolutePath}")
                    return null
                }

                val timestamp = timestampFormat.format(Date())
                val file = File(backupDir, "${tableName}_$timestamp.json")
                file.writeText(resultArray.toString(2)) // Pretty-print with indentation

                val fileSize = file.length()
                Log.i(tag, "JSON backup for $tableName written: ${file.absolutePath} [Rows: $rowCount, Size: ${fileSize} bytes]")
                MigrationLogger.logBackupCreated("Layer C (JSON)", "Table: $tableName, Rows: $rowCount, File: ${file.name}")

                file
            }
        } catch (e: IOException) {
            Log.e(tag, "IO error during JSON backup of $tableName", e)
            MigrationLogger.error("IO error during JSON backup: $tableName", e)
            null
        } catch (e: Exception) {
            Log.e(tag, "Error during JSON backup of $tableName", e)
            MigrationLogger.error("Error during JSON backup: $tableName", e)
            null
        }
    }

    /**
     * Exports multiple tables as JSON files.
     * 
     * @param tableNames List of table names to export
     * @return List of successfully created JSON files
     */
    fun exportTablesAsJson(tableNames: List<String>): List<File> {
        val files = mutableListOf<File>()
        for (tableName in tableNames) {
            val file = exportTableAsJson(tableName)
            if (file != null) {
                files.add(file)
            }
        }
        return files
    }

    /**
     * Lists all JSON backup files for a specific table, or all tables if tableName is null.
     * 
     * @param tableName Table name to filter by, or null for all tables
     * @return List of backup files, sorted by modification time (newest first)
     */
    fun listJsonBackups(tableName: String? = null): List<File> {
        val backupDir = File(context.filesDir, INTERNAL_BACKUP_DIR)
        if (!backupDir.exists() || !backupDir.isDirectory) {
            return emptyList()
        }

        val prefix = if (tableName != null) "${tableName}_" else ""
        return backupDir.listFiles { _, name -> 
            name.startsWith(prefix) && name.endsWith(".json")
        }?.sortedByDescending { it.lastModified() } ?: emptyList()
    }

    /**
     * Best-effort: tries to create an external JSON backup in Downloads folder.
     * 
     * This is optional; failures must NOT crash the app.
     * 
     * @param tableName Name of the table to export
     * @return The JSON file if created successfully, null otherwise
     */
    fun exportTableAsJsonExternal(tableName: String): File? {
        val internalFile = exportTableAsJson(tableName) ?: return null

        return try {
            val externalStorageState = Environment.getExternalStorageState()
            if (externalStorageState != Environment.MEDIA_MOUNTED) {
                Log.d(tag, "External storage not available, skipping external JSON backup")
                return null
            }

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val backupDir = File(downloadsDir, EXTERNAL_BACKUP_DIR)
            
            if (!backupDir.exists() && !backupDir.mkdirs()) {
                Log.w(tag, "Failed to create external JSON backup directory")
                return null
            }

            val externalFile = File(backupDir, internalFile.name)
            internalFile.copyTo(target = externalFile, overwrite = false)

            Log.i(tag, "External JSON backup created: ${externalFile.absolutePath}")
            MigrationLogger.logBackupCreated("Layer C (JSON External)", "Table: $tableName, File: ${externalFile.name}")

            externalFile
        } catch (e: SecurityException) {
            Log.w(tag, "Permission denied for external JSON backup", e)
            MigrationLogger.warn("Permission denied for external JSON backup", e)
            null
        } catch (e: Exception) {
            Log.w(tag, "Error creating external JSON backup", e)
            MigrationLogger.warn("Error creating external JSON backup", e)
            null
        }
    }
}

