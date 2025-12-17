package com.rentacar.app.ui.dialogs

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.import.PriceListImportDispatcher
import kotlinx.coroutines.launch
import java.util.Calendar

@Composable
fun PriceListImportDialog(
    visible: Boolean,
    supplierId: Long,
    supplierName: String,
    onDismiss: () -> Unit,
    onImported: (ImportResult) -> Unit
) {
    if (!visible) return
    
    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val dispatcher = remember {
        PriceListImportDispatcher(context, db)
    }
    val scope = rememberCoroutineScope()
    
    // Get current month/year as defaults
    val calendar = Calendar.getInstance()
    var selectedMonth by remember { mutableStateOf(calendar.get(Calendar.MONTH) + 1) }
    var selectedYear by remember { mutableStateOf(calendar.get(Calendar.YEAR)) }
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var selectedFileName by remember { mutableStateOf("") }
    var isImporting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            selectedUri = uri
            // Get file name from URI
            val cursor = context.contentResolver.query(uri, null, null, null, null)
            cursor?.use {
                val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (it.moveToFirst() && nameIndex >= 0) {
                    selectedFileName = it.getString(nameIndex)
                } else {
                    selectedFileName = "קובץ מחירון"
                }
            } ?: run {
                selectedFileName = "קובץ מחירון"
            }
            errorMessage = null
        }
    }
    
    AlertDialog(
        onDismissRequest = { if (!isImporting) onDismiss() },
        title = { Text("ייבוא מחירון") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "ספק: $supplierName",
                    style = MaterialTheme.typography.bodyMedium
                )
                
                Spacer(Modifier.height(8.dp))
                
                // Month selection
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("חודש:", style = MaterialTheme.typography.bodyMedium)
                    var monthExpanded by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(onClick = { monthExpanded = true }) {
                            Text("$selectedMonth")
                        }
                        DropdownMenu(
                            expanded = monthExpanded,
                            onDismissRequest = { monthExpanded = false }
                        ) {
                            (1..12).forEach { month ->
                                DropdownMenuItem(
                                    text = { Text("$month") },
                                    onClick = {
                                        selectedMonth = month
                                        monthExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
                
                // Year selection
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("שנה:", style = MaterialTheme.typography.bodyMedium)
                    var yearExpanded by remember { mutableStateOf(false) }
                    Box {
                        OutlinedButton(onClick = { yearExpanded = true }) {
                            Text("$selectedYear")
                        }
                        DropdownMenu(
                            expanded = yearExpanded,
                            onDismissRequest = { yearExpanded = false }
                        ) {
                            val currentYear = calendar.get(Calendar.YEAR)
                            (currentYear - 2..currentYear + 2).forEach { year ->
                                DropdownMenuItem(
                                    text = { Text("$year") },
                                    onClick = {
                                        selectedYear = year
                                        yearExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
                
                Spacer(Modifier.height(8.dp))
                
                Button(
                    onClick = {
                        filePicker.launch(
                            arrayOf(
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                "application/vnd.ms-excel"
                            )
                        )
                    },
                    enabled = !isImporting
                ) {
                    Text("בחר קובץ אקסל")
                }
                
                if (selectedFileName.isNotEmpty()) {
                    Text(
                        text = "קובץ נבחר: $selectedFileName",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                
                if (isImporting) {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = "מייבא מחירון...",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val uri = selectedUri
                    if (uri == null) {
                        errorMessage = "לא נבחר קובץ"
                        return@TextButton
                    }
                    
                    isImporting = true
                    errorMessage = null
                    
                    scope.launch {
                        try {
                            val result = dispatcher.importPriceListFromExcel(
                                supplierId = supplierId,
                                fileUri = uri,
                                year = selectedYear,
                                month = selectedMonth
                            )
                            
                            isImporting = false
                            
                            // Convert ImportDispatcher.ImportResult to dialog ImportResult
                            val dialogResult = ImportResult(
                                success = result.success,
                                createdCount = result.createdCount,
                                updatedCount = result.updatedCount,
                                skippedCount = result.skippedCount,
                                errorCount = result.errorCount,
                                totalRowsInFile = result.totalRowsInFile,
                                processedRows = result.processedRows,
                                errors = result.errors,
                                warnings = result.warnings
                            )
                            
                            if (result.success) {
                                onImported(dialogResult)
                                onDismiss()
                            } else {
                                errorMessage = result.errors.joinToString("\n")
                            }
                        } catch (e: Exception) {
                            isImporting = false
                            errorMessage = "שגיאה ביבוא: ${e.message}"
                            android.util.Log.e("PriceListImportDialog", "Import failed", e)
                        }
                    }
                },
                enabled = !isImporting && selectedUri != null
            ) {
                Text("התחל יבוא")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isImporting
            ) {
                Text("ביטול")
            }
        }
    )
}

