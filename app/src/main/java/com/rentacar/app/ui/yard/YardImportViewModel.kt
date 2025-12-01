package com.rentacar.app.ui.yard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.yard.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ImportStatus {
    IDLE,
    UPLOADING,
    WAITING_FOR_PREVIEW,
    PREVIEW_READY,
    COMMITTING,
    COMMITTED,
    FAILED
}

data class YardImportUiState(
    val currentJobId: String? = null,
    val status: ImportStatus = ImportStatus.IDLE,
    val summary: YardImportSummary? = null,
    val previewRows: List<YardImportPreviewRow> = emptyList(),
    val errorMessage: String? = null,
    val isUploading: Boolean = false,
    val isCommitting: Boolean = false,
    val lastStats: YardImportStats? = null
)

class YardImportViewModel(
    private val repository: YardImportRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(YardImportUiState())
    val uiState: StateFlow<YardImportUiState> = _uiState

    private var observeJob: Job? = null

    fun startImport(fileName: String, onUploadPathReady: (jobId: String, uploadPath: String) -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(status = ImportStatus.UPLOADING, isUploading = true, errorMessage = null) }
            val result = repository.createImportJob(fileName)
            result.onSuccess { init ->
                _uiState.update {
                    it.copy(
                        currentJobId = init.jobId,
                        status = ImportStatus.UPLOADING,
                        isUploading = true
                    )
                }
                onUploadPathReady(init.jobId, init.uploadPath)
            }.onFailure { e ->
                _uiState.update {
                    it.copy(
                        status = ImportStatus.FAILED,
                        isUploading = false,
                        errorMessage = e.message ?: "Import job creation failed"
                    )
                }
            }
        }
    }

    fun beginWaitingForPreview(jobId: String) {
        observeJob?.cancel()
        observeJob = viewModelScope.launch {
            _uiState.update { it.copy(status = ImportStatus.WAITING_FOR_PREVIEW, isUploading = false) }
            try {
                repository.observeImportJob(jobId).collect { job ->
                    _uiState.update { state ->
                        // Don't override COMMITTING status while commit is in progress
                        // Allow status transitions only from IDLE/UPLOADING/WAITING_FOR_PREVIEW
                        val newStatus = when {
                            state.status == ImportStatus.COMMITTING -> {
                                // Keep COMMITTING until job status becomes COMMITTED or FAILED
                                when (job.status) {
                                    "COMMITTED" -> ImportStatus.COMMITTED
                                    "FAILED" -> ImportStatus.FAILED
                                    else -> ImportStatus.COMMITTING
                                }
                            }
                            else -> when (job.status) {
                                "PREVIEW_READY" -> ImportStatus.PREVIEW_READY
                                "COMMITTED" -> ImportStatus.COMMITTED
                                "FAILED" -> ImportStatus.FAILED
                                else -> state.status
                            }
                        }
                        
                        // When status becomes COMMITTED via observeImportJob, compute stats if not already computed
                        val updatedStats = if (newStatus == ImportStatus.COMMITTED && state.lastStats == null) {
                            computeStats(state.copy(summary = job.summary))
                        } else {
                            state.lastStats
                        }
                        
                        state.copy(
                            summary = job.summary,
                            status = newStatus,
                            errorMessage = job.error?.message,
                            lastStats = updatedStats
                        )
                    }
                    if (job.status == "PREVIEW_READY" && _uiState.value.status != ImportStatus.PREVIEW_READY) {
                        loadPreview(job.jobId)
                    }
                }
            } catch (e: Exception) {
                // Handle any errors during observation (network errors, Firestore errors, etc.)
                _uiState.update {
                    it.copy(
                        status = ImportStatus.FAILED,
                        isUploading = false,
                        errorMessage = e.message ?: "שגיאה בעת מעקב אחר עבודת הייבוא"
                    )
                }
            }
        }
    }

    private fun loadPreview(jobId: String) {
        viewModelScope.launch {
            val result = repository.loadPreviewRows(jobId)
            result.onSuccess { rows ->
                _uiState.update { it.copy(previewRows = rows) }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(
                        status = ImportStatus.FAILED,
                        errorMessage = e.message ?: "שגיאה בטעינת תצוגה מקדימה"
                    )
                }
            }
        }
    }

    fun commitImport() {
        val jobId = _uiState.value.currentJobId ?: return
        viewModelScope.launch {
            _uiState.update { 
                it.copy(
                    status = ImportStatus.COMMITTING,
                    isCommitting = true, 
                    errorMessage = null
                ) 
            }
            val result = repository.commitImport(jobId)
            result.onSuccess {
                // Compute statistics from current state
                val stats = computeStats(_uiState.value)
                _uiState.update { 
                    it.copy(
                        status = ImportStatus.COMMITTED, 
                        isCommitting = false,
                        lastStats = stats
                    ) 
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(
                        status = ImportStatus.FAILED,
                        isCommitting = false,
                        errorMessage = e.message ?: "Failed to commit import"
                    )
                }
            }
        }
    }

    /**
     * Compute statistics from preview rows and summary
     */
    private fun computeStats(state: YardImportUiState): YardImportStats {
        val summary = state.summary ?: YardImportSummary()
        val previewRows = state.previewRows
        
        // Filter to valid rows only (rows without blocking errors)
        val validRows = previewRows.filter { row ->
            row.issues.none { it.level == "ERROR" }
        }
        
        // Compute top models from valid rows only
        val modelsMap = validRows
            .mapNotNull { it.normalized.model }
            .filter { it.isNotBlank() }
            .groupingBy { it }
            .eachCount()
        val topModels = modelsMap
            .toList()
            .sortedByDescending { it.second }
            .take(3)
        
        // Compute top manufacturers from valid rows only
        val manufacturersMap = validRows
            .mapNotNull { it.normalized.manufacturer }
            .filter { it.isNotBlank() }
            .groupingBy { it }
            .eachCount()
        val topManufacturers = manufacturersMap
            .toList()
            .sortedByDescending { it.second }
            .take(3)
        
        return YardImportStats(
            totalRows = summary.rowsTotal,
            validRows = summary.rowsValid,
            carsCreated = summary.carsToCreate,
            carsUpdated = summary.carsToUpdate,
            topModels = topModels,
            topManufacturers = topManufacturers
        )
    }

    /**
     * Get top models (helper for UI)
     */
    fun getTopModels(limit: Int = 3): List<Pair<String, Int>> {
        val state = _uiState.value
        return state.previewRows
            .mapNotNull { it.normalized.model }
            .filter { it.isNotBlank() }
            .groupingBy { it }
            .eachCount()
            .toList()
            .sortedByDescending { it.second }
            .take(limit)
    }

    /**
     * Get top manufacturers (helper for UI)
     */
    fun getTopManufacturers(limit: Int = 3): List<Pair<String, Int>> {
        val state = _uiState.value
        return state.previewRows
            .mapNotNull { it.normalized.manufacturer }
            .filter { it.isNotBlank() }
            .groupingBy { it }
            .eachCount()
            .toList()
            .sortedByDescending { it.second }
            .take(limit)
    }

    /**
     * Reset the import state to allow starting a new import.
     * Cancels any ongoing observation and resets all import-specific fields.
     */
    fun resetForNewImport() {
        observeJob?.cancel()
        observeJob = null
        _uiState.update {
            YardImportUiState()
        }
    }
}

