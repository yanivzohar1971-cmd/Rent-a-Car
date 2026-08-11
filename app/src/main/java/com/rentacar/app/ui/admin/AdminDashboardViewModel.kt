package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.admin.AdminDashboardData
import com.rentacar.app.data.admin.AdminRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminDashboardUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val data: AdminDashboardData? = null
)

class AdminDashboardViewModel(
    private val repository: AdminRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "AdminDashboardViewModel"
    }
    
    private val _uiState = MutableStateFlow(AdminDashboardUiState())
    val uiState: StateFlow<AdminDashboardUiState> = _uiState.asStateFlow()
    
    init {
        loadDashboard()
    }
    
    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            repository.getDashboard().fold(
                onSuccess = { data ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        data = data
                    )
                },
                onFailure = { e ->
                    Log.e(TAG, "Error loading dashboard", e)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת הלוח: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun refresh() {
        loadDashboard()
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

