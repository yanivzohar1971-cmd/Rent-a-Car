package com.rentacar.app.ui.dialogs

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.TableView
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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

    val items = viewModel.availableFunctions.map { function ->
        ModernSelectionItem(
            key = function.code.toString(),
            title = function.label,
            icon = when (function.code) {
                1 -> Icons.Filled.TableView
                2 -> Icons.Filled.Description
                3 -> Icons.Filled.Description
                4 -> Icons.Filled.Email
                else -> Icons.Filled.UploadFile
            }
        )
    }

    ModernSelectionDialog(
        title = "בחירת סוג יבוא לספק",
        headerIcon = Icons.Filled.UploadFile,
        items = items,
        selectedKey = selectedCode?.toString(),
        onItemSelected = { key ->
            key.toIntOrNull()?.let {
                viewModel.selectFunction(it)
                errorMessage = null
            }
        },
        onDismiss = onDismiss,
        footerContent = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        val code = selectedCode
                        if (code == null) {
                            errorMessage = "יש לבחור סוג יבוא לפני שמירה"
                            return@Button
                        }
                        scope.launch {
                            try {
                                viewModel.assignFunctionToSupplier(supplierId)
                                onSaved()
                                onDismiss()
                            } catch (e: Exception) {
                                android.util.Log.e("TemplateSelectDialog", "Failed to assign function to supplier", e)
                                errorMessage = "שגיאה בשמירה: ${e.message}"
                            }
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
                TextButton(onClick = onDismiss) {
                    Text("בטל")
                }
            }
            if (errorMessage != null) {
                Spacer(modifier = Modifier.width(1.dp))
                Text(
                    text = errorMessage!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    )
}
