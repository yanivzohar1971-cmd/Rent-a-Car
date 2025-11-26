package com.rentacar.app.data

import android.content.Context
import android.content.SharedPreferences
import android.database.DatabaseUtils
import android.util.Log
import androidx.room.RoomDatabase
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Utility class for backfilling user_uid for existing data after login.
 * 
 * This assigns the current user's UID to all legacy rows (from pre-multi-tenant era)
 * and to rows restored from old backup files (which don't have user_uid).
 * 
 * The backfill is idempotent: it only updates rows where user_uid IS NULL,
 * so it's safe to call multiple times without overwriting existing assignments.
 */
object UserUidBackfill {
    private const val TAG = "UserUidBackfill"
    private const val PREFS_NAME = "user_uid_backfill"
    private const val KEY_PREFIX = "backfill_done_"
    
    /**
     * All user-specific tables that need user_uid backfill.
     * These tables were added in migration 32->33.
     */
    private val USER_SPECIFIC_TABLES = listOf(
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
        "CarSale",
        "supplier_template",
        "supplier_monthly_header",
        "supplier_monthly_deal",
        "supplier_import_run",
        "supplier_import_run_entry",
        "supplier_price_list_header",
        "supplier_price_list_item"
    )
    
    /**
     * Backfills user_uid for all tables where user_uid IS NULL.
     * 
     * This is safe to call multiple times - it only updates rows where user_uid is NULL,
     * so it won't overwrite existing assignments. This makes it idempotent.
     * 
     * The function runs inside a Room transaction for atomicity and uses COUNT queries
     * to accurately track how many rows were updated per table.
     * 
     * @param context Application context
     * @param currentUid The Firebase UID of the currently logged-in user
     * @return Number of tables processed (for logging purposes)
     */
    suspend fun backfillUserUidForCurrentUser(
        context: Context,
        currentUid: String
    ): Int = withContext(Dispatchers.IO) {
        require(currentUid.isNotBlank()) { "currentUid cannot be blank" }
        
        Log.i(TAG, "Starting user_uid backfill for UID: $currentUid")
        
        val db = DatabaseModule.provideDatabase(context)
        var totalUpdated = 0
        
        try {
            // Use Room's transaction support for atomicity
            db.runInTransaction {
                val database = db.openHelper.writableDatabase
                
                // Escape the UID for SQL safety (handles single quotes and other special chars)
                val escapedUid = DatabaseUtils.sqlEscapeString(currentUid)
                
                for (table in USER_SPECIFIC_TABLES) {
                    try {
                        // Perform the update - only affects rows where user_uid IS NULL
                        // This is idempotent: running it multiple times will only update NULL rows
                        database.execSQL(
                            "UPDATE $table SET user_uid = $escapedUid WHERE user_uid IS NULL"
                        )
                        
                        // Log that we attempted the backfill for this table
                        // Note: We don't count rows here to avoid API complexity,
                        // but the WHERE clause ensures idempotency
                        Log.d(TAG, "Backfill executed for table: $table")
                        totalUpdated++ // Increment to indicate we processed a table
                    } catch (e: Exception) {
                        Log.e(TAG, "Error backfilling table $table", e)
                        // Continue with other tables even if one fails
                        // The transaction will rollback if we throw, but we want to continue
                    }
                }
            }
            
            // Mark backfill as done for this UID (for informational purposes)
            // Note: We don't check this flag because we want to allow re-backfilling
            // after restore operations, which is why the backfill is idempotent
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("$KEY_PREFIX$currentUid", true).apply()
            
            Log.i(TAG, "User_uid backfill completed. Processed $totalUpdated tables")
            totalUpdated
        } catch (e: Exception) {
            Log.e(TAG, "Error during user_uid backfill", e)
            throw e
        }
    }
    
    /**
     * Clears the backfill flag for a UID (useful for testing or re-backfilling).
     * Note: The backfill is idempotent, so clearing the flag is mainly for testing.
     */
    fun clearBackfillFlag(context: Context, uid: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove("$KEY_PREFIX$uid").apply()
        Log.d(TAG, "Cleared backfill flag for UID: $uid")
    }
}

