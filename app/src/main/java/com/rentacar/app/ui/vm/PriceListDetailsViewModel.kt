package com.rentacar.app.ui.vm

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierPriceListDao
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class PriceListHeaderUiModel(
    val id: Long,
    val supplierId: Long,
    val supplierName: String?,
    val year: Int,
    val month: Int,
    val isActive: Boolean,
    val importedAtMillis: Long,
    val sourceFileName: String?,
    val notes: String?
)

data class PriceListItemUiModel(
    val id: Long,
    val carGroupCode: String?,
    val carGroupName: String?,
    val manufacturer: String?,
    val model: String?,
    val dailyPriceNis: Double?,
    val weeklyPriceNis: Double?,
    val monthlyPriceNis: Double?,
    val dailyPriceUsd: Double?,
    val weeklyPriceUsd: Double?,
    val monthlyPriceUsd: Double?,
    val shabbatInsuranceNis: Double?,
    val shabbatInsuranceUsd: Double?,
    val includedKmPerDay: Int?,
    val includedKmPerWeek: Int?,
    val includedKmPerMonth: Int?,
    val extraKmPriceNis: Double?,
    val extraKmPriceUsd: Double?,
    val deductibleNis: Double?
)

data class PriceListDetailsUiState(
    val isLoading: Boolean = true,
    val header: PriceListHeaderUiModel? = null,
    val items: List<PriceListItemUiModel> = emptyList(),
    val searchQuery: String = "",
    val errorMessage: String? = null
)

class PriceListDetailsViewModel(
    savedStateHandle: SavedStateHandle,
    private val supplierDao: SupplierDao,
    private val priceListDao: SupplierPriceListDao
) : ViewModel() {
    
    private val headerId: Long = savedStateHandle.get<Long>("headerId") ?: 0L
    
    private val _uiState = MutableStateFlow(PriceListDetailsUiState())
    val uiState: StateFlow<PriceListDetailsUiState> = _uiState.asStateFlow()
    
    private val _allItems = MutableStateFlow<List<PriceListItemUiModel>>(emptyList())
    
    init {
        if (headerId > 0) {
            loadHeader()
            observeItems()
        } else {
            _uiState.update { it.copy(isLoading = false, errorMessage = "מזהה מחירון לא תקין") }
        }
    }
    
    private fun loadHeader() {
        viewModelScope.launch {
            try {
                val header = priceListDao.getHeaderById(headerId)
                if (header == null) {
                    _uiState.update { 
                        it.copy(
                            isLoading = false, 
                            errorMessage = "מחירון לא נמצא"
                        ) 
                    }
                    return@launch
                }
                
                // Load supplier name
                val supplier = supplierDao.getById(header.supplierId).first()
                val supplierName = supplier?.name
                
                val headerModel = PriceListHeaderUiModel(
                    id = header.id,
                    supplierId = header.supplierId,
                    supplierName = supplierName,
                    year = header.year,
                    month = header.month,
                    isActive = header.isActive,
                    importedAtMillis = header.createdAt,
                    sourceFileName = header.sourceFileName,
                    notes = header.notes
                )
                
                _uiState.update { 
                    it.copy(
                        header = headerModel,
                        isLoading = false
                    ) 
                }
            } catch (e: Exception) {
                android.util.Log.e("PriceListDetailsViewModel", "Error loading header", e)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת מחירון: ${e.message}"
                    ) 
                }
            }
        }
    }
    
    private fun observeItems() {
        viewModelScope.launch {
            priceListDao.observeItemsForHeader(headerId)
                .collect { items ->
                    val itemModels = items.map { item ->
                        PriceListItemUiModel(
                            id = item.id,
                            carGroupCode = item.carGroupCode,
                            carGroupName = item.carGroupName,
                            manufacturer = item.manufacturer,
                            model = item.model,
                            dailyPriceNis = item.dailyPriceNis,
                            weeklyPriceNis = item.weeklyPriceNis,
                            monthlyPriceNis = item.monthlyPriceNis,
                            dailyPriceUsd = item.dailyPriceUsd,
                            weeklyPriceUsd = item.weeklyPriceUsd,
                            monthlyPriceUsd = item.monthlyPriceUsd,
                            shabbatInsuranceNis = item.shabbatInsuranceNis,
                            shabbatInsuranceUsd = item.shabbatInsuranceUsd,
                            includedKmPerDay = item.includedKmPerDay,
                            includedKmPerWeek = item.includedKmPerWeek,
                            includedKmPerMonth = item.includedKmPerMonth,
                            extraKmPriceNis = item.extraKmPriceNis,
                            extraKmPriceUsd = item.extraKmPriceUsd,
                            deductibleNis = item.deductibleNis
                        )
                    }
                    
                    _allItems.value = itemModels
                    applyFilter()
                }
        }
    }
    
    fun onSearchQueryChange(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        applyFilter()
    }
    
    private fun applyFilter() {
        val query = _uiState.value.searchQuery.trim().lowercase()
        val allItems = _allItems.value
        
        val filtered = if (query.isBlank()) {
            allItems
        } else {
            allItems.filter { item ->
                item.carGroupCode?.lowercase()?.contains(query) == true ||
                item.carGroupName?.lowercase()?.contains(query) == true ||
                item.manufacturer?.lowercase()?.contains(query) == true ||
                item.model?.lowercase()?.contains(query) == true
            }
        }
        
        _uiState.update { it.copy(items = filtered) }
    }
}

