package com.rentacar.app.ui.vm.yard

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.YardFleetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SmartPublishStats(
    val total: Int = 0,
    val draftCount: Int = 0,
    val publishedCount: Int = 0,
    val hiddenCount: Int = 0,
    val draftFromImportCount: Int = 0
)

data class YardSmartPublishUiState(
    val importJobId: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val cars: List<CarSale> = emptyList(),
    val selectedPublicationStatus: CarPublicationStatus? = null,
    val selectedManufacturer: String? = null,
    val selectedModel: String? = null,
    val stats: SmartPublishStats = SmartPublishStats()
)

class YardSmartPublishViewModel(
    private val repository: YardFleetRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "YardSmartPublish"
    }
    
    private val _uiState = MutableStateFlow(YardSmartPublishUiState())
    val uiState: StateFlow<YardSmartPublishUiState> = _uiState
    
    fun load(initialJobId: String? = null) {
        _uiState.update { it.copy(importJobId = initialJobId) }
        applyFilters()
    }
    
    fun applyFilters(
        publicationStatus: CarPublicationStatus? = null,
        manufacturer: String? = null,
        model: String? = null
    ) {
        _uiState.update {
            it.copy(
                selectedPublicationStatus = publicationStatus,
                selectedManufacturer = manufacturer,
                selectedModel = model
            )
        }
        loadCars()
    }
    
    private fun loadCars() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val cars = repository.getCarsForSmartPublish(
                    importJobId = state.importJobId,
                    publicationStatus = state.selectedPublicationStatus,
                    manufacturer = state.selectedManufacturer,
                    model = state.selectedModel
                )
                
                val stats = calculateStats(cars, state.importJobId)
                
                _uiState.update {
                    it.copy(
                        cars = cars,
                        stats = stats,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading cars for smart publish", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת הרכבים: ${e.message}"
                    )
                }
            }
        }
    }
    
    private fun calculateStats(cars: List<CarSale>, importJobId: String?): SmartPublishStats {
        var draftCount = 0
        var publishedCount = 0
        var hiddenCount = 0
        var draftFromImportCount = 0
        
        for (car in cars) {
            val status = CarPublicationStatus.fromString(car.publicationStatus)
            when (status) {
                CarPublicationStatus.DRAFT -> {
                    draftCount++
                    if (importJobId != null && car.importJobId == importJobId && car.isNewFromImport) {
                        draftFromImportCount++
                    }
                }
                CarPublicationStatus.PUBLISHED -> publishedCount++
                CarPublicationStatus.HIDDEN -> hiddenCount++
            }
        }
        
        return SmartPublishStats(
            total = cars.size,
            draftCount = draftCount,
            publishedCount = publishedCount,
            hiddenCount = hiddenCount,
            draftFromImportCount = draftFromImportCount
        )
    }
    
    fun publishAllInFilter() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val carIds = state.cars.map { it.id }
                
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.PUBLISHED)
                
                // Reload to refresh list
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error publishing all cars", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בפרסום הרכבים: ${e.message}"
                    )
                }
            }
        }
    }
    
    fun hideAllInFilter() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val carIds = state.cars.map { it.id }
                
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.HIDDEN)
                
                // Reload to refresh list
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error hiding all cars", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בהסתרת הרכבים: ${e.message}"
                    )
                }
            }
        }
    }
    
    fun draftAllInFilter() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val carIds = state.cars.map { it.id }
                
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.DRAFT)
                
                // Reload to refresh list
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error moving all cars to draft", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בהעברת הרכבים לטיוטה: ${e.message}"
                    )
                }
            }
        }
    }
    
    fun publishNewCarsFromImport() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val importJobId = state.importJobId ?: return@launch
                
                // Get only new cars from this import that are in DRAFT
                val newDraftCars = state.cars.filter { car ->
                    car.importJobId == importJobId && 
                    car.isNewFromImport && 
                    CarPublicationStatus.fromString(car.publicationStatus) == CarPublicationStatus.DRAFT
                }
                
                val carIds = newDraftCars.map { it.id }
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.PUBLISHED)
                
                // Reload to refresh list
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error publishing new cars from import", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בפרסום רכבים חדשים: ${e.message}"
                    )
                }
            }
        }
    }
}

