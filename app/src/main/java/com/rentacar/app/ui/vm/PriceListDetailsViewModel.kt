package com.rentacar.app.ui.vm

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierPriceListDao
import com.rentacar.app.data.SupplierPriceListItem
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class PriceListGroupUiModel(
    val code: String,
    val name: String
)

data class PriceListDetailsUiState(
    val isLoading: Boolean = true,
    val headerSupplierName: String? = null,
    val headerYear: Int? = null,
    val headerMonth: Int? = null,
    val items: List<SupplierPriceListItem> = emptyList(), // Simple list for basic display
    val allItems: List<SupplierPriceListItem> = emptyList(), // Keep for backward compatibility
    
    // Groups
    val groups: List<PriceListGroupUiModel> = emptyList(),
    val selectedGroupCode: String? = null,
    
    // Models (items) for the selected group
    val modelsForSelectedGroup: List<SupplierPriceListItem> = emptyList(),
    val selectedModelId: Long? = null,
    
    // The currently selected item (for the tariff card)
    val selectedItem: SupplierPriceListItem? = null,
    
    // Keep existing filters for backward compatibility (can be removed later if not needed)
    val manufacturerFilter: String? = null,
    val gearboxFilter: String? = null,
    val errorMessage: String? = null
)

class PriceListDetailsViewModel(
    savedStateHandle: SavedStateHandle,
    private val supplierDao: SupplierDao,
    private val priceListDao: SupplierPriceListDao
) : ViewModel() {
    
    private val headerId: Long = savedStateHandle.get<Long>("headerId") 
        ?: savedStateHandle.get<String>("headerId")?.toLongOrNull() 
        ?: 0L
    
    private val _uiState = MutableStateFlow(PriceListDetailsUiState())
    val uiState: StateFlow<PriceListDetailsUiState> = _uiState.asStateFlow()
    
    init {
        android.util.Log.d("PriceListDetailsVM", "ViewModel created for headerId=$headerId")
        if (headerId > 0) {
            loadHeaderAndItems()
        } else {
            android.util.Log.e("PriceListDetailsVM", "Invalid headerId: $headerId")
            _uiState.update { it.copy(isLoading = false, errorMessage = "מזהה מחירון לא תקין") }
        }
    }
    
    private fun loadHeaderAndItems() {
        viewModelScope.launch {
            try {
                // Load header first
                val header = priceListDao.getHeaderById(headerId)
                if (header == null) {
                    android.util.Log.e("PriceListDetailsViewModel", "Header not found for headerId=$headerId")
                    _uiState.update { 
                        it.copy(
                            isLoading = false, 
                            errorMessage = "מחירון לא נמצא"
                        ) 
                    }
                    return@launch
                }
                
                android.util.Log.d("PriceListDetailsViewModel", "Header loaded: id=${header.id}, supplierId=${header.supplierId}, year=${header.year}, month=${header.month}")
                
                // Load supplier name
                val supplier = supplierDao.getById(header.supplierId).first()
                
                _uiState.update { 
                    it.copy(
                        headerSupplierName = supplier?.name,
                        headerYear = header.year,
                        headerMonth = header.month
                    ) 
                }
                
                // Observe items using Flow
                priceListDao.observeItemsForHeader(headerId)
                    .collect { items ->
                        android.util.Log.d("PriceListDetailsVM", "observeItemsForHeader(headerId=$headerId) -> items.size=${items.size}")
                        
                        // Derive distinct groups from items
                        val groups = items
                            .groupBy { item ->
                                item.carGroupCode to item.carGroupName
                            }
                            .map { (key, _) ->
                                val (code, name) = key
                                PriceListGroupUiModel(
                                    code = code ?: "",
                                    name = name ?: code ?: ""
                                )
                            }
                            .distinctBy { it.code }
                            .sortedBy { it.code }
                        
                        android.util.Log.d("PriceListDetailsVM", "Derived ${groups.size} groups from ${items.size} items")
                        
                        val current = _uiState.value
                        
                        // If no group is selected yet, auto-select the first group
                        val selectedGroupCode = current.selectedGroupCode
                            ?: groups.firstOrNull()?.code
                        
                        // Filter models by selected group
                        val modelsForSelectedGroup = if (selectedGroupCode != null) {
                            items.filter { item ->
                                item.carGroupCode == selectedGroupCode
                            }
                        } else {
                            emptyList()
                        }
                        
                        // Resolve selected item by selectedModelId within this filtered group
                        val selectedModelId = current.selectedModelId
                        val selectedItem = if (selectedModelId != null) {
                            modelsForSelectedGroup.firstOrNull { item ->
                                item.id == selectedModelId
                            }
                        } else {
                            null
                        }
                        
                        _uiState.update { 
                            it.copy(
                                items = items, // Simple list for basic display
                                allItems = items, // Keep for backward compatibility
                                isLoading = false,
                                groups = groups,
                                selectedGroupCode = selectedGroupCode,
                                modelsForSelectedGroup = modelsForSelectedGroup,
                                selectedItem = selectedItem
                            ) 
                        }
                    }
            } catch (e: Exception) {
                android.util.Log.e("PriceListDetailsViewModel", "Error loading header/items", e)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת מחירון: ${e.message}"
                    ) 
                }
            }
        }
    }
    
    // Actions
    fun onGroupSelected(groupCode: String) {
        val current = _uiState.value
        val items = current.allItems
        
        val modelsForSelectedGroup = items.filter { item ->
            item.carGroupCode == groupCode
        }
        
        _uiState.update { 
            it.copy(
                selectedGroupCode = groupCode,
                modelsForSelectedGroup = modelsForSelectedGroup,
                selectedModelId = null,
                selectedItem = null,
                manufacturerFilter = null, // Reset filters when group changes
                gearboxFilter = null
            ) 
        }
    }
    
    fun onModelSelected(modelId: Long) {
        val current = _uiState.value
        val selectedItem = current.modelsForSelectedGroup.firstOrNull { item ->
            item.id == modelId
        }
        
        _uiState.update { 
            it.copy(
                selectedModelId = modelId,
                selectedItem = selectedItem
            ) 
        }
    }
    
    // Keep these for backward compatibility if filters are still used in UI
    fun onManufacturerFilterSelected(manufacturer: String?) {
        // For now, this is kept but not actively used in the simplified flow
        _uiState.update { 
            it.copy(
                manufacturerFilter = manufacturer
            ) 
        }
    }
    
    fun onGearboxFilterSelected(gearbox: String?) {
        // Placeholder - gearbox field doesn't exist in entity yet
        _uiState.update { it.copy(gearboxFilter = gearbox) }
    }
}

