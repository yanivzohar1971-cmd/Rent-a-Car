package com.rentacar.app.data.admin

/**
 * Dashboard data structure returned from adminGetDashboard
 */
data class DashboardData(
    val system: SystemStats,
    val yards: YardCounts,
    val topYardsLast7d: List<TopYardItem>,
    val topCarsLast7d: List<TopCarItem>
)

data class SystemStats(
    val carViewsTotal: Long = 0,
    val carViewsLast7d: Long = 0,
    val carViewsLast30d: Long = 0
)

data class YardCounts(
    val pendingApproval: Int = 0,
    val approved: Int = 0
)

data class TopYardItem(
    val yardUid: String = "",
    val views: Long = 0,
    val displayName: String = ""
)

data class TopCarItem(
    val yardUid: String = "",
    val carId: String = "",
    val views: Long = 0
)

