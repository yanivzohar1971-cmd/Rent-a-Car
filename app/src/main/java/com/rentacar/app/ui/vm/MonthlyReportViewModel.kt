package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Agent
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.reports.MonthlyReportRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime

data class AgentUiRow(
    val agentName: String,
    val dealsCount: Int,
    val grossAmount: Double,
    val commissionAmount: Double,
    val paidCount: Int,
    val cancelledCount: Int,
    val confirmedCount: Int
)

data class MonthlyReportUiState(
    val isLoading: Boolean = false,
    val supplierName: String = "",
    val year: Int = 0,
    val month: Int = 0,
    val totalDeals: Int = 0,
    val totalConfirmed: Int = 0,
    val totalPaid: Int = 0,
    val totalCancelled: Int = 0,
    val totalGrossAmount: Double = 0.0,
    val totalCommissionAmount: Double = 0.0,
    val agents: List<AgentUiRow> = emptyList(),
    val errorMessage: String? = null,
    val infoMessage: String? = null,
    val earliestDataMonth: YearMonth? = null,
    val hasDataForSelectedMonth: Boolean = true
) {
    companion object {
        private val TIMEZONE = ZoneId.of("Asia/Jerusalem")
        fun initialYearMonth(year: Int, month: Int): YearMonth {
            return if (year > 0 && month in 1..12) {
                YearMonth.of(year, month)
            } else {
                YearMonth.now(TIMEZONE)
            }
        }
    }
}

