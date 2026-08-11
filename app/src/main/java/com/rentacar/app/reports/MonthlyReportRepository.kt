package com.rentacar.app.reports

import com.rentacar.app.data.Agent
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierMonthlyDeal
import com.rentacar.app.data.SupplierMonthlyDealDao
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.domain.CommissionCalculationService
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
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val supplierName = supplierDao.getSupplierNameById(supplierId, currentUid) ?: "ספק לא ידוע"
        val allDeals = supplierMonthlyDealDao.getBySupplierAndPeriod(supplierId, year, month, currentUid)
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

    /**
     * Load monthly report from CommissionCalculationService + reservations (source of truth).
     * Totals match main Commissions screen and Excel export installment logic.
     */
    suspend fun loadMonthlyReportFromReservations(
        supplierId: Long,
        year: Int,
        month: Int,
        reservations: List<Reservation>,
        agents: List<Agent>
    ): MonthlyReportResult {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val supplierName = supplierDao.getSupplierNameById(supplierId, currentUid) ?: "ספק לא ידוע"
        val payoutMonth = "${year}-${month.toString().padStart(2, '0')}"
        val installments = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
            payoutMonth = payoutMonth,
            reservations = reservations,
            supplierFilter = supplierId,
            statusFilter = null
        )
        val reservationMap = reservations.associateBy { it.id }
        val agentMap = agents.associateBy { it.id }
        val orderIds = installments.map { it.orderId }.distinct()

        val totalDeals = orderIds.size
        val totalCommissionAmount = CommissionCalculationService.getTotalCommission(installments)
        val totalGrossAmount = orderIds.sumOf { id -> reservationMap[id]?.agreedPrice ?: 0.0 }
        var totalPaid = 0
        var totalCancelled = 0
        var totalConfirmed = 0
        orderIds.forEach { id ->
            val r = reservationMap[id] ?: return@forEach
            when {
                r.isClosed || r.status == com.rentacar.app.data.ReservationStatus.Paid -> totalPaid++
                r.status == com.rentacar.app.data.ReservationStatus.Cancelled -> totalCancelled++
                else -> totalConfirmed++
            }
        }

        val summary = MonthlySummaryDto(
            totalDeals = totalDeals,
            totalConfirmed = totalConfirmed,
            totalPaid = totalPaid,
            totalCancelled = totalCancelled,
            totalGrossAmount = totalGrossAmount,
            totalCommissionAmount = totalCommissionAmount
        )

        val byAgentId = orderIds
            .mapNotNull { id -> reservationMap[id]?.agentId?.let { aid -> id to aid } }
            .groupBy({ it.second }, { it.first })
        val agentBreakdown = byAgentId.map { (agentId, ids) ->
            val agentReservations = ids.mapNotNull { reservationMap[it] }
            val agentInstallments = installments.filter { it.orderId in ids }
            var paidCount = 0
            var cancelledCount = 0
            var confirmedCount = 0
            agentReservations.forEach { r ->
                when {
                    r.isClosed || r.status == com.rentacar.app.data.ReservationStatus.Paid -> paidCount++
                    r.status == com.rentacar.app.data.ReservationStatus.Cancelled -> cancelledCount++
                    else -> confirmedCount++
                }
            }
            AgentBreakdownDto(
                agentName = agentMap[agentId]?.name ?: "לא ידוע",
                dealsCount = ids.size,
                grossAmountSum = agentReservations.sumOf { it.agreedPrice },
                commissionSum = CommissionCalculationService.getTotalCommission(agentInstallments),
                paidCount = paidCount,
                cancelledCount = cancelledCount,
                confirmedCount = confirmedCount
            )
        }.sortedByDescending { it.grossAmountSum }

        return MonthlyReportResult(
            supplierName = supplierName,
            year = year,
            month = month,
            summary = summary,
            agentBreakdown = agentBreakdown
        )
    }
}

