package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierPriceListHeader
import com.rentacar.app.data.SupplierPriceListDao
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first
import java.text.SimpleDateFormat
import java.util.*

data class SupplierPriceListsUiState(
    val supplierName: String = "",
    val headers: List<SupplierPriceListHeaderUiModel> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

data class SupplierPriceListHeaderUiModel(
    val id: Long,
    val month: Int,
    val year: Int,
    val importedAtFormatted: String,
    val sourceFileName: String?,
    val isActive: Boolean,
    val itemCount: Int = 0
)

class SupplierPriceListsViewModel(
    private val supplierId: Long,
    private val supplierDao: SupplierDao,
    private val priceListDao: SupplierPriceListDao
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(SupplierPriceListsUiState())
    val uiState: StateFlow<SupplierPriceListsUiState> = _uiState.asStateFlow()
    
    init {
        loadSupplierName()
        observePriceLists()
    }
    
    private fun loadSupplierName() {
        viewModelScope.launch {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            supplierDao.getById(supplierId, currentUid)
                .first()
                .let { supplier ->
                    _uiState.update { it.copy(supplierName = supplier?.name ?: "") }
                }
        }
    }
    
    private fun observePriceLists() {
        viewModelScope.launch {
            priceListDao.observePriceListHeadersForSupplier(supplierId)
                .collect { headers ->
                    val headerModels = headers.map { header ->
                        SupplierPriceListHeaderUiModel(
                            id = header.id,
                            month = header.month,
                            year = header.year,
                            importedAtFormatted = formatDate(header.createdAt),
                            sourceFileName = header.sourceFileName,
                            isActive = header.isActive,
                            itemCount = 0 // Will be loaded separately if needed
                        )
                    }
                    
                    // Load item counts for each header
                    val headersWithCounts = headerModels.map { model ->
                        val count = priceListDao.getItemCountForHeader(model.id)
                        model.copy(itemCount = count)
                    }
                    
                    _uiState.update {
                        it.copy(
                            headers = headersWithCounts,
                            isLoading = false
                        )
                    }
                }
        }
    }
    
    private fun formatDate(timestamp: Long): String {
        return try {
            val sdf = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
            sdf.format(Date(timestamp))
        } catch (e: Exception) {
            ""
        }
    }
    
    fun onImportPriceListClick() {
        // This will trigger the import dialog - handled by the screen
    }
}

