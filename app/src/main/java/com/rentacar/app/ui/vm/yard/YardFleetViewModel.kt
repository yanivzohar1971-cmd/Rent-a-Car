package com.rentacar.app.ui.vm.yard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.YardFleetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
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
    val status: YardCarStatus,
    val createdAtMillis: Long = 0L // Creation timestamp for sorting
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
 * Sort field options for yard fleet
 */
enum class YardFleetSortField {
    CREATED_AT,
    PRICE,
    YEAR,
    MILEAGE
}

/**
 * Sort direction
 */
enum class SortDirection {
    ASC,
    DESC
}

/**
 * Sort configuration for yard fleet
 */
data class YardFleetSort(
    val field: YardFleetSortField = YardFleetSortField.CREATED_AT,
    val direction: SortDirection = SortDirection.DESC
)

/**
 * Summary statistics for yard fleet
 */
data class YardFleetSummary(
    val totalCount: Int = 0,
    val activeCount: Int = 0,
    val soldCount: Int = 0,
    val draftCount: Int = 0,
    val totalEstimatedValue: Long = 0L
)

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
    
    // Filter state
    private val _filters = MutableStateFlow(YardCarFilter())
    val filters: StateFlow<YardCarFilter> = _filters.asStateFlow()
    
    // Sort state
    private val _sort = MutableStateFlow(YardFleetSort())
    val sort: StateFlow<YardFleetSort> = _sort.asStateFlow()
    
    // All cars (unfiltered) - source list
    private val _allCars = MutableStateFlow<List<YardCarItem>>(emptyList())
    
    // Filtered and sorted cars - derived from allCars, filters, and sort
    val filteredCars: StateFlow<List<YardCarItem>> = combine(_allCars, _filters, _sort) { cars, filter, sort ->
        val filtered = cars.filter { car -> filter.matches(car) }
        applySort(filtered, sort)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList()
    )
    
    // Summary statistics based on all cars (not filtered)
    val summary: StateFlow<YardFleetSummary> = _allCars
        .map { cars -> calculateSummary(cars) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = YardFleetSummary()
        )
    
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
                    _allCars.value = items
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
    
    // Filter update functions
    fun updateStatusFilter(status: YardCarStatusFilter) {
        _filters.value = _filters.value.copy(status = status)
    }
    
    fun updateTransmissionFilter(transmission: TransmissionFilter) {
        _filters.value = _filters.value.copy(transmission = transmission)
    }
    
    fun updateFuelTypeFilter(fuelType: FuelTypeFilter) {
        _filters.value = _filters.value.copy(fuelType = fuelType)
    }
    
    fun updateYearRange(minYear: Int?, maxYear: Int?) {
        _filters.value = _filters.value.copy(minYear = minYear, maxYear = maxYear)
    }
    
    fun updatePriceRange(minPrice: Int?, maxPrice: Int?) {
        _filters.value = _filters.value.copy(minPrice = minPrice, maxPrice = maxPrice)
    }
    
    fun updateQuery(query: String) {
        _filters.value = _filters.value.copy(query = query)
    }
    
    fun clearAllFilters() {
        _filters.value = YardCarFilter()
    }
    
    // Sort update function
    fun updateSortField(field: YardFleetSortField) {
        _sort.update { current ->
            if (current.field == field) {
                // Toggle direction when re-selecting the same field
                current.copy(
                    direction = if (current.direction == SortDirection.ASC) {
                        SortDirection.DESC
                    } else {
                        SortDirection.ASC
                    }
                )
            } else {
                // Switch field, default direction: DESC for CREATED_AT, PRICE, YEAR
                YardFleetSort(field = field, direction = SortDirection.DESC)
            }
        }
    }
    
    /**
     * Apply sorting to a list of cars
     */
    private fun applySort(
        cars: List<YardCarItem>,
        sort: YardFleetSort
    ): List<YardCarItem> {
        val comparator = when (sort.field) {
            YardFleetSortField.CREATED_AT -> compareBy<YardCarItem> { it.createdAtMillis }
            YardFleetSortField.PRICE -> compareBy<YardCarItem> { it.price ?: 0 }
            YardFleetSortField.YEAR -> compareBy<YardCarItem> { it.year ?: 0 }
            YardFleetSortField.MILEAGE -> compareBy<YardCarItem> { it.mileageKm ?: Int.MAX_VALUE }
        }
        
        val sorted = cars.sortedWith(comparator)
        
        return if (sort.direction == SortDirection.DESC) {
            sorted.asReversed()
        } else {
            sorted
        }
    }
    
    /**
     * Calculate summary statistics for the fleet
     */
    private fun calculateSummary(cars: List<YardCarItem>): YardFleetSummary {
        val totalCount = cars.size
        
        val activeCars = cars.filter { it.isActiveOrPublished() }
        val soldCars = cars.filter { it.isSold() }
        val draftCars = cars.filter { it.isDraft() }
        
        val activeCount = activeCars.size
        val soldCount = soldCars.size
        val draftCount = draftCars.size
        
        // Include ACTIVE + DRAFT cars in total estimated value
        // (exclude SOLD and HIDDEN as they're not available for sale)
        val valueCars = activeCars + draftCars
        
        val totalEstimatedValue = valueCars
            .mapNotNull { it.price }
            .map { it.toLong() }
            .sum()
        
        return YardFleetSummary(
            totalCount = totalCount,
            activeCount = activeCount,
            soldCount = soldCount,
            draftCount = draftCount,
            totalEstimatedValue = totalEstimatedValue
        )
    }
}

