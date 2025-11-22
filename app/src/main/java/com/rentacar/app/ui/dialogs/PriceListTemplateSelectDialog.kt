package com.rentacar.app.ui.dialogs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.rentacar.app.data.PriceListImportFunctionCodes
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun PriceListTemplateSelectDialog(
    visible: Boolean,
    supplierId: Long,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    if (!visible) return

    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val scope = rememberCoroutineScope()
    
    var supplierName by remember { mutableStateOf<String?>(null) }
    var currentCode by remember { mutableStateOf<Int?>(null) }
    var selectedCode by remember { mutableStateOf<Int?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    // Load supplier name and current price list import function code
    LaunchedEffect(visible, supplierId) {
        if (visible) {
            isLoading = true
            try {
                // Load supplier name from Flow
                val supplier = db.supplierDao().getById(supplierId).first()
                supplierName = supplier?.name
                // Load current price list import function code
                currentCode = db.supplierDao().getPriceListImportFunctionCode(supplierId)
                selectedCode = currentCode
            } catch (e: Exception) {
                android.util.Log.e("PriceListTemplateSelectDialog", "Failed to load supplier data", e)
                errorMessage = "שגיאה בטעינת נתוני הספק"
            } finally {
                isLoading = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { 
            Text(
                if (supplierName != null) "בחירת תבנית מחירון לספק: $supplierName" 
                else "בחירת תבנית מחירון"
            ) 
        },
        text = {
            if (isLoading) {
                CircularProgressIndicator()
            } else {
                Column {
                    Text(
                        "בחר תבנית מחירון:",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    // Option 1: No template
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = (selectedCode == null || selectedCode == PriceListImportFunctionCodes.NONE),
                                onClick = { 
                                    selectedCode = PriceListImportFunctionCodes.NONE
                                    errorMessage = null
                                }
                            )
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (selectedCode == null || selectedCode == PriceListImportFunctionCodes.NONE),
                            onClick = { 
                                selectedCode = PriceListImportFunctionCodes.NONE
                                errorMessage = null
                            }
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "ללא תבנית מחירון",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                    
                    // Option 2: Excel import for Pri
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = (selectedCode == PriceListImportFunctionCodes.PRI_EXCEL_2025),
                                onClick = { 
                                    selectedCode = PriceListImportFunctionCodes.PRI_EXCEL_2025
                                    errorMessage = null
                                }
                            )
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (selectedCode == PriceListImportFunctionCodes.PRI_EXCEL_2025),
                            onClick = { 
                                selectedCode = PriceListImportFunctionCodes.PRI_EXCEL_2025
                                errorMessage = null
                            }
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                "יבוא מחירון מאקסל – פרי",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "מחירון שקלי/דולרי לפי קובץ אקסל של פרי",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    
                    if (errorMessage != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = errorMessage!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    scope.launch {
                        try {
                            val codeToSave = if (selectedCode == PriceListImportFunctionCodes.NONE) {
                                null
                            } else {
                                selectedCode
                            }
                            
                            db.supplierDao().updatePriceListImportFunctionCode(supplierId, codeToSave)
                            onSaved()
                            onDismiss()
                        } catch (e: Exception) {
                            android.util.Log.e("PriceListTemplateSelectDialog", "Failed to save price list import function", e)
                            errorMessage = "שגיאה בשמירה: ${e.message}"
                        }
                    }
                }
            ) {
                Text("שמור")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("בטל")
            }
        }
    )
}

