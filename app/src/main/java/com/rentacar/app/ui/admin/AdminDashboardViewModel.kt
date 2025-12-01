package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.admin.AdminFunctionsRepository
import com.rentacar.app.data.admin.DashboardData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminDashboardUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val dashboardData: DashboardData? = null
)

class AdminDashboardViewModel(
    private val repository: AdminFunctionsRepository
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
            try {
                val data = repository.getDashboard()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    dashboardData = data
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error loading dashboard", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת הלוח: ${e.message}"
                )
            }
        }
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

