package com.rentacar.app.data.debug

import android.database.DatabaseUtils
import android.util.Log
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.rentacar.app.data.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Temporary debug utility to log data snapshot counts for diagnosing userUid filtering issues.
 * 
 * Logs for each table:
 * - total: count of all rows (no filter)
 * - forUid: count where user_uid = currentUid (if currentUid != null)
 * - nullUid: count where user_uid IS NULL
 */
object DataDebugLogger {
    private const val TAG = "DataDebugLogger"
    
    /**
     * Logs a snapshot of data counts for all user-scoped tables.
     * 
     * @param tag Prefix for log tags (e.g., "CloudRestoreWorker.afterRestore")
     * @param currentUid Current user UID (can be null - will skip forUid queries if null)
     * @param db AppDatabase instance
     */
    suspend fun logUserDataSnapshot(
        tag: String,
        currentUid: String?,
        db: AppDatabase
    ) = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "[$tag] ========== Starting data snapshot ==========")
            
            if (currentUid == null || currentUid.isBlank()) {
                Log.w(TAG, "[$tag] WARNING: currentUid is null or blank - skipping forUid queries")
            }
            
            val database = db.openHelper.writableDatabase
            val escapedUid = currentUid?.let { DatabaseUtils.sqlEscapeString(it) }
            
            // List of tables to check (user-scoped tables)
            val tables = listOf(
                "Customer",
                "Supplier",
                "Branch",
                "CarType",
                "Reservation",
                "Payment",
                "CardStub",
                "CommissionRule",
                "Agent",
                "Request",
                "CarSale"
            )
            
            for (table in tables) {
                try {
                    // Total count (no filter)
                    val total = androidx.sqlite.db.SimpleSQLiteQuery("SELECT COUNT(*) FROM $table")
                        .let { query -> database.query(query).use { cursor -> 
                            if (cursor.moveToFirst()) cursor.getInt(0) else 0
                        }}
                    
                    // Count for currentUid (if provided)
                    val forUid = if (escapedUid != null) {
                        androidx.sqlite.db.SimpleSQLiteQuery("SELECT COUNT(*) FROM $table WHERE user_uid = $escapedUid")
                            .let { query -> database.query(query).use { cursor ->
                                if (cursor.moveToFirst()) cursor.getInt(0) else 0
                            }}
                    } else {
                        null
                    }
                    
                    // Count where user_uid IS NULL
                    val nullUid = androidx.sqlite.db.SimpleSQLiteQuery("SELECT COUNT(*) FROM $table WHERE user_uid IS NULL")
                        .let { query -> database.query(query).use { cursor ->
                            if (cursor.moveToFirst()) cursor.getInt(0) else 0
                        }}
                    
                    // Log the results
                    val forUidStr = forUid?.toString() ?: "N/A"
                    Log.d(TAG, "[$tag] $table: total=$total, forUid=$forUidStr, nullUid=$nullUid")
                    
                } catch (e: Exception) {
                    Log.e(TAG, "[$tag] Error querying table $table", e)
                }
            }
            
            Log.d(TAG, "[$tag] ========== Data snapshot completed ==========")
            
        } catch (e: Exception) {
            Log.e(TAG, "[$tag] Fatal error during data snapshot", e)
        }
    }
}

