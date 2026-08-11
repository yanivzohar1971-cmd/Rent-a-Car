package com.rentacar.app.data.admin

/**
 * Admin dashboard data structure matching the spec
 */
data class AdminDashboardData(
    val yards: YardsStats = YardsStats(),
    val imports: ImportStats = ImportStats(),
    val views: ViewsStats = ViewsStats(),
    val topYardsLast7d: List<TopYardItem> = emptyList(),
    val topCarsLast7d: List<TopCarItem> = emptyList()
) {
    data class YardsStats(
        val pending: Int = 0,
        val approved: Int = 0,
        val needsInfo: Int = 0,
        val rejected: Int = 0
    )

    data class ImportStats(
        val carsImportedLast7d: Int = 0,
        val carsImportedLast30d: Int = 0
    )

    data class ViewsStats(
        val totalCarViews: Int = 0,
        val carViewsLast7d: Int = 0,
        val carViewsLast30d: Int = 0
    )

    data class TopYardItem(
        val yardUid: String = "",
        val displayName: String = "",
        val views: Int = 0
    )

    data class TopCarItem(
        val yardUid: String = "",
        val yardName: String = "",
        val carId: String = "",
        val views: Int = 0
    )
}

/**
 * Yard summary for list view
 */
data class AdminYardSummary(
    val yardUid: String = "",
    val displayName: String = "",
    val city: String = "",
    val phone: String = "",
    val status: YardStatus = YardStatus.PENDING,
    val hasImportProfile: Boolean = false
)

/**
 * Yard details (core + profile subset)
 */
data class AdminYardDetails(
    val yard: AdminYardCore,
    val profile: AdminYardProfileView?
) {
    data class AdminYardCore(
        val yardUid: String = "",
        val displayName: String = "",
        val phone: String = "",
        val city: String = "",
        val status: YardStatus = YardStatus.PENDING,
        val statusReason: String? = null,
        val importerId: String? = null,
        val importerVersion: Int? = null
    )

    data class AdminYardProfileView(
        val legalName: String? = null,
        val companyId: String? = null,
        val addressCity: String? = null,
        val addressStreet: String? = null,
        val usageValidUntil: String? = null // ISO date string for display
    )
}

/**
 * Paginated yard list result
 */
data class YardListPage(
    val items: List<AdminYardSummary> = emptyList(),
    val nextPageToken: String? = null
)

