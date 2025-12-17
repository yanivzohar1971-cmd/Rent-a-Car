package com.rentacar.app.data.debug

import android.database.Cursor
import android.util.Log
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.rentacar.app.data.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Data class representing a database table definition for debug browsing.
 */
data class DebugTableDefinition(
    val tableName: String,      // actual SQL table name
    val displayName: String     // human-readable / Hebrew label for UI
)

/**
 * Data class representing table data for display.
 */
data class DebugTableData(
    val columns: List<String>,          // column names
    val rows: List<List<String?>>      // each row is list of stringified values
)

/**
 * Repository for browsing database tables in debug mode (read-only).
 */
class DebugDatabaseRepository(
    private val db: AppDatabase
) {
    companion object {
        private const val TAG = "DebugDatabaseRepository"
        
        /**
         * Map of known table names to friendly Hebrew display names.
         * Tables not in this map will use their raw table name as display name.
         */
        private val friendlyNames = mapOf(
            "Customer" to "לקוחות",
            "Supplier" to "ספקים",
            "Branch" to "סניפים",
            "CarType" to "סוגי רכב",
            "Reservation" to "הזמנות",
            "Payment" to "תשלומים",
            "CardStub" to "סטובס כרטיסים",
            "CommissionRule" to "כללי עמלה",
            "Agent" to "סוכנים",
            "Request" to "בקשות",
            "CarSale" to "מכירות רכב",
            "supplier_template" to "תבניות ספקים",
            "supplier_monthly_header" to "כותרות חודשיות",
            "supplier_monthly_deal" to "עסקאות חודשיות",
            "supplier_import_run" to "ריצות יבוא",
            "supplier_import_run_entry" to "רשומות יבוא",
            "supplier_price_list_header" to "כותרות מחירונים",
            "supplier_price_list_item" to "פריטי מחירונים",
            "sync_queue" to "תור סנכרון"
        )
    }
    
    /**
     * Dynamically queries sqlite_master to discover all user tables in the database.
     * Filters out internal Room/Android/sqlite system tables.
     * 
     * @return List of DebugTableDefinition for all user tables, or empty list on error
     */
    suspend fun getTables(): List<DebugTableDefinition> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Querying sqlite_master for table list")
            
            val database = db.openHelper.readableDatabase
            val query = androidx.sqlite.db.SimpleSQLiteQuery(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'android_%'
                  AND name NOT LIKE 'room_%'
                  AND name NOT LIKE 'sqlite_%'
                  AND name NOT LIKE 'FTS_%'
                  AND name != 'room_master_table'
                ORDER BY name
                """.trimIndent()
            )
            val cursor = database.query(query)
            
            try {
                val tables = mutableListOf<DebugTableDefinition>()
                if (cursor.moveToFirst()) {
                    do {
                        val tableName = cursor.getString(0)
                        val displayName = friendlyNames[tableName] ?: tableName
                        tables.add(DebugTableDefinition(tableName, displayName))
                    } while (cursor.moveToNext())
                }
                
                Log.d(TAG, "Found ${tables.size} user tables: ${tables.map { it.tableName }}")
                return@withContext tables
            } finally {
                cursor.close()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying sqlite_master for tables", e)
            return@withContext emptyList()
        }
    }
    
    /**
     * Loads table data from the database (read-only, limited to 500 rows).
     * 
     * @param tableName The actual SQL table name
     * @param limit Maximum number of rows to load (default 500)
     * @return DebugTableData with columns and rows, or empty data on error
     */
    suspend fun loadTableData(
        tableName: String,
        limit: Int = 500
    ): DebugTableData = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Loading table data for: $tableName (limit=$limit)")
            
            val database = db.openHelper.readableDatabase
            val query = androidx.sqlite.db.SimpleSQLiteQuery("SELECT * FROM $tableName LIMIT $limit")
            val cursor = database.query(query)
            
            try {
                val columnCount = cursor.columnCount
                val columns = mutableListOf<String>()
                
                // Extract column names
                for (i in 0 until columnCount) {
                    columns.add(cursor.getColumnName(i))
                }
                
                // Extract rows
                val rows = mutableListOf<List<String?>>()
                if (cursor.moveToFirst()) {
                    do {
                        val row = mutableListOf<String?>()
                        for (i in 0 until columnCount) {
                            val value = when (cursor.getType(i)) {
                                Cursor.FIELD_TYPE_NULL -> null
                                Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(i).toString()
                                Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(i).toString()
                                Cursor.FIELD_TYPE_STRING -> cursor.getString(i)
                                Cursor.FIELD_TYPE_BLOB -> "[BLOB]"
                                else -> cursor.getString(i) ?: "NULL"
                            }
                            row.add(value)
                        }
                        rows.add(row)
                    } while (cursor.moveToNext())
                }
                
                Log.d(TAG, "Loaded ${rows.size} rows from $tableName with ${columns.size} columns")
                
                return@withContext DebugTableData(
                    columns = columns,
                    rows = rows
                )
            } finally {
                cursor.close()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading table data for $tableName", e)
            return@withContext DebugTableData(
                columns = emptyList(),
                rows = emptyList()
            )
        }
    }
}

