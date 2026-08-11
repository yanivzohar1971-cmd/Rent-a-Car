package com.rentacar.app.ui.dialogs

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.CommissionReconciliationRepository
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun CommissionReportTemplateSelectDialog(
    visible: Boolean,
    supplierId: Long,
    onDismiss: () -> Unit,
    onSaved: () -> Unit
) {
    if (!visible) return

    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val repository = remember {
        CommissionReconciliationRepository(
            db,
            CommissionReportImportDispatcher(
                context,
                db.supplierCommissionImportConfigDao(),
                db.supplierCommissionReportImportDao()
            )
        )
    }
    val scope = rememberCoroutineScope()
    var selectedCode by remember { mutableStateOf<Int?>(null) }
    var selectedVersion by remember { mutableStateOf(1) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(visible, supplierId) {
        if (visible) {
            val uid = CurrentUserProvider.requireCurrentUid()
            val config = withContext(Dispatchers.IO) {
                repository.getActiveConfig(supplierId, uid)
            }
            selectedCode = config?.parserCode
            selectedVersion = config?.parserVersion ?: 1
        }
    }

    val items = CommissionReportParserCodes.availableParsers.map { parser ->
        ModernSelectionItem(
            key = "${parser.code}:${parser.version}",
            title = parser.label,
            subtitle = "גרסה ${parser.version}",
            icon = Icons.Filled.TableChart
        )
    }

    ModernSelectionDialog(
        title = "תבנית דוח עמלות",
        headerIcon = Icons.Filled.Assessment,
        items = items,
        selectedKey = selectedCode?.let { "$it:$selectedVersion" },
        onItemSelected = { key ->
            val parts = key.split(':')
            selectedCode = parts.getOrNull(0)?.toIntOrNull()
            selectedVersion = parts.getOrNull(1)?.toIntOrNull() ?: 1
            errorMessage = null
        },
        onDismiss = onDismiss,
        confirmLabel = "שמור",
        cancelLabel = "ביטול",
        onConfirm = {
            val code = selectedCode
            if (code == null) {
                errorMessage = "יש לבחור תבנית"
            } else {
                scope.launch {
                    val uid = CurrentUserProvider.requireCurrentUid()
                    withContext(Dispatchers.IO) {
                        repository.saveConfig(supplierId, code, selectedVersion, uid)
                    }
                    onSaved()
                    onDismiss()
                }
            }
        }
    )
    // Keep error surfacing via toast if needed; selection UI stays compact.
    if (errorMessage != null) {
        android.util.Log.w("CommissionReportTemplateSelectDialog", errorMessage!!)
    }
}