/**
 * Extension functions for status checking
 */
private fun YardCarItem.isActiveOrPublished(): Boolean {
    return status == YardCarStatus.PUBLISHED
}

private fun YardCarItem.isSold(): Boolean {
    // SOLD status is not yet implemented in CarSale, so always false for now
    return false
}

private fun YardCarItem.isDraft(): Boolean {
    return status == YardCarStatus.DRAFT
}

/**
 * Extension function to check if a car matches the filter criteria
 */
private fun YardCarFilter.matches(car: YardCarItem): Boolean {
    // Status filter
    val statusOk = when (status) {
        YardCarStatusFilter.ALL -> true
        YardCarStatusFilter.ACTIVE -> car.status == YardCarStatus.PUBLISHED
        YardCarStatusFilter.RESERVED -> false // Not yet implemented in CarSale
        YardCarStatusFilter.SOLD -> false // Not yet implemented in CarSale
        YardCarStatusFilter.DRAFT -> car.status == YardCarStatus.DRAFT
    }
    
    // Transmission filter - currently always passes since field doesn't exist yet
    // TODO: When transmission field is added to CarSale/YardCarItem, implement this
    val transmissionOk = when (transmission) {
        TransmissionFilter.ANY -> true
        TransmissionFilter.AUTOMATIC -> true // Placeholder - always true until field exists
        TransmissionFilter.MANUAL -> true // Placeholder - always true until field exists
    }
    
    // Fuel type filter - currently always passes since field doesn't exist yet
    // TODO: When fuel type field is added to CarSale/YardCarItem, implement this
    val fuelOk = when (fuelType) {
        FuelTypeFilter.ANY -> true
        FuelTypeFilter.PETROL -> true // Placeholder - always true until field exists
        FuelTypeFilter.DIESEL -> true // Placeholder - always true until field exists
        FuelTypeFilter.HYBRID -> true // Placeholder - always true until field exists
        FuelTypeFilter.ELECTRIC -> true // Placeholder - always true until field exists
    }
    
    // Year range
    val yearOk = (minYear == null || (car.year != null && car.year!! >= minYear)) &&
                 (maxYear == null || (car.year != null && car.year!! <= maxYear))
    
    // Price range
    val price = car.price ?: 0
    val priceOk = (minPrice == null || price >= minPrice) &&
                  (maxPrice == null || price <= maxPrice)
    
    // Free text query - search in brand, model, and notes (if available)
    val q = query.trim()
    val queryOk = if (q.isBlank()) {
        true
    } else {
        val lower = q.lowercase()
        car.brand.lowercase().contains(lower) ||
        car.model.lowercase().contains(lower)
        // TODO: Add licensePlate and notes when available in YardCarItem
    }
    
    return statusOk && transmissionOk && fuelOk && yearOk && priceOk && queryOk
}

