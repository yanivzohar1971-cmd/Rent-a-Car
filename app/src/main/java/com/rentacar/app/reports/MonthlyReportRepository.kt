package com.rentacar.app.reports

import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierMonthlyDeal
import com.rentacar.app.data.SupplierMonthlyDealDao
import com.rentacar.app.reports.dto.AgentBreakdownDto
import com.rentacar.app.reports.dto.MonthlySummaryDto
import com.rentacar.app.reports.dto.MonthlyReportResult
import kotlinx.coroutines.flow.firstOrNull

class MonthlyReportRepository(
    private val supplierMonthlyDealDao: SupplierMonthlyDealDao,
    private val supplierDao: SupplierDao
) {
    
    suspend fun loadMonthlyReport(
        supplierId: Long,
        year: Int,
        month: Int
    ): MonthlyReportResult {
        val supplierName = supplierDao.getSupplierNameById(supplierId) ?: "ספק לא ידוע"
        val allDeals = supplierMonthlyDealDao.getBySupplierAndPeriod(supplierId, year, month)
            .firstOrNull() ?: emptyList()
        
        // Calculate summary
        val summary = calculateSummary(allDeals)
        
        // Calculate agent breakdown
        val agentBreakdown = calculateAgentBreakdown(allDeals)
        
        return MonthlyReportResult(
            supplierName = supplierName,
            year = year,
            month = month,
            summary = summary,
            agentBreakdown = agentBreakdown
        )
    }
    
    private fun calculateSummary(deals: List<SupplierMonthlyDeal>): MonthlySummaryDto {
        val totalDeals = deals.size
        var totalConfirmed = 0
        var totalPaid = 0
        var totalCancelled = 0
        
        deals.forEach { deal ->
            when (classifyStatus(deal.statusName)) {
                "Paid" -> totalPaid++
                "Cancelled" -> totalCancelled++
                else -> totalConfirmed++
            }
        }
        
        val totalGrossAmount = deals.sumOf { it.totalAmount }
        val totalCommissionAmount = deals.sumOf { it.commissionAmount }
        
        return MonthlySummaryDto(
            totalDeals = totalDeals,
            totalConfirmed = totalConfirmed,
            totalPaid = totalPaid,
            totalCancelled = totalCancelled,
            totalGrossAmount = totalGrossAmount,
            totalCommissionAmount = totalCommissionAmount
        )
    }
    
    private fun calculateAgentBreakdown(deals: List<SupplierMonthlyDeal>): List<AgentBreakdownDto> {
        return deals.groupBy { it.agentName }
            .map { (agentName, agentDeals) ->
                var paidCount = 0
                var cancelledCount = 0
                var confirmedCount = 0
                
                agentDeals.forEach { deal ->
                    when (classifyStatus(deal.statusName)) {
                        "Paid" -> paidCount++
                        "Cancelled" -> cancelledCount++
                        else -> confirmedCount++
                    }
                }
                
                AgentBreakdownDto(
                    agentName = agentName,
                    dealsCount = agentDeals.size,
                    grossAmountSum = agentDeals.sumOf { it.totalAmount },
                    commissionSum = agentDeals.sumOf { it.commissionAmount },
                    paidCount = paidCount,
                    cancelledCount = cancelledCount,
                    confirmedCount = confirmedCount
                )
            }
            .sortedByDescending { it.grossAmountSum }
    }
    
    private fun classifyStatus(statusName: String?): String {
        val status = statusName?.trim()?.lowercase() ?: return "Confirmed"
        
        return when {
            status.contains("בוטל") || status.contains("cancel") || status.contains("מבוטל") -> "Cancelled"
            status.contains("שולם") || status.contains("paid") || 
            status.contains("סגור") || status.contains("closed") -> "Paid"
            else -> "Confirmed"
        }
    }
}

