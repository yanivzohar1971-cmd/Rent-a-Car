package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
        viewModelScope.launch(Dispatchers.IO) {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            val currentCode = supplierDao.getImportFunctionCode(supplierId, currentUid)
            Log.d("supplier_import", "load: supplierId=$supplierId, loadedImportType=$currentCode")
            _selectedFunctionCode.value = currentCode
            _hasExistingFunction.value = (currentCode != null)
        }
    }
    
    fun selectFunction(code: Int) {
        _selectedFunctionCode.value = code
    }
    
    suspend fun assignFunctionToSupplier(supplierId: Long) {
        val functionCode = _selectedFunctionCode.value ?: return
        withContext(Dispatchers.IO) {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            val rowsUpdated = supplierDao.updateImportFunctionCode(supplierId, functionCode, currentUid)
            Log.d("supplier_import", "save: supplierId=$supplierId, selectedImportType=$functionCode, rowsUpdated=$rowsUpdated")
        }
    }
    
    suspend fun clearFunctionFromSupplier(supplierId: Long) {
        withContext(Dispatchers.IO) {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            Log.d("supplier_import", "clear: supplierId=$supplierId")
            supplierDao.clearImportFunctionCode(supplierId, currentUid)
        }
    }
}
