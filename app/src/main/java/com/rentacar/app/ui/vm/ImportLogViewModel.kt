package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.ImportLogDao
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.*

data class RunUi(
    val runId: Long,
    val timestamp: String,
    val fileName: String,
    val summary: String
)

enum class ImportAction {
    CREATED, UPDATED, SKIPPED_NO_CHANGE, ERROR
}

data class EntryUi(
    val rowNumber: Int,
    val contractNumber: String,
    val action: ImportAction,
    val actionLabel: String,
    val amount: Double?,
    val amountFormatted: String?,
    val notes: String?
)

data class ImportLogUiState(
    val runs: List<RunUi> = emptyList(),
    val selectedRun: RunUi? = null,
    val entries: List<EntryUi> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class ImportLogViewModel(
    private val importLogDao: ImportLogDao
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(ImportLogUiState())
    val uiState: StateFlow<ImportLogUiState> = _uiState.asStateFlow()
    
    private val dateFormatter = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("he", "IL"))
    private val amountFormatter = DecimalFormat("#,##0.00")
    
    fun loadRunsForSupplier(supplierId: Long) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val currentUid = CurrentUserProvider.requireCurrentUid()
                val runs = importLogDao.getRunsForSupplier(supplierId, currentUid)
                val runUiList = runs.map { run ->
                    val timestamp = dateFormatter.format(Date(run.importTime))
                    val summary = buildSummary(run)
                    RunUi(
                        runId = run.id,
                        timestamp = timestamp,
                        fileName = run.fileName,
                        summary = summary
                    )
                }
                _uiState.value = _uiState.value.copy(
                    runs = runUiList,
                    isLoading = false
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת לוג: ${e.message}"
                )
            }
        }
    }
    
    fun selectRun(runId: Long) {
        viewModelScope.launch {
            try {
                val currentUid = CurrentUserProvider.requireCurrentUid()
                val entries = importLogDao.getEntriesForRun(runId, currentUid)
                val entryUiList = entries.map { entry ->
                    val action = mapActionToEnum(entry.actionTaken)
                    EntryUi(
                        rowNumber = entry.rowNumberInFile,
                        contractNumber = entry.externalContractNumber ?: "---",
                        action = action,
                        actionLabel = mapActionToHebrew(entry.actionTaken),
                        amount = entry.amount,
                        amountFormatted = entry.amount?.let { "₪${amountFormatter.format(it)}" },
                        notes = entry.notes
                    )
                }
                val selectedRun = _uiState.value.runs.find { it.runId == runId }
                _uiState.value = _uiState.value.copy(
                    selectedRun = selectedRun,
                    entries = entryUiList
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    errorMessage = "שגיאה בטעינת פרטים: ${e.message}"
                )
            }
        }
    }
    
    fun clearSelection() {
        _uiState.value = _uiState.value.copy(selectedRun = null, entries = emptyList())
    }
    
    private fun buildSummary(run: com.rentacar.app.data.SupplierImportRun): String {
        return buildString {
            append("נקלטו ${run.rowsProcessed} שורות\n")
            append("נוצרו ${run.rowsCreated} | עודכנו ${run.rowsUpdated} | נסגרו ${run.rowsClosed} | בוטלו ${run.rowsCancelled} | דולגו ${run.rowsSkipped}")
        }
    }
    
    private fun mapActionToEnum(action: String): ImportAction {
        return when (action.uppercase()) {
            "CREATED" -> ImportAction.CREATED
            "UPDATED", "CLOSED", "CANCELLED" -> ImportAction.UPDATED
            "SKIPPED_NO_CHANGE" -> ImportAction.SKIPPED_NO_CHANGE
            else -> ImportAction.ERROR
        }
    }
    
    private fun mapActionToHebrew(action: String): String {
        return when (action.uppercase()) {
            "CREATED" -> "נוצרה הזמנה חדשה"
            "UPDATED" -> "עודכנה הזמנה קיימת"
            "CLOSED" -> "נסגרה"
            "CANCELLED" -> "בוטלה"
            "SKIPPED_NO_CHANGE" -> "רשומה זהה קיימת כבר (ללא שינוי)"
            "ERROR" -> "שגיאה"
            else -> action
        }
    }
}

