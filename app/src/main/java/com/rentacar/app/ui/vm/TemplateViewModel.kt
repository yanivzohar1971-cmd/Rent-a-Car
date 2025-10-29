package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class FunctionChoice(val code: Int, val label: String)

class TemplateViewModel(
    private val supplierDao: SupplierDao
) : ViewModel() {
    
    // Available import function handlers
    val availableFunctions = listOf(
        FunctionChoice(1, "יבוא פרי (Excel)"),
        FunctionChoice(2, "יבוא ספק אחר (CSV)"),
        FunctionChoice(3, "יבוא ספק 3 (TXT)"),
        FunctionChoice(4, "יבוא ספק 4 (EMAIL)"),
        FunctionChoice(5, "יבוא ספק 5 (אחר)")
    )
    
    private val _selectedFunctionCode = MutableStateFlow<Int?>(null)
    val selectedFunctionCode: StateFlow<Int?> = _selectedFunctionCode.asStateFlow()
    
    private val _hasExistingFunction = MutableStateFlow(false)
    val hasExistingFunction: StateFlow<Boolean> = _hasExistingFunction.asStateFlow()
    
    fun loadCurrentFunction(supplierId: Long) {
        viewModelScope.launch {
            val currentCode = supplierDao.getImportFunctionCode(supplierId)
            _selectedFunctionCode.value = currentCode
            _hasExistingFunction.value = (currentCode != null)
        }
    }
    
    fun selectFunction(code: Int) {
        _selectedFunctionCode.value = code
    }
    
    suspend fun assignFunctionToSupplier(supplierId: Long) {
        val functionCode = _selectedFunctionCode.value ?: return
        supplierDao.updateImportFunctionCode(supplierId, functionCode)
    }
    
    suspend fun clearFunctionFromSupplier(supplierId: Long) {
        android.util.Log.d("TemplateViewModel", "Clearing import function for supplier $supplierId")
        supplierDao.clearImportFunctionCode(supplierId)
    }
}
