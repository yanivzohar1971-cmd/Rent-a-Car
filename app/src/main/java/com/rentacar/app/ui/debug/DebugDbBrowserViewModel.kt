package com.rentacar.app.ui.debug

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.debug.DebugDatabaseRepository
import com.rentacar.app.data.debug.DebugTableData
import com.rentacar.app.data.debug.DebugTableDefinition
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DebugDbBrowserViewModel(
    private val repository: DebugDatabaseRepository
) : ViewModel() {
    
    private val _tables = MutableStateFlow<List<DebugTableDefinition>>(emptyList())
    val tables: StateFlow<List<DebugTableDefinition>> = _tables.asStateFlow()
    
    private val _selectedTable = MutableStateFlow<DebugTableDefinition?>(null)
    val selectedTable: StateFlow<DebugTableDefinition?> = _selectedTable.asStateFlow()
    
    private val _tableData = MutableStateFlow<DebugTableData?>(null)
    val tableData: StateFlow<DebugTableData?> = _tableData.asStateFlow()
    
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()
    
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()
    
    init {
        loadTables()
    }
    
    private fun loadTables() {
        viewModelScope.launch {
            try {
                val list = repository.getTables()
                _tables.value = list
                // Optionally select the first table by default if none selected
                if (list.isNotEmpty() && _selectedTable.value == null) {
                    selectTable(list.first())
                }
            } catch (e: Exception) {
                android.util.Log.e("DebugDbBrowserViewModel", "Error loading tables", e)
                _errorMessage.value = "שגיאה בטעינת רשימת הטבלאות: ${e.message}"
            }
        }
    }
    
    fun selectTable(table: DebugTableDefinition) {
        _selectedTable.value = table
        _isLoading.value = true
        _errorMessage.value = null
        _tableData.value = null
        
        viewModelScope.launch {
            try {
                val data = repository.loadTableData(table.tableName)
                _tableData.value = data
                _isLoading.value = false
            } catch (e: Exception) {
                _errorMessage.value = "שגיאה בטעינת הטבלה: ${e.message}"
                _isLoading.value = false
            }
        }
    }
}

