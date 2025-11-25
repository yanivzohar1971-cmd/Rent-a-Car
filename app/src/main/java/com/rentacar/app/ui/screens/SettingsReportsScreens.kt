package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.GlobalProgressDialog
import com.rentacar.app.ui.components.SyncProgressDialog
import com.rentacar.app.data.sync.SyncProgressRepository
import androidx.compose.material3.Text
import androidx.compose.material3.OutlinedTextField
import com.rentacar.app.ui.components.BackButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.reports.CsvExporter
import com.rentacar.app.ui.navigation.Routes
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import com.rentacar.app.prefs.SettingsStore
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.LocalTitleColor
import androidx.compose.ui.Alignment
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkInfo
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import com.rentacar.app.work.BackupWorker
import android.provider.MediaStore
import android.database.Cursor
import android.widget.Toast
import java.io.File
import android.content.ContentUris
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.IconButton
import kotlinx.coroutines.launch
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.draw.alpha
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import com.google.firebase.firestore.FirebaseFirestore
import android.util.Log
import com.rentacar.app.data.sync.DefaultDataSyncCheckRepository
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.ui.settings.SettingsSyncCheckViewModel
import androidx.compose.runtime.collectAsState
import com.rentacar.app.ui.sync.SyncNowViewModel
import com.rentacar.app.ui.sync.SyncUiEvent

