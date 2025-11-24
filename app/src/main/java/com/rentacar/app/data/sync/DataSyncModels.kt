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

