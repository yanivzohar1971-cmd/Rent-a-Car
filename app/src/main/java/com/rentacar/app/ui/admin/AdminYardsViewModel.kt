package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.admin.AdminRepository
import com.rentacar.app.data.admin.AdminYardSummary
import com.rentacar.app.data.admin.YardStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AdminYardsUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val items: List<AdminYardSummary> = emptyList(),
    val selectedStatus: YardStatus? = YardStatus.PENDING,
    val searchQuery: String = "",
    val nextPageToken: String? = null
)

class AdminYardsViewModel(
    private val repository: AdminRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "AdminYardsViewModel"
    }
    
    private val _uiState = MutableStateFlow(AdminYardsUiState())
    val uiState: StateFlow<AdminYardsUiState> = _uiState.asStateFlow()
    
    init {
        loadYards()
    }
    
    fun loadYards() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            repository.listYards(
                status = _uiState.value.selectedStatus,
                searchQuery = _uiState.value.searchQuery.takeIf { it.isNotBlank() },
                pageToken = null
            ).fold(
                onSuccess = { page ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        items = page.items,
                        nextPageToken = page.nextPageToken
                    )
                },
                onFailure = { e ->
                    Log.e(TAG, "Error loading yards", e)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת מגרשים: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun loadMore() {
        val currentToken = _uiState.value.nextPageToken
        if (currentToken == null) {
            return
        }
        
        viewModelScope.launch {
            repository.listYards(
                status = _uiState.value.selectedStatus,
                searchQuery = _uiState.value.searchQuery.takeIf { it.isNotBlank() },
                pageToken = currentToken
            ).fold(
                onSuccess = { page ->
                    _uiState.value = _uiState.value.copy(
                        items = _uiState.value.items + page.items,
                        nextPageToken = page.nextPageToken
                    )
                },
                onFailure = { e ->
                    Log.e(TAG, "Error loading more yards", e)
                    _uiState.value = _uiState.value.copy(
                        errorMessage = "שגיאה בטעינת מגרשים נוספים: ${e.message}"
                    )
                }
            )
        }
    }
    
    fun onStatusFilterChanged(status: YardStatus?) {
        _uiState.value = _uiState.value.copy(selectedStatus = status)
        loadYards()
    }
    
    fun onSearchQueryChanged(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }
    
    fun performSearch() {
        loadYards()
    }
    
    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}

