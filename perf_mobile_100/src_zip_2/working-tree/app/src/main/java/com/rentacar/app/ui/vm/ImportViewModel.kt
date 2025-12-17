package com.rentacar.app.ui.vm

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Log
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
        Log.d("ImportExcelDebug", "importExcelForSupplier started: supplierId=$supplierId, uri=$fileUri")
        viewModelScope.launch {
            try {
                // Check if supplier has assigned function code
                val functionCode = withContext(Dispatchers.IO) {
                    val currentUid = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
                    supplierDao.getImportFunctionCode(supplierId, currentUid)
                }
                
                Log.d("ImportExcelDebug", "Function code resolved: $functionCode")
                
                if (functionCode == null) {
                    // Supplier not configured - return error immediately
                    Log.d("ImportExcelDebug", "No function code - returning error")
                    val uiResult = com.rentacar.app.ui.dialogs.ImportResult(
                        success = false,
                        errors = listOf("לא הוגדר יבוא לספק הזה (לחץ 'תבנית')"),
                        warnings = emptyList()
                    )
                    onDone(uiResult)
                    return@launch
                }
                
                // Run import using the dispatcher
                Log.d("ImportExcelDebug", "Calling dispatcher.runImportForSupplier...")
                val serviceResult = withContext(Dispatchers.IO) {
                    importDispatcher.runImportForSupplier(
                        supplierId = supplierId,
                        functionCode = functionCode,
                        fileUri = fileUri
                    )
                }
                
                Log.d("ImportExcelDebug", "Dispatcher returned: success=${serviceResult.success}, errors=${serviceResult.errors.size}")
                
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
                Log.d("ImportExcelDebug", "Calling onDone with result: success=${uiResult.success}")
                onDone(uiResult)
                Log.d("ImportExcelDebug", "onDone completed")
            } catch (e: Exception) {
                // Catch any unexpected exceptions to prevent app crash
                Log.e("ImportExcelDebug", "Excel import failed with exception", e)
                val uiResult = com.rentacar.app.ui.dialogs.ImportResult(
                    success = false,
                    createdCount = 0,
                    updatedCount = 0,
                    skippedCount = 0,
                    errorCount = 0,
                    totalRowsInFile = 0,
                    processedRows = 0,
                    errors = listOf("שגיאה בייבוא קובץ אקסל: ${e.message ?: "שגיאה לא ידועה"}"),
                    warnings = emptyList()
                )
                Log.d("ImportExcelDebug", "Calling onDone from catch block")
                onDone(uiResult)
                Log.d("ImportExcelDebug", "onDone from catch completed")
            }
        }
    }
}
