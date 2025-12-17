package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.admin.AdminRepository
import com.rentacar.app.data.admin.AdminYardDetails
import com.rentacar.app.data.admin.YardStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminYardDetailsUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val details: AdminYardDetails? = null,
    // Editable state
    val selectedStatus: YardStatus? = null,
    val statusReason: String = "",
    val selectedImporterId: String? = null,
    val importerVersion: Int = 1,
    // Saving states
    val isSavingStatus: Boolean = false,
    val isSavingImporter: Boolean = false,
    val saveSuccess: Boolean = false
)

class AdminYardDetailsViewModel(
    private val repository: AdminRepository,
    private val yardUid: String
) : ViewModel() {
    
    companion object {
        private const val TAG = "AdminYardDetailsViewModel"
    }
    
    private val _uiState = MutableStateFlow(AdminYardDetailsUiState())
    val uiState: StateFlow<AdminYardDetailsUiState> = _uiState.asStateFlow()
    
    init {
        loadYardDetails()
    }
    
    private fun loadYardDetails() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            repository.getYardDetails(yardUid).fold(
                onSuccess = { details ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        details = details,
                        selectedStatus = details.yard.status,
                        statusReason = details.yard.statusReason ?: "",
                        selectedImporterId = details.yard.importerId,
                        importerVersion = details.yard.importerVersion ?: 1
                    )
                },
                onFailure = { e ->
                    Log.e(TAG, "Error loading yard details", e)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת פרטי המגרש: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun onStatusSelected(status: YardStatus) {
        _uiState.value = _uiState.value.copy(selectedStatus = status)
    }
    
    fun onStatusReasonChanged(reason: String) {
        _uiState.value = _uiState.value.copy(statusReason = reason)
    }
    
    fun onImporterSelected(importerId: String?, version: Int = 1) {
        _uiState.value = _uiState.value.copy(
            selectedImporterId = importerId,
            importerVersion = version
        )
    }
    
    fun saveStatus() {
        val status = _uiState.value.selectedStatus ?: return
        val reason = _uiState.value.statusReason.takeIf { it.isNotBlank() }
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSavingStatus = true, errorMessage = null)
            repository.updateYardStatus(yardUid, status, reason).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isSavingStatus = false,
                        saveSuccess = true
                    )
                    // Reload to get updated data
                    loadYardDetails()
                },
                onFailure = { e ->
                    Log.e(TAG, "Error saving status", e)
                    _uiState.value = _uiState.value.copy(
                        isSavingStatus = false,
                        errorMessage = "שגיאה בשמירת סטטוס: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun saveImporter() {
        val importerId = _uiState.value.selectedImporterId ?: return
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSavingImporter = true, errorMessage = null)
            repository.assignYardImporter(
                yardUid,
                importerId,
                _uiState.value.importerVersion
            ).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isSavingImporter = false,
                        saveSuccess = true
                    )
                    // Reload to get updated data
                    loadYardDetails()
                },
                onFailure = { e ->
                    Log.e(TAG, "Error saving importer", e)
                    _uiState.value = _uiState.value.copy(
                        isSavingImporter = false,
                        errorMessage = "שגיאה בשמירת פונקציית ייבוא: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null, saveSuccess = false)
    }
}

