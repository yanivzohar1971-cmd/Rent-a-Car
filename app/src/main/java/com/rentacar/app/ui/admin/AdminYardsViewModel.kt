package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.admin.AdminFunctionsRepository
import com.rentacar.app.data.admin.YardRegistry
import com.rentacar.app.data.admin.YardStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminYardsUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val yards: List<YardRegistry> = emptyList(),
    val selectedStatus: YardStatus? = null,
    val searchQuery: String = "",
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false
)

class AdminYardsViewModel(
    private val repository: AdminFunctionsRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "AdminYardsViewModel"
    }
    
    private val _uiState = MutableStateFlow(AdminYardsUiState())
    val uiState: StateFlow<AdminYardsUiState> = _uiState.asStateFlow()
    
    private var lastYardUid: String? = null
    
    init {
        loadYards()
    }
    
    fun loadYards() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            lastYardUid = null
            try {
                val result = repository.listYards(
                    status = _uiState.value.selectedStatus,
                    search = _uiState.value.searchQuery.takeIf { it.isNotBlank() },
                    limit = 50
                )
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    yards = result.yards,
                    hasMore = result.hasMore
                )
                lastYardUid = result.lastYardUid
            } catch (e: Exception) {
                Log.e(TAG, "Error loading yards", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת מגרשים: ${e.message}"
                )
            }
        }
    }
    
    fun loadMore() {
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMore || lastYardUid == null) {
            return
        }
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingMore = true)
            try {
                val result = repository.listYards(
                    status = _uiState.value.selectedStatus,
                    search = _uiState.value.searchQuery.takeIf { it.isNotBlank() },
                    limit = 50,
                    startAfter = lastYardUid
                )
                _uiState.value = _uiState.value.copy(
                    isLoadingMore = false,
                    yards = _uiState.value.yards + result.yards,
                    hasMore = result.hasMore
                )
                lastYardUid = result.lastYardUid
            } catch (e: Exception) {
                Log.e(TAG, "Error loading more yards", e)
                _uiState.value = _uiState.value.copy(
                    isLoadingMore = false,
                    errorMessage = "שגיאה בטעינת מגרשים נוספים: ${e.message}"
                )
            }
        }
    }
    
    fun setStatusFilter(status: YardStatus?) {
        _uiState.value = _uiState.value.copy(selectedStatus = status)
        loadYards()
    }
    
    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }
    
    fun performSearch() {
        loadYards()
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
    
    fun refreshYard(yardUid: String, updatedYard: YardRegistry) {
        val yards = _uiState.value.yards.toMutableList()
        val index = yards.indexOfFirst { it.yardUid == yardUid }
        if (index >= 0) {
            yards[index] = updatedYard
            _uiState.value = _uiState.value.copy(yards = yards)
        }
    }
}