@Composable
fun SettingsScreen(navController: NavHostController, exportVm: com.rentacar.app.ui.vm.ExportViewModel) {
    val context = LocalContext.current
    val view = androidx.compose.ui.platform.LocalView.current
    val store = remember { SettingsStore(context) }
    var showRestore by remember { mutableStateOf(false) }
    var showAutoRestore by remember { mutableStateOf(false) }
    var showCloudRestore by remember { mutableStateOf(false) }
    var backupInProgress by remember { mutableStateOf(false) }
    var showBackupSuccess by remember { mutableStateOf(false) }
    // אין שידור; נשתמש בפולינג של WorkManager למניעת תקיעות
    // Fallback timeout: auto-dismiss progress if something goes wrong with broadcast
    androidx.compose.runtime.LaunchedEffect(backupInProgress) {
        if (backupInProgress) {
            kotlinx.coroutines.delay(60000)
            if (backupInProgress) backupInProgress = false
        }
    }
    // Poll WorkManager for completion to close dialog quickly
    androidx.compose.runtime.LaunchedEffect(backupInProgress) {
        if (backupInProgress) {
            androidx.work.WorkManager.getInstance(context)
                .getWorkInfosForUniqueWorkFlow("manual_json_backup")
                .collect { infos ->
                    val finished = infos.any { workInfo: androidx.work.WorkInfo -> workInfo.state.isFinished }
                    if (finished) {
                        backupInProgress = false
                        showBackupSuccess = infos.any { workInfo: androidx.work.WorkInfo -> workInfo.state == androidx.work.WorkInfo.State.SUCCEEDED }
                    }
                }
        }
    }
    val currentButtonHex = store.buttonColor().collectAsState(initial = "#2196F3").value
    val currentTitleBgHex = store.titleColor().collectAsState(initial = "#2196F3").value
    val currentTitleTextHex = store.titleTextColor().collectAsState(initial = "#FFFFFF").value
    val currentPrivateHex = store.customerPrivateColor().collectAsState(initial = "#2196F3").value
    val currentCompanyHex = store.customerCompanyColor().collectAsState(initial = "#4CAF50").value
    val circleEnabled = store.titleIconCircleEnabled().collectAsState(initial = false).value
    val decimalOnePlace by store.decimalOnePlace().collectAsState(initial = "")
    val circleHex = store.titleIconCircleColor().collectAsState(initial = "#33000000").value
    val resFutureHex = store.reservationIconFutureColor().collectAsState(initial = "#2196F3").value
    val resTodayHex = store.reservationIconTodayColor().collectAsState(initial = "#4CAF50").value
    val resPastHex = store.reservationIconPastColor().collectAsState(initial = "#9E9E9E").value
    val c1to6 = store.commissionDays1to6().collectAsState(initial = "15").value
    val c7to23 = store.commissionDays7to23().collectAsState(initial = "10").value
    val c24plus = store.commissionDays24plus().collectAsState(initial = "7").value
    val cExtra30 = store.commissionExtraPer30().collectAsState(initial = "7").value
    
    
    // Sync check ViewModel
    val db = DatabaseModule.provideDatabase(context)
    val firestore = FirebaseFirestore.getInstance()
    val syncCheckRepository = remember { DefaultDataSyncCheckRepository(db, firestore) }
    val syncCheckViewModel = remember { SettingsSyncCheckViewModel(syncCheckRepository) }
    val syncCheckState by syncCheckViewModel.uiState.collectAsState()
    
    // Sync now ViewModel
    val syncNowViewModel = remember { SyncNowViewModel(context) }
    val syncProgressState by syncNowViewModel.syncProgressState.collectAsState()
    val isSyncRunning by syncNowViewModel.isSyncRunning.collectAsState()
    
    // WorkManager for restore
    val workManager = remember { WorkManager.getInstance(context) }
    
    // Collect sync events and show toasts
    LaunchedEffect(Unit) {
        syncNowViewModel.syncEvents.collect { event ->
            when (event) {
                is SyncUiEvent.SyncStarted -> {
                    // Optional: short toast "מתחיל סנכרון נתונים..."
                }
                is SyncUiEvent.SyncCompletedSuccess -> {
                    if (!event.hadItems) {
                        Toast.makeText(
                            context,
                            "הכל כבר מסונכרן – אין נתונים לעדכן",
                            Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        Toast.makeText(
                            context,
                            "הסנכרון הסתיים בהצלחה",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
                is SyncUiEvent.SyncCompletedError -> {
                    Toast.makeText(
                        context,
                        "שגיאה בסנכרון: ${event.message ?: "נסה שוב מאוחר יותר"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
                is SyncUiEvent.SyncAlreadyRunning -> {
                    Toast.makeText(
                        context,
                        "סנכרון כבר מתבצע ברקע – נא להמתין לסיום",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
    
    // Show sync progress dialog ONLY when:
    // 1. Sync is actually running (isRunning == true)
    // 2. AND there are items to sync (overallTotalItems > 0)
    // Do NOT show dialog when there are no dirty items (overallTotalItems == 0)
    val showSyncProgressDialog = remember(isSyncRunning, syncProgressState) {
        val hasItemsToSync = syncProgressState.overallTotalItems > 0
        val isActuallyRunning = isSyncRunning || syncProgressState.isRunning
        // Only show if running AND there are items to sync
        isActuallyRunning && hasItemsToSync
    }
    
    // Observe restore work state
    val restoreWorkInfos by workManager
        .getWorkInfosByTagFlow("cloud_restore_now")
        .collectAsState(initial = emptyList())
    
    val isRestoreRunning = remember(restoreWorkInfos) {
        restoreWorkInfos.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }
    }
    val lastRestoreInfo = remember(restoreWorkInfos) {
        restoreWorkInfos.firstOrNull()
    }
    
    // Determine which progress message to show (priority: restore > data check > backup)
    // Note: Sync now uses SyncProgressDialog instead of GlobalProgressDialog
    val progressMessage: String? = remember(isRestoreRunning, syncCheckState.isLoading, backupInProgress) {
        when {
            isRestoreRunning -> "שחזור נתונים מתבצע..."
            syncCheckState.isLoading -> "בדיקת סנכרון נתונים מתבצעת..."
            backupInProgress -> "גיבוי מתבצע..."
            else -> null
        }
    }
    
    // Backup can be cancelled, others cannot
    val canDismissProgress = remember(backupInProgress) { backupInProgress }
    
    
    // Show toast when restore finishes
    LaunchedEffect(lastRestoreInfo?.state) {
        val info = lastRestoreInfo ?: return@LaunchedEffect
        if (info.state.isFinished) {
            val restoredCount = info.outputData.getInt("restoredCount", -1)
            when {
                info.state == WorkInfo.State.SUCCEEDED && restoredCount > 0 -> {
                    Toast.makeText(context, "שחזור הנתונים הושלם ($restoredCount רשומות שוחזרו)", Toast.LENGTH_LONG).show()
                }
                info.state == WorkInfo.State.SUCCEEDED && restoredCount == 0 -> {
                    Toast.makeText(context, "לא נמצאו נתונים לשחזור.", Toast.LENGTH_LONG).show()
                }
                info.state == WorkInfo.State.FAILED -> {
                    Toast.makeText(context, "שגיאה בשחזור הנתונים. נסה שוב.", Toast.LENGTH_LONG).show()
                }
                info.state == WorkInfo.State.CANCELLED -> {
                    Toast.makeText(context, "שחזור בוטל.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        TitleBar("הגדרות", LocalTitleColor.current, onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Dashboard) })
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = { navController.navigate("export") }) { Text("ייצוא/ייבוא נתונים") }
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = { writeFirestoreDebugRecord(context) }) { Text("בדיקת Firebase") }
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = { syncCheckViewModel.onOpenSyncCheckDialog() }) {
            Text("בדיקת סנכרון נתונים")
        }
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = {
            showCloudRestore = true
        }) {
            Text("שחזור נתונים מהענן")
        }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = { syncNowViewModel.onSyncNowClicked() },
            enabled = !isSyncRunning,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isSyncRunning) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(16.dp)
                        .padding(end = 8.dp),
                    strokeWidth = 2.dp
                )
                Text("סינכרון מתבצע...")
            } else {
                Text("סנכרון נתונים עכשיו")
            }
        }
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = {
            showRestore = true
        }) { Text("שחזור מגיבוי") }
        Spacer(Modifier.height(8.dp))
        AppButton(onClick = {
            showAutoRestore = true
        }) { Text("שחזור מגיבוי ידני") }
        Spacer(Modifier.height(8.dp))
        if (showRestore) {
            RestoreDialog(context, exportVm) { showRestore = false }
        }
        if (showAutoRestore) {
            ManualRestoreDialog(context, exportVm) { showAutoRestore = false }
        }
        
        // Cloud restore confirmation dialog
        if (showCloudRestore) {
            AlertDialog(
                onDismissRequest = { showCloudRestore = false },
                title = { Text("שחזור נתונים מהענן") },
                text = {
                    Column {
                        Text("פעולה זו תבצע:")
                        Spacer(Modifier.height(4.dp))
                        Text("• טעינת נתונים מהענן (Firestore)")
                        Text("• הוספת רשומות חסרות בלבד למסד הנתונים המקומי")
                        Spacer(Modifier.height(8.dp))
                        Text("פעולה זו לא תבצע:")
                        Spacer(Modifier.height(4.dp))
                        Text("• מחיקת נתונים ב-Room")
                        Text("• עדכון רשומות קיימות ב-Room")
                        Text("• מחיקת נתונים בענן")
                    }
                },
                confirmButton = {
                    AppButton(onClick = {
                        showCloudRestore = false
                        val request = OneTimeWorkRequestBuilder<com.rentacar.app.work.CloudRestoreWorker>()
                            .setConstraints(
                                Constraints.Builder()
                                    .setRequiredNetworkType(NetworkType.CONNECTED)
                                    .build()
                            )
                            .addTag("cloud_restore_now")
                            .build()
                        workManager.enqueue(request)
                    }) {
                        Text("אישור")
                    }
                },
                dismissButton = {
                    androidx.compose.material3.TextButton(onClick = { showCloudRestore = false }) {
                        Text("ביטול")
                    }
                }
            )
        }
        
        // Data sync check dialog
        DataSyncCheckDialog(
            uiState = syncCheckState,
            onDismiss = { syncCheckViewModel.onDismissSyncCheckDialog() },
            onRetry = { syncCheckViewModel.onRetrySyncCheck() }
        )
        
        AppButton(enabled = !backupInProgress, onClick = {
            // Runtime permission for legacy devices (API < 29)
            val sdk = android.os.Build.VERSION.SDK_INT
            if (sdk < 29) {
                val pm = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                if (pm != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    android.widget.Toast.makeText(context, "נדרשת הרשאת כתיבה לאחסון", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
            backupInProgress = true
            view.announceForAccessibility("מבצע גיבוי")
            android.widget.Toast.makeText(context, "מבצע גיבוי...", android.widget.Toast.LENGTH_LONG).show()
            val req = OneTimeWorkRequestBuilder<BackupWorker>().build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "manual_json_backup",
                ExistingWorkPolicy.REPLACE,
                req
            )
        }) { Text("גיבוי עכשיו") }
        Spacer(Modifier.height(8.dp))
        // Sync progress dialog (detailed progress for sync operations)
        SyncProgressDialog(
            visible = showSyncProgressDialog,
            state = syncProgressState,
            onDismiss = {
                // Reset progress state when dialog is dismissed
                SyncProgressRepository.reset()
            }
        )
        
        // Global progress dialog for other long-running operations (restore, backup, data check)
        GlobalProgressDialog(
            visible = progressMessage != null,
            message = progressMessage ?: "",
            dismissOnBack = canDismissProgress,
            dismissOnClickOutside = false,
            onDismissRequest = {
                // Only allow dismiss for backup (user can cancel it)
                if (backupInProgress) {
                    WorkManager.getInstance(context).cancelUniqueWork("manual_json_backup")
                    backupInProgress = false
                }
            }
        )
        if (showBackupSuccess) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showBackupSuccess = false },
                confirmButton = { AppButton(onClick = { showBackupSuccess = false }) { Text("סגור") } },
                title = { Text("הצלחה") },
                text = { Text("הגיבוי הסתיים בהצלחה") }
            )
        }

        Text("צבע כפתורים")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("#2196F3","#4CAF50","#FF9800","#F44336").forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = currentButtonHex.equals(hex, ignoreCase = true)
                AppButton(onClick = { GlobalScope.launch(Dispatchers.IO) { store.setButtonColor(hex) } }, modifier = Modifier.padding(end = 8.dp), containerColor = c) {
                    Text(if (selected) "✓" else " ", color = Color.White)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("מע\"מ (%)")
        Spacer(Modifier.height(4.dp))
        var vatInput by rememberSaveable { mutableStateOf(decimalOnePlace) }
        androidx.compose.runtime.LaunchedEffect(decimalOnePlace) {
            if (decimalOnePlace != vatInput) vatInput = decimalOnePlace
        }
        Row(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = vatInput,
            onValueChange = { new ->
                // Normalize comma to dot
                val norm = new.replace(',', '.')
                // Keep only digits and a single dot
                val cleaned = buildString {
                    var dotSeen = false
                    norm.forEach { ch ->
                        if (ch.isDigit()) append(ch) else if (ch == '.' && !dotSeen) { append(ch); dotSeen = true }
                    }
                }
                // Limit total length to 4 chars
                if (cleaned.length > 4) return@OutlinedTextField
                // Allow transient empty
                if (cleaned.isEmpty()) { vatInput = cleaned; GlobalScope.launch(Dispatchers.IO) { store.setDecimalOnePlace("") }; return@OutlinedTextField }
                // Pattern: up to 2 int digits, optional dot and one decimal digit
                val valid = Regex("^\\d{0,2}(\\.\\d?)?$").matches(cleaned)
                if (valid) {
                    vatInput = cleaned
                    GlobalScope.launch(Dispatchers.IO) { store.setDecimalOnePlace(cleaned) }
                }
            },
            label = { Text("או 17.0") },
            singleLine = true,
            modifier = Modifier.weight(1f),
            textStyle = androidx.compose.ui.text.TextStyle(
                textDirection = androidx.compose.ui.text.style.TextDirection.Ltr,
                textAlign = androidx.compose.ui.text.style.TextAlign.Start
            ),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal)
        )
        }
        Text("צבע כותרת (רקע)")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("#2196F3","#4CAF50","#FF9800","#F44336").forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = currentTitleBgHex.equals(hex, ignoreCase = true)
                AppButton(onClick = { GlobalScope.launch(Dispatchers.IO) { store.setTitleColor(hex) } }, modifier = Modifier.padding(end = 8.dp), containerColor = c) {
                    Text(if (selected) "✓" else " ", color = Color.White)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("צבע טקסט כותרת")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            listOf("#FFFFFF","#000000").forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = currentTitleTextHex.equals(hex, ignoreCase = true)
                val checkColor = if (hex.equals("#FFFFFF", true)) Color.Black else Color.White
                AppButton(onClick = { GlobalScope.launch(Dispatchers.IO) { store.setTitleTextColor(hex) } }, modifier = Modifier.padding(end = 8.dp), containerColor = c) {
                    Text(if (selected) "✓" else " ", color = checkColor)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        TitleBar("צבע טקסט כותרות וברקעו צבע הרקע", LocalTitleColor.current)
        Spacer(Modifier.height(8.dp))

        Spacer(Modifier.height(16.dp))
        Text("עיגול סביב איקון בכותרות")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(if (circleEnabled) "מופעל" else "מכובה", modifier = Modifier.weight(1f))
            Switch(checked = circleEnabled, onCheckedChange = { on -> GlobalScope.launch(Dispatchers.IO) { store.setTitleIconCircleEnabled(on) } }, colors = SwitchDefaults.colors(checkedThumbColor = Color.White))
        }

        Spacer(Modifier.height(8.dp))
        Text("צבע עיגול איקון כותרת")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val palette = listOf("#33000000", "#552196F3", "#554CAF50", "#55FF9800", "#55F44336", "#FFFFFFFF")
            palette.forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = circleHex.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(c, CircleShape)
                        .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.LightGray, CircleShape)
                        .clickable { GlobalScope.launch(Dispatchers.IO) { store.setTitleIconCircleColor(hex) } },
                    contentAlignment = Alignment.Center
                ) {
                    if (selected) Text("✓", color = if (hex.equals("#FFFFFFFF", true)) Color.Black else Color.White, fontSize = 16.sp)
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("צבעי איקון הזמנה: עתידי / פעיל / סגורה")
        Spacer(Modifier.height(4.dp))
        @Composable
        fun ColorBox(current: String, set: suspend (String)->Unit) = Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val palette = listOf("#2196F3", "#4CAF50", "#FF9800", "#9C27B0", "#3F51B5", "#00BCD4", "#9E9E9E", "#000000")
            palette.forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = current.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(c, CircleShape)
                        .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.LightGray, CircleShape)
                        .clickable { GlobalScope.launch(Dispatchers.IO) { set(hex) } },
                    contentAlignment = Alignment.Center
                ) { if (selected) Text("✓", color = Color.White, fontSize = 16.sp) }
            }
        }
        Text("עתידי")
        ColorBox(resFutureHex) { hex -> store.setReservationIconFutureColor(hex) }
        Spacer(Modifier.height(6.dp))
        Text("פעיל")
        ColorBox(resPastHex) { hex -> store.setReservationIconPastColor(hex) }
        Spacer(Modifier.height(6.dp))
        val resClosedHex = store.reservationIconClosedColor().collectAsState(initial = "#795548").value
        Text("סגורה")
        ColorBox(resClosedHex) { hex -> store.setReservationIconClosedColor(hex) }

        
        // NOTE: Commission rules moved below company color section per request
        Spacer(Modifier.height(16.dp))
        Text("חוקי עמלה (%):")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            var c1State by rememberSaveable { mutableStateOf(c1to6) }
            androidx.compose.runtime.LaunchedEffect(c1to6) { if (c1to6 != c1State) c1State = c1to6 }
            OutlinedTextField(
                value = c1State,
                onValueChange = { v ->
                    val filtered = v.filter { it.isDigit() }.take(2)
                    c1State = filtered
                    GlobalScope.launch(Dispatchers.IO) { store.setCommissionDays1to6(filtered) }
                },
                label = { Text("1–6 ימים") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
            )

            var c7State by rememberSaveable { mutableStateOf(c7to23) }
            androidx.compose.runtime.LaunchedEffect(c7to23) { if (c7to23 != c7State) c7State = c7to23 }
            OutlinedTextField(
                value = c7State,
                onValueChange = { v ->
                    val filtered = v.filter { it.isDigit() }.take(2)
                    c7State = filtered
                    GlobalScope.launch(Dispatchers.IO) { store.setCommissionDays7to23(filtered) }
                },
                label = { Text("7–23 ימים") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
            )
        }
        Spacer(Modifier.height(6.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            var cExtraState by rememberSaveable { mutableStateOf(cExtra30) }
            androidx.compose.runtime.LaunchedEffect(cExtra30) { if (cExtra30 != cExtraState) cExtraState = cExtra30 }
            OutlinedTextField(
                value = cExtraState,
                onValueChange = { v ->
                    val filtered = v.filter { it.isDigit() }.take(2)
                    cExtraState = filtered
                    GlobalScope.launch(Dispatchers.IO) { store.setCommissionExtraPer30(filtered) }
                },
                label = { Text("תוספת לכל 30 יום") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
            )
        }

        Spacer(Modifier.height(8.dp))
        Text("צבע לקוח פרטי (איקון ברשימות)")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val buttonPalette = listOf("#2196F3","#4CAF50","#FF9800","#F44336")
            val extraPalette = listOf("#3F51B5","#00BCD4","#03A9F4")
            val colors = (extraPalette + buttonPalette).distinct()
            colors.forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = currentPrivateHex.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(c, CircleShape)
                        .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.LightGray, CircleShape)
                        .clickable { GlobalScope.launch(Dispatchers.IO) { store.setCustomerPrivateColor(hex) } },
                    contentAlignment = Alignment.Center
                ) {
                    if (selected) Text("✓", color = Color.White, fontSize = 16.sp)
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        Text("צבע לקוח חברה (איקון ברשימות)")
        Spacer(Modifier.height(4.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val buttonPalette = listOf("#2196F3","#4CAF50","#FF9800","#F44336")
            val extraPalette = listOf("#8BC34A","#009688","#CDDC39")
            val colors = (extraPalette + buttonPalette).distinct()
            colors.forEach { hex ->
                val c = Color(android.graphics.Color.parseColor(hex))
                val selected = currentCompanyHex.equals(hex, ignoreCase = true)
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .background(c, CircleShape)
                        .border(if (selected) 2.dp else 1.dp, if (selected) Color.White else Color.LightGray, CircleShape)
                        .clickable { GlobalScope.launch(Dispatchers.IO) { store.setCustomerCompanyColor(hex) } },
                    contentAlignment = Alignment.Center
                ) {
                    if (selected) Text("✓", color = Color.White, fontSize = 16.sp)
                }
            }
        }

        
    }
}

private fun writeFirestoreDebugRecord(context: android.content.Context) {
    val firestore = FirebaseFirestore.getInstance()
    val docId = "test_${System.currentTimeMillis()}"
    val path = "debug_rentacar/$docId"
    
    val payload = mapOf(
        "time" to System.currentTimeMillis(),
        "source" to "rent_a_car_app",
        "note" to "debug connection test"
    )
    
    // Use the safe debug logger (no user-facing errors)
    com.rentacar.app.data.firebase.FirestoreDebugLogger.tryWriteDebugDoc(
        firestore = firestore,
        path = path,
        label = "Firebase Connection Test",
        payload = payload
    )
    
    // Show a simple success message if enabled (non-blocking)
    if (com.rentacar.app.data.firebase.FirestoreDebugLogger.isEnabled()) {
        Toast.makeText(context, "בדיקת Firebase בוצעה (ראה לוגים)", Toast.LENGTH_SHORT).show()
    } else {
        Toast.makeText(context, "Debug logging disabled in release build", Toast.LENGTH_SHORT).show()
    }
}

private data class BackupItem(val uri: android.net.Uri, val name: String)

// רשימת גיבויים אוטומטיים (קבצי .ICE) - לכפתור "שחזור מגיבוי"
private fun listBackups(context: android.content.Context): List<BackupItem> {
    val items = mutableListOf<BackupItem>()
    try {
        val backupDir = File(
            android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
            "MyApp/Backups"
        )
        
        android.util.Log.d("listBackups", "Backup dir: ${backupDir.absolutePath}")
        android.util.Log.d("listBackups", "Exists: ${backupDir.exists()}, IsDirectory: ${backupDir.isDirectory}")
        
        if (backupDir.exists() && backupDir.isDirectory) {
            val allFiles = backupDir.listFiles()
            android.util.Log.d("listBackups", "Total files: ${allFiles?.size ?: 0}")
            
            allFiles?.filter { it.isFile && (it.name.endsWith(".ICE") || it.name.endsWith(".ice")) }
                ?.sortedByDescending { it.lastModified() }
                ?.forEach { file ->
                    android.util.Log.d("listBackups", "Found backup: ${file.name}, size: ${file.length()}")
                    val uri = android.net.Uri.fromFile(file)
                    items += BackupItem(uri, file.name)
                }
        }
        
        android.util.Log.d("listBackups", "Total items: ${items.size}")
    } catch (e: Exception) {
        android.util.Log.e("listBackups", "Error listing backups", e)
    }
    return items
}

@Composable
private fun ManualRestoreDialog(
    context: android.content.Context,
    exportVm: com.rentacar.app.ui.vm.ExportViewModel,
    onDismiss: () -> Unit
) {
    var isProcessing by remember { mutableStateOf(false) }
    
    // בוחר קבצים ידני
    val importJson = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri: android.net.Uri? ->
        if (uri != null) {
            isProcessing = true
            android.util.Log.d("ManualRestoreDialog", "File selected: $uri")
            exportVm.importSnapshotJson(context, uri) { success ->
                isProcessing = false
                android.os.Handler(context.mainLooper).post {
                    if (success) {
                        Toast.makeText(context, "שחזור הושלם בהצלחה! כל הנתונים חזרו.", Toast.LENGTH_LONG).show()
                        onDismiss()
                    } else {
                        Toast.makeText(context, "שגיאה בשחזור - בדוק את הקובץ", Toast.LENGTH_LONG).show()
                    }
                }
            }
        } else {
            android.util.Log.d("ManualRestoreDialog", "No file selected")
            onDismiss()
        }
    }
    
    // פתח את בוחר הקבצים מיד
    androidx.compose.runtime.LaunchedEffect(Unit) {
        importJson.launch("*/*")
    }
    
    // Show progress while processing
    if (isProcessing) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("מייבא נתונים...") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(16.dp))
                    Text("אנא המתן, מייבא את כל הנתונים...")
                }
            },
            confirmButton = {}
        )
    }
}

