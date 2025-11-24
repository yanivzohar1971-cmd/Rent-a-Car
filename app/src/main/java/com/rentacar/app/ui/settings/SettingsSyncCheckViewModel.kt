package com.rentacar.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.sync.DataSyncCheckRepository
import com.rentacar.app.data.sync.SyncCheckSummary
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import android.util.Log

data class SyncCheckUiState(
    val isDialogOpen: Boolean = false,
    val isLoading: Boolean = false,
    val summary: SyncCheckSummary? = null,
    val errorMessage: String? = null
)

class SettingsSyncCheckViewModel(
    private val repository: DataSyncCheckRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "SettingsSyncCheckVM"
    }
    
    private val _uiState = MutableStateFlow(SyncCheckUiState())
    val uiState: StateFlow<SyncCheckUiState> = _uiState.asStateFlow()
    
    fun onOpenSyncCheckDialog() {
        _uiState.update {
            it.copy(
                isDialogOpen = true,
                isLoading = true,
                summary = null,
                errorMessage = null
            )
        }
        
        viewModelScope.launch {
            try {
                val summary = repository.computeSyncSummary()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        summary = summary
                    )
                }
                Log.d(TAG, "Sync check completed: hasDifferences=${summary.hasDifferences}, hasErrors=${summary.hasErrors}")
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to compute sync summary", t)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        summary = null,
                        errorMessage = "Failed to compute sync status. Please try again."
                    )
                }
            }
        }
    }
    
    fun onDismissSyncCheckDialog() {
        _uiState.update {
            it.copy(isDialogOpen = false)
        }
    }
    
    fun onRetrySyncCheck() {
        if (!_uiState.value.isDialogOpen) return
        
        _uiState.update {
            it.copy(
                isLoading = true,
                summary = null,
                errorMessage = null
            )
        }
        
        viewModelScope.launch {
            try {
                val summary = repository.computeSyncSummary()
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        summary = summary
                    )
                }
            } catch (t: Throwable) {
                Log.e(TAG, "Failed to compute sync summary", t)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        summary = null,
                        errorMessage = "Failed to compute sync status. Please try again."
                    )
                }
            }
        }
    }
}

