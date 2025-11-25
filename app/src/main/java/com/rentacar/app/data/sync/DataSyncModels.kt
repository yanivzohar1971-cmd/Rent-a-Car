package com.rentacar.app.data.sync

enum class SyncCategoryStatus {
    OK,
    WARNING,
    ERROR
}

data class SyncCategorySummary(
    val key: String,
    val displayName: String,
    val localCount: Int?,
    val cloudCount: Int?,
    val status: SyncCategoryStatus,
    val message: String? = null
)

data class SyncCheckSummary(
    val categories: List<SyncCategorySummary>,
    val hasDifferences: Boolean,
    val hasErrors: Boolean,
    val localTotal: Int,
    val cloudTotal: Int
) {
    companion object {
        fun create(categories: List<SyncCategorySummary>): SyncCheckSummary {
            val hasDifferences = categories.any { it.status == SyncCategoryStatus.WARNING }
            val hasErrors = categories.any { it.status == SyncCategoryStatus.ERROR }
            val localTotal = categories.mapNotNull { it.localCount }.sum()
            val cloudTotal = categories.mapNotNull { it.cloudCount }.sum()
            return SyncCheckSummary(
                categories = categories,
                hasDifferences = hasDifferences,
                hasErrors = hasErrors,
                localTotal = localTotal,
                cloudTotal = cloudTotal
            )
        }
    }
}

/**
 * Progress state for data sync operations.
 * Used to report real-time progress during sync of all dirty items to Firestore.
 */
data class SyncProgressState(
    val isRunning: Boolean = false,
    val currentTableIndex: Int = 0,          // 1-based index of current table being synced
    val totalTables: Int = 0,                // Total number of tables with dirty items
    val currentTableName: String? = null,    // Display name of current table (e.g. "הזמנות")
    val currentTableItemIndex: Int = 0,      // 1-based index of current item in current table
    val currentTableItemTotal: Int = 0,     // Total items to sync in current table
    val overallProcessedItems: Int = 0,     // Total items processed across all tables
    val overallTotalItems: Int = 0,         // Total items to sync across all tables
    val tablePercent: Float = 0f,           // Progress for current table (0f..1f)
    val overallPercent: Float = 0f,          // Overall progress across all tables (0f..1f)
    val lastMessage: String? = null,        // Last status message (e.g. synced ID or error)
    val isError: Boolean = false             // True if sync failed with a fatal error
) {
    companion object {
        /**
         * Creates initial state (not running, all zeros)
         */
        fun idle() = SyncProgressState()
        
        /**
         * Creates state for sync start with total counts
         */
        fun starting(totalTables: Int, totalItems: Int) = SyncProgressState(
            isRunning = true,
            totalTables = totalTables,
            overallTotalItems = totalItems
        )
        
        /**
         * Creates state for sync completion
         */
        fun completed(processedItems: Int, totalItems: Int) = SyncProgressState(
            isRunning = false,
            overallProcessedItems = processedItems,
            overallTotalItems = totalItems,
            overallPercent = if (totalItems > 0) 1f else 0f,
            lastMessage = "סנכרון הושלם בהצלחה"
        )
        
        /**
         * Creates state for sync error
         */
        fun error(message: String) = SyncProgressState(
            isRunning = false,
            isError = true,
            lastMessage = message
        )
    }
}