@Composable
private fun RestoreDialog(
    context: android.content.Context,
    exportVm: com.rentacar.app.ui.vm.ExportViewModel,
    onDismiss: () -> Unit
) {
    var confirmFor: android.net.Uri? by remember { mutableStateOf(null) }
    var selectedUri: android.net.Uri? by remember { mutableStateOf(null) }
    val scope = rememberCoroutineScope()
    val backups = listBackups(context)
    android.util.Log.d("RestoreDialog", "Loaded ${backups.size} backups")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("בחר גיבוי לשחזור") },
        text = {
            Box(modifier = Modifier.fillMaxWidth().height(480.dp)) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(bottom = 96.dp)
                ) {
                    if (backups.isEmpty()) Text("לא נמצאו גיבויים") else backups.forEach { item ->
                        val isSelected = selectedUri == item.uri
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedUri = item.uri }
                                .then(
                                    if (isSelected) Modifier
                                        .background(Color(0x1A4CAF50), androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                        .border(1.dp, Color(0xFF4CAF50), androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                    else Modifier
                                )
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.End
                        ) {
                            Text(
                                item.name,
                                maxLines = 1,
                                style = TextStyle(textDirection = TextDirection.Ltr)
                            )
                            if (isSelected) {
                                Spacer(Modifier.width(6.dp))
                                Icon(Icons.Filled.Check, contentDescription = "נבחר", tint = Color(0xFF4CAF50))
                            }
                            Spacer(Modifier.width(6.dp))
                            Icon(Icons.Filled.Description, contentDescription = null)
                        }
                    }
                }
                val hasSelection = selectedUri != null
                Row(
                    modifier = Modifier.align(Alignment.BottomStart),
                    horizontalArrangement = Arrangement.Start
                ) {
                    androidx.compose.material3.FloatingActionButton(onClick = onDismiss) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                            Icon(Icons.Filled.ExitToApp, contentDescription = "חזרה")
                            Spacer(Modifier.height(2.dp))
                            Text("חזרה")
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    androidx.compose.material3.FloatingActionButton(
                        onClick = {
                            val uri = selectedUri ?: return@FloatingActionButton
                            com.rentacar.app.share.ShareService.shareFile(context, uri, itemName = null)
                        },
                        modifier = Modifier.alpha(if (hasSelection) 1f else 0.4f)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                            Icon(imageVector = androidx.compose.material.icons.Icons.Filled.Share, contentDescription = "שתף")
                            Spacer(Modifier.height(2.dp))
                            Text("שתף")
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    androidx.compose.material3.FloatingActionButton(
                        onClick = {
                            val uri = selectedUri ?: return@FloatingActionButton
                            confirmFor = uri
                        },
                        modifier = Modifier.alpha(if (hasSelection) 1f else 0.4f)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                            Icon(imageVector = Icons.Filled.Restore, contentDescription = "שחזור", modifier = Modifier.size(24.dp))
                            Spacer(Modifier.height(2.dp))
                            Text("שחזור")
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )

    // Confirmation dialog
    if (confirmFor != null) {
        val uri = confirmFor!!
        val displayName = remember(uri) { 
            // Try resolve display name via query; fallback to lastPathSegment
            runCatching {
                val cr = context.contentResolver
                cr.query(uri, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(c.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME)) else null
                }
            }.getOrNull() ?: (uri.lastPathSegment ?: "backup")
        }
        AlertDialog(
            onDismissRequest = { confirmFor = null },
            title = { Text("לאשר שחזור?") },
            text = { Text("לשחזר נתונים מקובץ:\n$displayName") },
            confirmButton = {
                AppButton(onClick = {
                    confirmFor = null
                    scope.launch(Dispatchers.IO) {
                        exportVm.importSnapshotJson(context, uri) { ok ->
                            android.os.Handler(context.mainLooper).post {
                                android.widget.Toast.makeText(
                                    context,
                                    if (ok) "שחזור הושלם בהצלחה" else "כשל בשחזור",
                                    android.widget.Toast.LENGTH_SHORT
                                ).show()
                                onDismiss()
                            }
                        }
                    }
                }) { Text("שחזר") }
            },
            dismissButton = { AppButton(onClick = { confirmFor = null }) { Text("בטל") } }
        )
    }
}

