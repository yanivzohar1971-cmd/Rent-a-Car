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
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.ui.vm.TemplateViewModel
import kotlinx.coroutines.launch

@Composable
fun TemplateSelectDialog(
    visible: Boolean,
    supplierId: Long,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    if (!visible) return

    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val viewModel = remember {
        TemplateViewModel(db.supplierDao())
    }

    val selectedCode by viewModel.selectedFunctionCode.collectAsState()
    val hasExisting by viewModel.hasExistingFunction.collectAsState()
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(visible, supplierId) {
        if (visible) {
            viewModel.loadCurrentFunction(supplierId)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("בחירת סוג יבוא לספק") },
        text = {
            Column {
                Text("בחר סוג יבוא:", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                
                viewModel.availableFunctions.forEach { function ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = (function.code == selectedCode),
                                onClick = { 
                                    viewModel.selectFunction(function.code)
                                    errorMessage = null
                                }
                            )
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (function.code == selectedCode),
                            onClick = null
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = function.label,
                            style = MaterialTheme.typography.bodyLarge
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
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        val code = selectedCode
                        
                        if (code == null) {
                            errorMessage = "יש לבחור סוג יבוא לפני שמירה"
                            return@Button
                        }
                        
                        scope.launch {
                            viewModel.assignFunctionToSupplier(supplierId)
                            onSaved()
                            onDismiss()
                        }
                    }
                ) {
                    Text("שייך")
                }
                
                if (hasExisting) {
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                viewModel.clearFunctionFromSupplier(supplierId)
                                onSaved()
                                onDismiss()
                            }
                        },
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text("בטל שיוך")
                    }
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("בטל")
            }
        }
    )
}