class MonthlyReportViewModel(
    private val monthlyReportRepository: MonthlyReportRepository,
    initialYear: Int = 0,
    initialMonth: Int = 0
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(MonthlyReportUiState())
    val uiState: StateFlow<MonthlyReportUiState> = _uiState.asStateFlow()
    
    private val _selectedPayoutMonth = MutableStateFlow(
        MonthlyReportUiState.initialYearMonth(initialYear, initialMonth)
    )
    val selectedPayoutMonth: StateFlow<YearMonth> = _selectedPayoutMonth.asStateFlow()
    
    private var loadJob: Job? = null

    private val TIMEZONE = ZoneId.of("Asia/Jerusalem")

    fun currentPayoutMonth(): YearMonth = YearMonth.now(TIMEZONE)
    
    fun setPayoutMonth(year: Int, month1to12: Int) {
        if (month1to12 !in 1..12) return
        _selectedPayoutMonth.value = YearMonth.of(year, month1to12)
    }
    
    fun prevMonth() {
        val current = _selectedPayoutMonth.value
        val candidate = current.minusMonths(1)
        val earliest = _uiState.value.earliestDataMonth
        if (earliest != null && candidate < earliest) {
            _uiState.value = _uiState.value.copy(infoMessage = "אין נתונים לחודשים אחורה")
            return
        }
        _selectedPayoutMonth.value = candidate
        _uiState.value = _uiState.value.copy(infoMessage = null)
    }
    
    fun nextMonth() {
        val current = _selectedPayoutMonth.value
        val candidate = current.plusMonths(1)
        if (candidate > currentPayoutMonth()) return
        _selectedPayoutMonth.value = candidate
        _uiState.value = _uiState.value.copy(infoMessage = null)
    }

    /**
     * Set UI to empty state for future months (no data). Call when selectedPayoutMonth > currentMonth.
     * Cancels any in-flight load so stale data is never applied.
     */
    fun setFutureMonthEmptyState() {
        loadJob?.cancel()
        loadJob = null
        _uiState.value = _uiState.value.copy(
            isLoading = false,
            totalDeals = 0,
            totalConfirmed = 0,
            totalPaid = 0,
            totalCancelled = 0,
            totalGrossAmount = 0.0,
            totalCommissionAmount = 0.0,
            agents = emptyList(),
            errorMessage = null,
            infoMessage = "אין נתונים לחודשים עתידיים",
            hasDataForSelectedMonth = false
        )
    }
    
    /**
     * Load report for the currently selected payout month (from DB/deals).
     * Use when reservations are not available (e.g. legacy path).
     */
    fun loadReport(supplierId: Long) {
        loadJob?.cancel()
        val ym = _selectedPayoutMonth.value
        if (ym > currentPayoutMonth()) {
            setFutureMonthEmptyState()
            return
        }
        loadJob = viewModelScope.launch {
            val monthAtStart = _selectedPayoutMonth.value
            loadReportInternal(supplierId, ym.year, ym.monthValue, monthAtStart)
        }
    }
    
    /**
     * Earliest payout month that can have data for this supplier (from reservations).
     * Payout month = month after service month = YearMonth(dateFrom) + 1.
     */
    private fun computeEarliestSelectableMonthFromReservations(
        reservations: List<Reservation>,
        supplierId: Long
    ): YearMonth? {
        val filtered = reservations.filter { it.supplierId == supplierId && it.status != ReservationStatus.Cancelled }
        if (filtered.isEmpty()) return null
        return filtered.minOfOrNull { r ->
            val zdt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(r.dateFrom), TIMEZONE)
            YearMonth.of(zdt.year, zdt.monthValue).plusMonths(1)
        }
    }

    /**
     * Load report from CommissionCalculationService + reservations (source of truth).
     * Use when reservationVm data is available so totals match main Commissions screen.
     */
    fun loadReportWithReservations(
        supplierId: Long,
        reservations: List<Reservation>,
        agents: List<Agent>
    ) {
        loadJob?.cancel()
        val ym = _selectedPayoutMonth.value
        if (ym > currentPayoutMonth()) {
            setFutureMonthEmptyState()
            return
        }
        if (_uiState.value.earliestDataMonth == null) {
            val earliest = computeEarliestSelectableMonthFromReservations(reservations, supplierId)
            if (earliest != null) {
                _uiState.value = _uiState.value.copy(earliestDataMonth = earliest)
            }
        }
        loadJob = viewModelScope.launch {
            val monthAtStart = _selectedPayoutMonth.value
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, infoMessage = null)
            try {
                val result = monthlyReportRepository.loadMonthlyReportFromReservations(
                    supplierId = supplierId,
                    year = ym.year,
                    month = ym.monthValue,
                    reservations = reservations,
                    agents = agents
                )
                if (_selectedPayoutMonth.value != monthAtStart) return@launch
                applyResult(result, monthAtStart)
            } catch (e: Exception) {
                if (_selectedPayoutMonth.value != monthAtStart) return@launch
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת הדוח: ${e.message}",
                    infoMessage = null
                )
            }
        }
    }
    
    private suspend fun loadReportInternal(supplierId: Long, year: Int, month: Int, monthAtStart: YearMonth) {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, infoMessage = null)
        try {
            val result = monthlyReportRepository.loadMonthlyReport(supplierId, year, month)
            if (_selectedPayoutMonth.value != monthAtStart) return
            applyResult(result, monthAtStart)
        } catch (e: Exception) {
            if (_selectedPayoutMonth.value != monthAtStart) return
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                errorMessage = "שגיאה בטעינת הדוח: ${e.message}",
                infoMessage = null
            )
        }
    }

    private fun hasDataFromSummary(summary: com.rentacar.app.reports.dto.MonthlySummaryDto): Boolean {
        return summary.totalDeals > 0 ||
            summary.totalGrossAmount > 0 ||
            summary.totalCommissionAmount > 0 ||
            summary.totalConfirmed > 0 ||
            summary.totalPaid > 0
    }
    
    private fun applyResult(result: com.rentacar.app.reports.dto.MonthlyReportResult, forMonth: YearMonth) {
        if (_selectedPayoutMonth.value != forMonth) return
        val resultYm = YearMonth.of(result.year, result.month)
        val hasData = hasDataFromSummary(result.summary)
        val currentEarliest = _uiState.value.earliestDataMonth
        val newEarliest = if (hasData && currentEarliest != null) {
            minOf(currentEarliest, resultYm)
        } else if (hasData) {
            resultYm
        } else {
            currentEarliest
        }
        val agentRows = result.agentBreakdown.map { agent ->
            AgentUiRow(
                agentName = agent.agentName,
                dealsCount = agent.dealsCount,
                grossAmount = agent.grossAmountSum,
                commissionAmount = agent.commissionSum,
                paidCount = agent.paidCount,
                cancelledCount = agent.cancelledCount,
                confirmedCount = agent.confirmedCount
            )
        }
        val resultInfoMessage = if (!hasData) "אין נתונים לחודש זה" else null
        _uiState.value = MonthlyReportUiState(
            isLoading = false,
            supplierName = result.supplierName,
            year = result.year,
            month = result.month,
            totalDeals = result.summary.totalDeals,
            totalConfirmed = result.summary.totalConfirmed,
            totalPaid = result.summary.totalPaid,
            totalCancelled = result.summary.totalCancelled,
            totalGrossAmount = result.summary.totalGrossAmount,
            totalCommissionAmount = result.summary.totalCommissionAmount,
            agents = agentRows,
            errorMessage = null,
            infoMessage = resultInfoMessage,
            earliestDataMonth = newEarliest,
            hasDataForSelectedMonth = hasData
        )
    }
}

