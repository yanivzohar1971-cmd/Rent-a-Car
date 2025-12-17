package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.Alignment
import com.rentacar.app.ui.components.AppButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.ui.vm.ExportViewModel
import androidx.compose.ui.platform.LocalContext
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.ui.navigation.Routes
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.net.Uri
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import com.rentacar.app.di.DatabaseModule

@Composable
fun ExportScreen(navController: NavHostController, vm: ExportViewModel) {
    val jsonState = remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current

    val createJson = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri: Uri? ->
        uri?.let { u -> jsonState.value?.let { content -> context.contentResolver.openOutputStream(u)?.use { it.write(content.toByteArray()) } } }
    }
    val csvContent = remember { mutableStateOf<String?>(null) }
    val csvFileName = remember { mutableStateOf("data.csv") }
    val showCsv = remember { mutableStateOf(false) }
    val createCsvDynamic = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri: Uri? ->
        uri?.let { u -> csvContent.value?.let { content -> context.contentResolver.openOutputStream(u)?.use { it.write(content.toByteArray()) } } }
    }
    val importResult = remember { mutableStateOf<Boolean?>(null) }
    val importJson = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let { vm.importSnapshotJson(context, it) { ok -> importResult.value = ok } }
    }

    // אישור פעולות (דיאלוג)
    val showConfirm = remember { mutableStateOf(false) }
    val confirmTitle = remember { mutableStateOf("") }
    val confirmMessage = remember { mutableStateOf("") }
    val pendingAction = remember { mutableStateOf<(() -> Unit)?>(null) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        TitleBar(
            title = "ניהול נתונים",
            color = LocalTitleColor.current,
            onHomeClick = { navController.navigate(Routes.Dashboard) }
        )
        Spacer(Modifier.height(12.dp))
        Text("JSON", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
            AppButton(
                onClick = {
                    confirmTitle.value = "אישור גיבוי"
                    confirmMessage.value = "האם אתה בטוח שברצונך לבצע גיבוי?"
                    pendingAction.value = {
                        vm.buildSnapshotJsonIncludingSettings(context) { json ->
                            jsonState.value = json
                            createJson.launch("snapshot.json")
                        }
                    }
                    showConfirm.value = true
                },
                containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)
            ) { Text("גיבוי") }
            AppButton(
                onClick = {
                    confirmTitle.value = "אישור שחזור"
                    confirmMessage.value = "האם אתה בטוח שברצונך לשחזר נתונים? פעולה זו עלולה להחליף נתונים קיימים."
                    pendingAction.value = { importJson.launch("*/*") }
                    showConfirm.value = true
                },
                containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)
            ) { Text("שחזור") }
        }
        Spacer(Modifier.height(16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
            AppButton(onClick = { showCsv.value = !showCsv.value }) {
                Text(if (showCsv.value) "CSV: ON" else "CSV: OFF")
            }
        }
        if (showCsv.value) {
            Text("CSV", fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildCustomersCsv { csv -> csvContent.value = csv; csvFileName.value = "customers.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא לקוחות") }
                val importCustomers = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importCustomersCsv(context, it) { } } }
                AppButton(onClick = { importCustomers.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא לקוחות") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildSuppliersCsv { csv -> csvContent.value = csv; csvFileName.value = "suppliers.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא ספקים") }
                val importSuppliers = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importSuppliersCsv(context, it) { } } }
                AppButton(onClick = { importSuppliers.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא ספקים") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildBranchesCsv { csv -> csvContent.value = csv; csvFileName.value = "branches.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא סניפים") }
                val importBranches = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importBranchesCsv(context, it) { } } }
                AppButton(onClick = { importBranches.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא סניפים") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildCarTypesCsv { csv -> csvContent.value = csv; csvFileName.value = "car_types.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא סוגי רכב") }
                val importCarTypes = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importCarTypesCsv(context, it) { } } }
                AppButton(onClick = { importCarTypes.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא סוגי רכב") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildReservationsCsv { csv -> csvContent.value = csv; csvFileName.value = "reservations.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא הזמנות") }
                val importReservations = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importReservationsCsv(context, it) { } } }
                AppButton(onClick = { importReservations.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא הזמנות") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildPaymentsCsv { csv -> csvContent.value = csv; csvFileName.value = "payments.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא תשלומים") }
                val importPayments = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importPaymentsCsv(context, it) { } } }
                AppButton(onClick = { importPayments.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא תשלומים") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.exportCarSales(context) }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא מכירות") }
                AppButton(onClick = { vm.exportRequests(context) }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא בקשות") }
            }
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween) {
                AppButton(onClick = { vm.buildSettingsCsv(context) { csv -> csvContent.value = csv; csvFileName.value = "settings.csv"; createCsvDynamic.launch(csvFileName.value) } }, containerColor = androidx.compose.ui.graphics.Color(0xFF4CAF50)) { Text("ייצוא הגדרות מערכת") }
                val importSettings = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? -> uri?.let { vm.importSettingsCsv(context, it) { } } }
                AppButton(onClick = { importSettings.launch("text/*") }, containerColor = androidx.compose.ui.graphics.Color(0xFFF44336)) { Text("ייבוא הגדרות מערכת") }
            }
        }
        Spacer(Modifier.height(16.dp))
    }

    if (showConfirm.value) {
        AlertDialog(
            onDismissRequest = { showConfirm.value = false },
            title = { Text(confirmTitle.value) },
            text = { Text(confirmMessage.value) },
            confirmButton = {
                Button(onClick = {
                    showConfirm.value = false
                    pendingAction.value?.invoke()
                    pendingAction.value = null
                }) { Text("אישור") }
            },
            dismissButton = {
                Button(onClick = { showConfirm.value = false }) { Text("בטל") }
            }
        )
    }

    // Show result for import
    when (importResult.value) {
        true -> AlertDialog(
            onDismissRequest = { importResult.value = null },
            title = { Text("שחזור הושלם") },
            text = { Text("הנתונים שוחזרו בהצלחה.") },
            confirmButton = { Button(onClick = { importResult.value = null }) { Text("סגור") } }
        )
        false -> AlertDialog(
            onDismissRequest = { importResult.value = null },
            title = { Text("שגיאה בשחזור") },
            text = { Text("לא התאפשר לשחזר. ודא שקובץ הגיבוי בפורמט JSON תקין.") },
            confirmButton = { Button(onClick = { importResult.value = null }) { Text("סגור") } }
        )
        null -> {}
    }
}