@Composable
private fun TermsDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = { AppButton(onClick = onDismiss) { Text("סגור") } },
        title = { Text("יש להגיע עם") },
        text = {
            Column(modifier = Modifier.fillMaxWidth().height(380.dp).verticalScroll(rememberScrollState())) {
                Text("1. רישיון נהיגה מקורי בתוקף.")
                Spacer(Modifier.height(4.dp))
                Text("2. תעודת זהות מקורית.")
                Spacer(Modifier.height(4.dp))
                Text("3. כרטיס אשראי עם מסגרת פנויה (מינ׳ 2,000 ₪ או לפי מדיניות הספק). בעל הכרטיס צריך להיות נוכח.")
                Spacer(Modifier.height(4.dp))
                Text("4. החברה אינה מתחייבת לדגם או לצבע הרכב.")
                Spacer(Modifier.height(8.dp))
                Text("5. אחריות לביטוח, השתתפות עצמית, וקנסות – לפי תנאי הספק.")
                Spacer(Modifier.height(4.dp))
                Text("6. תוספות (נהג נוסף, כיסא בטיחות, GPS) עשויות לגרור חיוב נוסף.")
                Spacer(Modifier.height(4.dp))
                Text("7. שעות איסוף/החזרה כפופות לזמינות הספק, עיכובים יתומחרו לפי מדיניותו.")
                Spacer(Modifier.height(4.dp))
                Text("8. העמלה לסוכן/מתווך תחושב לפי מספר הימים וסוג ההזמנה כנהוג.")
                Spacer(Modifier.height(4.dp))
                Text("9. בהזמנה חודשית – העמלה משולמת בסיום כל 30 יום, בחודש העוקב.")
                Spacer(Modifier.height(4.dp))
                Text("10. בהזמנה יומית/שבועית – העמלה משולמת בחודש שלאחר תום ההשכרה.")
                Spacer(Modifier.height(4.dp))
                Text("11. זכות לביטול/שינוי כפופה למדיניות הספק ולדין החל.")
                Spacer(Modifier.height(4.dp))
                Text("12. במקרה של סתירה – יגברו תנאי ההתקשרות מול הספק.")
            }
        }
    )
}

@Composable
fun ReportsScreen(navController: NavHostController) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("דוחות (בקרוב)", fontSize = 22.sp)
        Spacer(Modifier.height(8.dp))
        Button(onClick = { /* TODO: build CSV from reservations and share */ }) { Text("יצוא CSV") }
        Spacer(Modifier.height(8.dp))
        
    }
}
