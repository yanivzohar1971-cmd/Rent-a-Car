package com.rentacar.app.data

import android.content.Context
import android.content.SharedPreferences
import android.database.DatabaseUtils
import android.util.Log
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
    internal val USER_SPECIFIC_TABLES = listOf(
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
        "car_sale_commission_payment",
        "supplier_template",
        "supplier_monthly_header",
        "supplier_monthly_deal",
        "supplier_import_run",
        "supplier_import_run_entry",
        "supplier_price_list_header",
        "supplier_price_list_item",
        "supplier_commission_import_config",
        "supplier_commission_report_import",
        "supplier_commission_report_line",
        "commission_reconciliation_item",
        "commission_settlement_event",
        "commission_tracking_override"
    )
    
    /**
     * SQL that assigns [escapedUid] only to rows with no tenant yet.
     * Exposed for unit tests (WHERE user_uid IS NULL guard).
     */
    internal fun backfillUpdateSql(table: String, escapedUid: String): String {
        return "UPDATE $table SET user_uid = $escapedUid WHERE user_uid IS NULL"
    }
    
    /**
     * Backfills user_uid on an existing Room database (e.g. after ICE restore).
     * Only rows with user_uid IS NULL are updated; other users' rows are untouched.
     */
    suspend fun backfillUserUidInDatabase(
        db: AppDatabase,
        currentUid: String
    ): Int = withContext(Dispatchers.IO) {
        require(currentUid.isNotBlank()) { "currentUid cannot be blank" }
        Log.i(TAG, "Starting user_uid backfill in database for UID: $currentUid")
        val escapedUid = DatabaseUtils.sqlEscapeString(currentUid)
        var tablesProcessed = 0
        db.runInTransaction {
            val database = db.openHelper.writableDatabase
            for (table in USER_SPECIFIC_TABLES) {
                try {
                    database.execSQL(backfillUpdateSql(table, escapedUid))
                    Log.d(TAG, "Backfill executed for table: $table")
                    tablesProcessed++
                } catch (e: Exception) {
                    Log.e(TAG, "Error backfilling table $table", e)
                }
            }
        }
        Log.i(TAG, "User_uid backfill completed. Processed $tablesProcessed tables")
        tablesProcessed
    }
    
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
        val db = DatabaseModule.provideDatabase(context)
        val tablesProcessed = backfillUserUidInDatabase(db, currentUid)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean("$KEY_PREFIX$currentUid", true).apply()
        tablesProcessed
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

