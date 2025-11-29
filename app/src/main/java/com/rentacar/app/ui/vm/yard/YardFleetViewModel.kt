package com.rentacar.app.ui.vm.yard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.YardFleetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

/**
 * Data class representing a car in the yard's fleet
 */
data class YardCarItem(
    val id: String,
    val brand: String,
    val model: String,
    val year: Int?,
    val price: Int?,
    val mileageKm: Int? = null,
    val status: YardCarStatus
)

/**
 * Status enum for yard cars
 */
enum class YardCarStatus {
    DRAFT,
    PUBLISHED,
    HIDDEN
}

/**
 * UI state for Yard Fleet Screen
 */
data class YardFleetUiState(
    val isLoading: Boolean = true,
    val items: List<YardCarItem> = emptyList(),
    val errorMessage: String? = null
)

/**
 * ViewModel for Yard Fleet Screen
 * Uses YardFleetRepository to fetch real fleet data
 */
class YardFleetViewModel(
    private val repository: YardFleetRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(YardFleetUiState(isLoading = true))
    val uiState: StateFlow<YardFleetUiState> = _uiState.asStateFlow()
    
    init {
        loadFleet()
    }
    
    /**
     * Load fleet data from repository
     */
    private fun loadFleet() {
        viewModelScope.launch {
            repository.getYardFleetStream()
                .catch { exception ->
                    android.util.Log.e("YardFleetViewModel", "Error loading fleet", exception)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת הנתונים: ${exception.message}"
                    )
                }
                .collect { items ->
                    _uiState.value = YardFleetUiState(
                        isLoading = false,
                        items = items,
                        errorMessage = null
                    )
                }
        }
    }
    
    /**
     * Refresh fleet data
     * TODO: If repository supports explicit refresh (e.g., trigger sync with Firestore), call it here
     */
    fun refreshFleet() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        loadFleet()
    }
}

