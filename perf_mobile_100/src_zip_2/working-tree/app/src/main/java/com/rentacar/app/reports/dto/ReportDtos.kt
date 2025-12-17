package com.rentacar.app.reports.dto

import androidx.room.ColumnInfo

data class MonthlySummaryDto(
    @ColumnInfo(name = "totalDeals") val totalDeals: Int,
    @ColumnInfo(name = "totalConfirmed") val totalConfirmed: Int,
    @ColumnInfo(name = "totalPaid") val totalPaid: Int,
    @ColumnInfo(name = "totalCancelled") val totalCancelled: Int,
    @ColumnInfo(name = "totalGrossAmount") val totalGrossAmount: Double,
    @ColumnInfo(name = "totalCommissionAmount") val totalCommissionAmount: Double
)

data class AgentBreakdownDto(
    @ColumnInfo(name = "agentName") val agentName: String,
    @ColumnInfo(name = "dealsCount") val dealsCount: Int,
    @ColumnInfo(name = "grossAmountSum") val grossAmountSum: Double,
    @ColumnInfo(name = "commissionSum") val commissionSum: Double,
    @ColumnInfo(name = "paidCount") val paidCount: Int,
    @ColumnInfo(name = "cancelledCount") val cancelledCount: Int,
    @ColumnInfo(name = "confirmedCount") val confirmedCount: Int
)

data class MonthlyReportResult(
    val supplierName: String,
    val year: Int,
    val month: Int,
    val summary: MonthlySummaryDto,
    val agentBreakdown: List<AgentBreakdownDto>
)

