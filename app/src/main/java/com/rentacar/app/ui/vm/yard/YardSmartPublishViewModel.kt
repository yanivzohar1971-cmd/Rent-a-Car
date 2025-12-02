package com.rentacar.app.ui.vm.yard

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.YardFleetRepository
import com.rentacar.app.data.public.PublicCarRepository
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
    val selectedManufacturer: String? = null, // Keep for backward compatibility, but prefer selectedManufacturers
    val selectedManufacturers: Set<String> = emptySet(), // Multi-select manufacturers
    val selectedModel: String? = null,
    val selectedCarIds: Set<Long> = emptySet(), // Multi-select car cards
    val stats: SmartPublishStats = SmartPublishStats()
) {
    val selectedCount: Int get() = selectedCarIds.size
}

class YardSmartPublishViewModel(
    private val repository: YardFleetRepository,
    private val publicCarRepository: PublicCarRepository? = null // Optional - can be null for backward compatibility
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
    
    /**
     * Toggle a manufacturer in the multi-select filter.
     * If brand is already selected, remove it; otherwise add it.
     * Empty set means "all manufacturers" (no filter).
     */
    fun toggleManufacturerFilter(brand: String) {
        _uiState.update { state ->
            val current = state.selectedManufacturers.toMutableSet()
            if (brand in current) {
                current.remove(brand)
            } else {
                current.add(brand)
            }
            state.copy(
                selectedManufacturers = current,
                selectedManufacturer = null // Clear single-select when using multi-select
            )
        }
        loadCars()
    }
    
    /**
     * Clear all manufacturer filters (show all manufacturers).
     */
    fun clearManufacturerFilters() {
        _uiState.update {
            it.copy(
                selectedManufacturers = emptySet(),
                selectedManufacturer = null
            )
        }
        loadCars()
    }
    
    /**
     * Toggle car selection for multi-select bulk actions.
     */
    fun toggleCarSelection(carId: Long) {
        _uiState.update { state ->
            val current = state.selectedCarIds.toMutableSet()
            if (carId in current) {
                current.remove(carId)
            } else {
                current.add(carId)
            }
            state.copy(selectedCarIds = current)
        }
    }
    
    /**
     * Clear all car selections.
     */
    fun clearSelection() {
        _uiState.update { it.copy(selectedCarIds = emptySet()) }
    }
    
    /**
     * Select all cars currently in the filtered list.
     */
    fun selectAllInCurrentFilter() {
        _uiState.update { state ->
            state.copy(selectedCarIds = state.cars.map { it.id }.toSet())
        }
    }
    
    private fun loadCars() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                // Use multi-select manufacturers if available, otherwise fall back to single manufacturer
                val manufacturersToUse = if (state.selectedManufacturers.isNotEmpty()) {
                    state.selectedManufacturers
                } else {
                    state.selectedManufacturer?.let { setOf(it) }
                }
                
                val cars = repository.getCarsForSmartPublish(
                    importJobId = state.importJobId,
                    publicationStatus = state.selectedPublicationStatus,
                    manufacturer = null, // Use manufacturers parameter instead
                    manufacturers = manufacturersToUse,
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
                val carsToPublish = state.cars
                
                if (carsToPublish.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
                
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carsToPublish.map { it.id }, CarPublicationStatus.PUBLISHED)
                
                // Publish to publicCars collection via PublicCarRepository
                // Use the current cars list, but update each with PUBLISHED status before publishing
                if (publicCarRepository != null) {
                    var publishErrors = 0
                    for (car in carsToPublish) {
                        // Create updated car with PUBLISHED status for publishing
                        val carToPublish = car.copy(
                            publicationStatus = CarPublicationStatus.PUBLISHED.value,
                            updatedAt = System.currentTimeMillis()
                        )
                        val result = publicCarRepository.publishCar(carToPublish)
                        result.onFailure { error ->
                            publishErrors++
                            Log.e(TAG, "Error publishing car ${car.id} to publicCars", error)
                        }
                    }
                    if (publishErrors > 0) {
                        Log.w(TAG, "Failed to publish $publishErrors out of ${carsToPublish.size} cars to publicCars")
                    }
                }
                
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
                val carsToHide = state.cars
                
                if (carsToHide.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
                
                val carIds = carsToHide.map { it.id }
                
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.HIDDEN)
                
                // Unpublish from publicCars collection via PublicCarRepository
                if (publicCarRepository != null) {
                    var unpublishErrors = 0
                    for (car in carsToHide) {
                        val result = publicCarRepository.unpublishCar(car.id)
                        result.onFailure { error ->
                            unpublishErrors++
                            Log.e(TAG, "Error unpublishing car ${car.id} from publicCars", error)
                        }
                    }
                    if (unpublishErrors > 0) {
                        Log.w(TAG, "Failed to unpublish $unpublishErrors out of ${carsToHide.size} cars from publicCars")
                    }
                }
                
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
                val carsToDraft = state.cars
                
                if (carsToDraft.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
                
                val carIds = carsToDraft.map { it.id }
                
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.DRAFT)
                
                // Unpublish from publicCars collection via PublicCarRepository (draft cars should not be public)
                if (publicCarRepository != null) {
                    var unpublishErrors = 0
                    for (car in carsToDraft) {
                        val result = publicCarRepository.unpublishCar(car.id)
                        result.onFailure { error ->
                            unpublishErrors++
                            Log.e(TAG, "Error unpublishing car ${car.id} from publicCars", error)
                        }
                    }
                    if (unpublishErrors > 0) {
                        Log.w(TAG, "Failed to unpublish $unpublishErrors out of ${carsToDraft.size} cars from publicCars")
                    }
                }
                
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
                
                if (newDraftCars.isEmpty()) {
                    _uiState.update { it.copy(isLoading = false) }
                    return@launch
                }
                
                val carIds = newDraftCars.map { it.id }
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.PUBLISHED)
                
                // Publish to publicCars collection via PublicCarRepository
                // Use the current cars list, but update each with PUBLISHED status before publishing
                if (publicCarRepository != null) {
                    var publishErrors = 0
                    for (car in newDraftCars) {
                        // Create updated car with PUBLISHED status for publishing
                        val carToPublish = car.copy(
                            publicationStatus = CarPublicationStatus.PUBLISHED.value,
                            updatedAt = System.currentTimeMillis()
                        )
                        val result = publicCarRepository.publishCar(carToPublish)
                        result.onFailure { error ->
                            publishErrors++
                            Log.e(TAG, "Error publishing car ${car.id} to publicCars", error)
                        }
                    }
                    if (publishErrors > 0) {
                        Log.w(TAG, "Failed to publish $publishErrors out of ${newDraftCars.size} new cars to publicCars")
                    }
                }
                
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
    
    /**
     * Publish only the selected cars.
     */
    fun publishSelected() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                // Filter current cars to only those that are selected
                val selectedCars = state.cars.filter { it.id in state.selectedCarIds }
                
                if (selectedCars.isEmpty()) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נבחרו רכבים"
                        )
                    }
                    return@launch
                }
                
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(selectedCars.map { it.id }, CarPublicationStatus.PUBLISHED)
                
                // Publish to publicCars collection via PublicCarRepository
                if (publicCarRepository != null) {
                    var publishErrors = 0
                    for (car in selectedCars) {
                        val carToPublish = car.copy(
                            publicationStatus = CarPublicationStatus.PUBLISHED.value,
                            updatedAt = System.currentTimeMillis()
                        )
                        val result = publicCarRepository.publishCar(carToPublish)
                        result.onFailure { error ->
                            publishErrors++
                            Log.e(TAG, "Error publishing car ${car.id} to publicCars", error)
                        }
                    }
                    if (publishErrors > 0) {
                        Log.w(TAG, "Failed to publish $publishErrors out of ${selectedCars.size} selected cars to publicCars")
                    }
                }
                
                // Clear selection and reload
                clearSelection()
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error publishing selected cars", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בפרסום הרכבים הנבחרים: ${e.message}"
                    )
                }
            }
        }
    }
    
    /**
     * Hide only the selected cars.
     */
    fun hideSelected() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val selectedCars = state.cars.filter { it.id in state.selectedCarIds }
                
                if (selectedCars.isEmpty()) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נבחרו רכבים"
                        )
                    }
                    return@launch
                }
                
                val carIds = selectedCars.map { it.id }
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.HIDDEN)
                
                // Unpublish from publicCars collection via PublicCarRepository
                if (publicCarRepository != null) {
                    var unpublishErrors = 0
                    for (car in selectedCars) {
                        val result = publicCarRepository.unpublishCar(car.id)
                        result.onFailure { error ->
                            unpublishErrors++
                            Log.e(TAG, "Error unpublishing car ${car.id} from publicCars", error)
                        }
                    }
                    if (unpublishErrors > 0) {
                        Log.w(TAG, "Failed to unpublish $unpublishErrors out of ${selectedCars.size} selected cars from publicCars")
                    }
                }
                
                // Clear selection and reload
                clearSelection()
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error hiding selected cars", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בהסתרת הרכבים הנבחרים: ${e.message}"
                    )
                }
            }
        }
    }
    
    /**
     * Move only the selected cars to draft.
     */
    fun draftSelected() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            
            try {
                val state = _uiState.value
                val selectedCars = state.cars.filter { it.id in state.selectedCarIds }
                
                if (selectedCars.isEmpty()) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נבחרו רכבים"
                        )
                    }
                    return@launch
                }
                
                val carIds = selectedCars.map { it.id }
                // Update publication status in Room first
                repository.bulkUpdatePublicationStatus(carIds, CarPublicationStatus.DRAFT)
                
                // Unpublish from publicCars collection via PublicCarRepository (draft cars should not be public)
                if (publicCarRepository != null) {
                    var unpublishErrors = 0
                    for (car in selectedCars) {
                        val result = publicCarRepository.unpublishCar(car.id)
                        result.onFailure { error ->
                            unpublishErrors++
                            Log.e(TAG, "Error unpublishing car ${car.id} from publicCars", error)
                        }
                    }
                    if (unpublishErrors > 0) {
                        Log.w(TAG, "Failed to unpublish $unpublishErrors out of ${selectedCars.size} selected cars from publicCars")
                    }
                }
                
                // Clear selection and reload
                clearSelection()
                loadCars()
            } catch (e: Exception) {
                Log.e(TAG, "Error moving selected cars to draft", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בהעברת הרכבים הנבחרים לטיוטה: ${e.message}"
                    )
                }
            }
        }
    }
}

