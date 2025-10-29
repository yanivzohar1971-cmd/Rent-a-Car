package com.rentacar.app.ui.vm

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.import.ImportDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ImportViewModel(
    private val importDispatcher: ImportDispatcher,
    private val supplierDao: SupplierDao
) : ViewModel() {
    
    fun resolveFileName(context: Context, uri: Uri): String {
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        return cursor?.use {
            val nameIndex = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (it.moveToFirst() && nameIndex >= 0) {
                it.getString(nameIndex)
            } else {
                "unknown_file.xlsx"
            }
        } ?: "unknown_file.xlsx"
    }
    
    fun importExcelForSupplier(
        context: Context,
        supplierId: Long,
        fileUri: Uri,
        onDone: (com.rentacar.app.ui.dialogs.ImportResult) -> Unit
    ) {
        viewModelScope.launch {
            // Check if supplier has assigned function code
            val functionCode = withContext(Dispatchers.IO) {
                supplierDao.getImportFunctionCode(supplierId)
            }
            
            if (functionCode == null) {
                // Supplier not configured - return error immediately
                val uiResult = com.rentacar.app.ui.dialogs.ImportResult(
                    success = false,
                    errors = listOf("לא הוגדר יבוא לספק הזה (לחץ 'תבנית')"),
                    warnings = emptyList()
                )
                onDone(uiResult)
                return@launch
            }
            
            // Run import using the dispatcher
            val serviceResult = withContext(Dispatchers.IO) {
                importDispatcher.runImportForSupplier(
                    supplierId = supplierId,
                    functionCode = functionCode,
                    fileUri = fileUri
                )
            }
            
            // Convert service result to UI result
            val uiResult = com.rentacar.app.ui.dialogs.ImportResult(
                success = serviceResult.success,
                createdCount = serviceResult.createdCount,
                updatedCount = serviceResult.updatedCount,
                skippedCount = serviceResult.skippedCount,
                errorCount = serviceResult.errorCount,
                totalRowsInFile = serviceResult.totalRowsInFile,
                processedRows = serviceResult.processedRows,
                errors = serviceResult.errors,
                warnings = serviceResult.warnings
            )
            onDone(uiResult)
        }
    }
}
