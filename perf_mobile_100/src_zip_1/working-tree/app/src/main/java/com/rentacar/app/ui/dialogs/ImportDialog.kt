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
import com.rentacar.app.import.ExcelImportService
import com.rentacar.app.sync.ReservationSyncService
import com.rentacar.app.ui.vm.ImportViewModel

data class ImportResult(
    val success: Boolean,
    val createdCount: Int = 0,
    val updatedCount: Int = 0,
    val skippedCount: Int = 0,
    val errorCount: Int = 0,
    val totalRowsInFile: Int = 0,
    val processedRows: Int = 0,
    val errors: List<String> = emptyList(),
    val warnings: List<String> = emptyList()
)

@Composable
fun ImportDialog(
    visible: Boolean,
    supplierId: Long,
    onDismiss: () -> Unit,
    onImported: (ImportResult) -> Unit
) {
    if (!visible) return
    
    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val syncService = remember {
        ReservationSyncService(
            db.reservationDao(),
            db.supplierMonthlyDealDao(),
            db.customerDao(),
            db.branchDao(),
            db.carTypeDao()
        )
    }
    val dispatcher = remember {
        com.rentacar.app.import.ImportDispatcher(
            context,
            db.supplierMonthlyHeaderDao(),
            db.supplierMonthlyDealDao(),
            db.importLogDao(),
            syncService
        )
    }
    val viewModel = remember { ImportViewModel(dispatcher, db.supplierDao()) }
    
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var selectedFileName by remember { mutableStateOf("") }
    var isImporting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            selectedUri = uri
            selectedFileName = viewModel.resolveFileName(context, uri)
            errorMessage = null
        }
    }
    
    AlertDialog(
        onDismissRequest = { if (!isImporting) onDismiss() },
        title = { Text("ייבוא קובץ Excel חודשי") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        filePicker.launch(
                            arrayOf(
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                "application/vnd.ms-excel",
                                "application/octet-stream"
                            )
                        )
                    },
                    enabled = !isImporting
                ) {
                    Text("בחר קובץ")
                }
                
                if (selectedFileName.isNotEmpty()) {
                    Text(
                        text = "קובץ נבחר: $selectedFileName",
                        style = MaterialTheme.typography.bodyMedium
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
                        text = "מייבא נתונים...",
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
                    
                    viewModel.importExcelForSupplier(
                        context = context,
                        supplierId = supplierId,
                        fileUri = uri
                    ) { result ->
                        isImporting = false
                        if (result.success) {
                            onImported(result)
                            onDismiss()
                        } else {
                            errorMessage = result.errors.joinToString("\n")
                        }
                    }
                },
                enabled = !isImporting && selectedUri != null
            ) {
                Text("ייבא")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isImporting
            ) {
                Text("בטל")
            }
        }
    )
}

