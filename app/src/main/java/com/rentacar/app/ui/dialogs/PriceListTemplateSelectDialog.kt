package com.rentacar.app.ui.dialogs

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.TableView
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.rentacar.app.data.PriceListImportFunctionCodes
import com.rentacar.app.data.auth.CurrentUserProvider
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
    var selectedCode by remember { mutableStateOf<Int?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(visible, supplierId) {
        if (visible) {
            isLoading = true
            try {
                val currentUid = CurrentUserProvider.requireCurrentUid()
                val supplier = db.supplierDao().getById(supplierId, currentUid).first()
                supplierName = supplier?.name
                selectedCode = db.supplierDao().getPriceListImportFunctionCode(supplierId, currentUid)
                    ?: PriceListImportFunctionCodes.NONE
            } catch (e: Exception) {
                android.util.Log.e("PriceListTemplateSelectDialog", "Failed to load supplier data", e)
                errorMessage = "שגיאה בטעינת נתוני הספק"
            } finally {
                isLoading = false
            }
        }
    }

    if (isLoading) {
        Dialog(onDismissRequest = onDismiss) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        return
    }

    val noneKey = PriceListImportFunctionCodes.NONE.toString()
    val items = listOf(
        ModernSelectionItem(
            key = noneKey,
            title = "ללא תבנית מחירון",
            subtitle = "ללא יבוא מחירון מוגדר",
            icon = Icons.Filled.Block
        ),
        ModernSelectionItem(
            key = PriceListImportFunctionCodes.PRI_EXCEL_2025.toString(),
            title = "יבוא מחירון מאקסל – פרי",
            subtitle = "מחירון שקלי/דולרי לפי קובץ אקסל של פרי",
            icon = Icons.Filled.TableView
        )
    )

    ModernSelectionDialog(
        title = if (supplierName != null) "בחירת תבנית מחירון לספק: $supplierName" else "בחירת תבנית מחירון",
        headerIcon = Icons.Filled.UploadFile,
        items = items,
        selectedKey = (selectedCode ?: PriceListImportFunctionCodes.NONE).toString(),
        onItemSelected = { key ->
            selectedCode = key.toIntOrNull()
            errorMessage = null
        },
        onDismiss = onDismiss,
        confirmLabel = "שמור",
        cancelLabel = "בטל",
        onConfirm = {
            scope.launch {
                try {
                    val codeToSave = if (selectedCode == null || selectedCode == PriceListImportFunctionCodes.NONE) {
                        null
                    } else {
                        selectedCode
                    }
                    val currentUid = CurrentUserProvider.requireCurrentUid()
                    db.supplierDao().updatePriceListImportFunctionCode(supplierId, codeToSave, currentUid)
                    onSaved()
                    onDismiss()
                } catch (e: Exception) {
                    android.util.Log.e("PriceListTemplateSelectDialog", "Failed to save price list import function", e)
                    errorMessage = "שגיאה בשמירה: ${e.message}"
                }
            }
        }
    )
    if (errorMessage != null) {
        android.util.Log.w("PriceListTemplateSelectDialog", errorMessage!!)
    }
}
