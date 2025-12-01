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
    val isCommitting: Boolean = false
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
            repository.observeImportJob(jobId).collect { job ->
                _uiState.update { state ->
                    state.copy(
                        summary = job.summary,
                        status = when (job.status) {
                            "PREVIEW_READY" -> ImportStatus.PREVIEW_READY
                            "COMMITTED" -> ImportStatus.COMMITTED
                            "FAILED" -> ImportStatus.FAILED
                            else -> state.status
                        },
                        errorMessage = job.error?.message
                    )
                }
                if (job.status == "PREVIEW_READY") {
                    loadPreview(job.jobId)
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
                _uiState.update { it.copy(errorMessage = e.message ?: "Failed to load preview rows") }
            }
        }
    }

    fun commitImport() {
        val jobId = _uiState.value.currentJobId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isCommitting = true, errorMessage = null) }
            val result = repository.commitImport(jobId)
            result.onSuccess {
                _uiState.update { it.copy(status = ImportStatus.COMMITTED, isCommitting = false) }
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
}

