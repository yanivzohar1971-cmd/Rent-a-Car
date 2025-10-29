package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.reports.MonthlyReportRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

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
    val errorMessage: String? = null
)

class MonthlyReportViewModel(
    private val monthlyReportRepository: MonthlyReportRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(MonthlyReportUiState())
    val uiState: StateFlow<MonthlyReportUiState> = _uiState.asStateFlow()
    
    fun loadReport(supplierId: Long, year: Int, month: Int) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            
            try {
                val result = monthlyReportRepository.loadMonthlyReport(supplierId, year, month)
                
                val agents = result.agentBreakdown.map { agent ->
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
                    agents = agents,
                    errorMessage = null
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת הדוח: ${e.message}"
                )
            }
        }
    }
}

