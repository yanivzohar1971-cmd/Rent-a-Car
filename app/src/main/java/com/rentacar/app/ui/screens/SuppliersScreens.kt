package com.rentacar.app.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.data.Supplier
import com.rentacar.app.prefs.SettingsStore
import com.rentacar.app.ui.components.AppButton
import com.rentacar.app.ui.components.BranchCard
import com.rentacar.app.ui.components.ListItemModel
import com.rentacar.app.ui.components.SupplierCard
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.components.AppSearchBar
import com.rentacar.app.ui.components.AppEmptySearchState
import com.rentacar.app.ui.vm.SuppliersViewModel
import androidx.compose.runtime.derivedStateOf
import kotlinx.coroutines.delay
import java.io.File
import androidx.core.content.FileProvider
import androidx.compose.foundation.lazy.LazyColumn

@Composable
private fun SupplierDocsManageDialog(
    context: android.content.Context,
    supplierId: Long?,
    onDismiss: () -> Unit
) {
    if (supplierId == null) return

    val backupDir = File(
        android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
        "MyApp/Backups/Suppliers/$supplierId"
    )
    if (!backupDir.exists()) backupDir.mkdirs()

    var files by remember(supplierId) { mutableStateOf<List<Uri>>(emptyList()) }
    var selectedUris by remember { mutableStateOf<Set<Uri>>(emptySet()) }
    var confirmDeleteUris by remember { mutableStateOf<Set<Uri>?>(null) }

    val refreshFiles: () -> Unit = {
        val list = mutableListOf<Uri>()
        try {
            if (backupDir.exists() && backupDir.isDirectory) {
                backupDir.listFiles()?.forEach { file ->
                    if (file.isFile) list.add(Uri.fromFile(file))
                }
            }
        } catch (e: Exception) {
            Toast.makeText(context, "שגיאה בקריאת קבצים: ${e.message}", Toast.LENGTH_SHORT).show()
        }
        files = list
    }

    // עדיף להריץ Side-effect כשה־supplierId משתנה
    LaunchedEffect(supplierId) {
        refreshFiles()
    }

    // העתקת קובץ לתיקיית הספק
    val copyFileToSupplierDir: (Uri) -> Unit = { sourceUri ->
        try {
            val cr = context.contentResolver
            val inputStream = cr.openInputStream(sourceUri)

            val fileName = cr.query(sourceUri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) cursor.getString(nameIndex) else null
            } ?: sourceUri.lastPathSegment ?: "document_${System.currentTimeMillis()}"

            val targetFile = File(backupDir, fileName)
            if (!backupDir.exists()) backupDir.mkdirs()

            inputStream?.use { input ->
                targetFile.outputStream().use { output -> input.copyTo(output) }
            }

            Toast.makeText(context, "הקובץ $fileName הועתק בהצלחה", Toast.LENGTH_SHORT).show()
            refreshFiles()
        } catch (e: Exception) {
            Toast.makeText(context, "שגיאה בהעתקת הקובץ: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // בחירה מרובה
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        uris.forEach(copyFileToSupplierDir)
    }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("ניהול מסמכים") },
        text = {
            Box(modifier = Modifier.fillMaxWidth().height(480.dp)) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(bottom = 96.dp)
                ) {
                    Text("מסמכים עבור ספק ID: $supplierId")
                    Spacer(Modifier.height(8.dp))

                    if (files.isEmpty()) {
                        Text("אין מסמכים")
                    } else {
                        files.forEach { uri ->
                            val isSelected = selectedUris.contains(uri)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedUris =
                                            if (isSelected) selectedUris - uri else selectedUris + uri
                                    }
                                    .background(
                                        color = if (isSelected) Color(0x1A4CAF50) else Color.Transparent,
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                    .then(
                                        if (isSelected) Modifier.border(
                                            1.dp,
                                            Color(0xFF4CAF50),
                                            RoundedCornerShape(8.dp)
                                        ) else Modifier
                                    )
                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.End
                            ) {
                                Text(
                                    uri.lastPathSegment ?: "קובץ",
                                    maxLines = 1,
                                    style = TextStyle(textDirection = TextDirection.Ltr)
                                )
                                Spacer(Modifier.width(6.dp))
                                if (isSelected) {
                                    Icon(
                                        imageVector = Icons.Filled.Description,
                                        contentDescription = null
                                    )
                                    Spacer(Modifier.width(6.dp))
                                } else {
                                    Icon(
                                        imageVector = Icons.Filled.Description,
                                        contentDescription = null
                                    )
                                }
                            }
                        }
                    }
                }

                val hasSelection = selectedUris.isNotEmpty()

                Row(
                    modifier = Modifier.align(Alignment.BottomStart),
                    horizontalArrangement = Arrangement.Start
                ) {
                    // הוסף
                    FloatingActionButton(
                        onClick = { filePickerLauncher.launch("*/*") }
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Icon(Icons.Filled.Add, contentDescription = "הוסף מסמך")
                            Spacer(Modifier.height(2.dp))
                            Text("הוסף")
                        }
                    }
                    Spacer(Modifier.width(8.dp))

                    // שתף
                    FloatingActionButton(
                        onClick = {
                            if (!hasSelection) return@FloatingActionButton
                            try {
                                val contentUris = selectedUris.mapNotNull { fileUri ->
                                    val f = File(fileUri.path ?: return@mapNotNull null)
                                    if (f.exists()) {
                                        FileProvider.getUriForFile(
                                            context,
                                            "${context.packageName}.fileprovider",
                                            f
                                        )
                                    } else null
                                }

                                when (contentUris.size) {
                                    0 -> Toast.makeText(
                                        context,
                                        "הקבצים לא נמצאו",
                                        Toast.LENGTH_SHORT
                                    ).show()

                                    1 -> {
                                        val intent = Intent(Intent.ACTION_SEND).apply {
                                            type = "*/*"
                                            putExtra(
                                                Intent.EXTRA_STREAM,
                                                contentUris.first()
                                            )
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(
                                            Intent.createChooser(
                                                intent,
                                                "שתף מסמך"
                                            )
                                        )
                                    }

                                    else -> {
                                        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                                            type = "*/*"
                                            putParcelableArrayListExtra(
                                                Intent.EXTRA_STREAM,
                                                ArrayList(contentUris)
                                            )
                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                        }
                                        context.startActivity(
                                            Intent.createChooser(
                                                intent,
                                                "שתף מסמכים"
                                            )
                                        )
                                    }
                                }
                            } catch (e: Exception) {
                                Toast.makeText(
                                    context,
                                    "שגיאה בשיתוף: ${e.message}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        },
                        modifier = Modifier.alpha(if (hasSelection) 1f else 0.4f)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Icon(imageVector = Icons.Filled.Share, contentDescription = "שתף")
                            Spacer(Modifier.height(2.dp))
                            Text("שתף")
                        }
                    }
                    Spacer(Modifier.width(8.dp))

                    // מחק
                    FloatingActionButton(
                        onClick = { if (hasSelection) confirmDeleteUris = selectedUris },
                        modifier = Modifier.alpha(if (hasSelection) 1f else 0.4f)
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Icon(imageVector = Icons.Filled.Delete, contentDescription = "מחק")
                            Spacer(Modifier.height(2.dp))
                            Text("מחק")
                        }
                    }
                    Spacer(Modifier.width(8.dp))

                    // סגור
                    FloatingActionButton(onClick = onDismiss) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)
                        ) {
                            Icon(Icons.Filled.ExitToApp, contentDescription = "סגור")
                            Spacer(Modifier.height(2.dp))
                            Text("סגור")
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {}
    )

    if (confirmDeleteUris != null) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDeleteUris = null },
            title = { Text("אישור מחיקה") },
            text = { Text("האם למחוק ${confirmDeleteUris!!.size} מסמכים?") },
            confirmButton = {
                Button(onClick = {
                    confirmDeleteUris?.let { uris ->
                        var deletedCount = 0
                        var errorCount = 0
                        uris.forEach { uri ->
                            try {
                                val file = File(uri.path ?: "")
                                if (file.exists()) {
                                    if (file.delete()) deletedCount++ else errorCount++
                                } else {
                                    errorCount++
                                }
                            } catch (_: Exception) {
                                errorCount++
                            }
                        }
                        when {
                            deletedCount > 0 && errorCount == 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו בהצלחה",
                                    Toast.LENGTH_SHORT
                                ).show()

                            deletedCount > 0 && errorCount > 0 ->
                                Toast.makeText(
                                    context,
                                    "$deletedCount קבצים נמחקו, $errorCount שגיאות",
                                    Toast.LENGTH_LONG
                                ).show()

                            else ->
                                Toast.makeText(
                                    context,
                                    "שגיאה במחיקת הקבצים",
                                    Toast.LENGTH_SHORT
                                ).show()
                        }
                        refreshFiles()
                        selectedUris = emptySet()
                        confirmDeleteUris = null
                    }
                }) { Text("מחק") }
            },
            dismissButton = {
                Button(onClick = { confirmDeleteUris = null }) { Text("ביטול") }
            }
        )
    }
}

@Composable
fun SuppliersListScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    reservationVm: com.rentacar.app.ui.vm.ReservationViewModel,
    pickMode: Boolean = false
) {
    val context = LocalContext.current
    val allSuppliers by vm.list.collectAsState()
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var debouncedQuery by remember { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }
    var showCommissionDialog by rememberSaveable { mutableStateOf(false) }
    var showDocsDialog by rememberSaveable { mutableStateOf(false) }
    var showImportDialog by remember { mutableStateOf(false) }
    var showTemplateDialog by remember { mutableStateOf(false) }
    var lastImportStatus by remember { mutableStateOf<String?>(null) }
    var canImport by remember { mutableStateOf(false) }
    var hasImportLogs by remember { mutableStateOf(false) }
    var refreshTrigger by remember { mutableStateOf(0) }

    // Debounce search query
    LaunchedEffect(searchQuery) {
        delay(300)
        debouncedQuery = searchQuery
    }
    
    // Apply search filter
    val list by remember(debouncedQuery, allSuppliers) {
        derivedStateOf {
            if (debouncedQuery.trim().isEmpty()) {
                allSuppliers
            } else {
                val q = debouncedQuery.trim().lowercase()
                allSuppliers.filter { supplier ->
                    val supplierName = supplier.name.lowercase()
                    val phone = (supplier.phone ?: "").lowercase()
                    val address = (supplier.address ?: "").lowercase()
                    val email = (supplier.email ?: "").lowercase()
                    
                    supplierName.contains(q) || 
                    phone.contains(q) || 
                    address.contains(q) ||
                    email.contains(q)
                }
            }
        }
    }

    // אם הפריט הנבחר נעלם מהרשימה – נבחר ראשון
    LaunchedEffect(list.size) {
        if (selectedId != null && !list.any { it.id == selectedId }) {
            if (list.isNotEmpty()) selectedId = list.first().id
        }
    }
    
    // Check if selected supplier has import function configured
    LaunchedEffect(selectedId, refreshTrigger) {
        if (selectedId != null) {
            val db = com.rentacar.app.di.DatabaseModule.provideDatabase(context)
            val functionCode = db.supplierDao().getImportFunctionCode(selectedId!!)
            canImport = (functionCode != null)
            
            // Check if supplier has import logs
            val logCount = db.importLogDao().hasRunsForSupplier(selectedId!!)
            hasImportLogs = (logCount > 0)
        } else {
            canImport = false
            hasImportLogs = false
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "ספקים",
            color = LocalTitleColor.current,
            onHomeClick = { navController.popBackStack() }
        )
        Spacer(Modifier.height(12.dp))
        
        // Modern search bar
        AppSearchBar(
            query = searchQuery,
            onQueryChange = { searchQuery = it },
            placeholder = "חיפוש ספק לפי שם, טלפון או הערה..."
        )
        
        Spacer(Modifier.height(12.dp))

        // Show list or empty state
        if (list.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
            ) {
                AppEmptySearchState(
                    message = if (debouncedQuery.isNotEmpty()) {
                        "לא נמצאו תוצאות תואמות לחיפוש שלך."
                    } else {
                        "אין ספקים להצגה."
                    }
                )
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                items(list, key = { it.id }) { supplier ->
                    val isSelected = supplier.id == selectedId

                    SupplierCard(
                        supplier = supplier,
                        isSelected = isSelected,
                        onClick = { selectedId = supplier.id },
                        onCallClick = {
                            val intent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:${supplier.phone}")
                            }
                            context.startActivity(intent)
                        }
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        if (pickMode) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                AppButton(
                    enabled = selectedId != null,
                    onClick = {
                        selectedId?.let { id ->
                            navController.previousBackStackEntry?.savedStateHandle?.set("picked_supplier_id", id)
                            navController.popBackStack()
                        }
                    }
                ) { Text("בחר") }
            }
            Spacer(Modifier.height(8.dp))
        }

        // כפתורי תחתית
        val canOpen = selectedId != null
        
        // שורה ראשונה: דוח, תבנית, ייבא, עמלה
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            FloatingActionButton(
                onClick = { 
                    if (canOpen) {
                        val now = java.util.Calendar.getInstance()
                        navController.navigate("monthly_report/${selectedId}/${now.get(java.util.Calendar.YEAR)}/${now.get(java.util.Calendar.MONTH) + 1}")
                    }
                },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📈", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("דוח", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) showTemplateDialog = true },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📋", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("תבנית", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { 
                    if (canOpen && canImport) {
                        showImportDialog = true
                    } else if (canOpen && !canImport) {
                        android.widget.Toast.makeText(
                            context, 
                            "יש להגדיר סוג ייבוא לספק (לחץ על 'תבנית')", 
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                    }
                },
                modifier = Modifier.alpha(if (canOpen && canImport) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📊", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("ייבא", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { 
                    if (canOpen && hasImportLogs) {
                        navController.navigate("import_log/${selectedId}")
                    }
                },
                modifier = Modifier.alpha(if (canOpen && hasImportLogs) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("📜", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("לוג", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) showCommissionDialog = true },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("עמלה", fontSize = 10.sp)
                }
            }
        }
        
        Spacer(Modifier.height(8.dp))
        
        // שורה שניה: מסמכים, סניפים, עריכה, מחיקה, חדש
        val selectedSupplier = list.firstOrNull { it.id == selectedId }
        val hasReservations = selectedSupplier?.id?.let { supplierId ->
            reservationVm.reservationsBySupplier(supplierId).collectAsState(initial = emptyList()).value.isNotEmpty()
        } ?: false
        val deleteEnabled = selectedId != null && !hasReservations
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            FloatingActionButton(
                onClick = { if (canOpen) showDocsDialog = true },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("מסמכים", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) navController.navigate("supplier_branches/$selectedId") },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("סניפים", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (canOpen) navController.navigate("supplier_edit/${selectedId}") },
                modifier = Modifier.alpha(if (canOpen) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("✏️", fontSize = 16.sp, modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                    Spacer(Modifier.height(2.dp))
                    Text("עריכה", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { if (deleteEnabled) showConfirmDelete = true },
                modifier = Modifier.alpha(if (deleteEnabled) 1f else 0.3f)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Text("🗑", fontSize = 16.sp)
                    Spacer(Modifier.height(2.dp))
                    Text("מחק", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = { navController.navigate("supplier_edit") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(6.dp)) {
                    Icon(imageVector = Icons.Filled.Domain, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text("חדש", fontSize = 10.sp)
                }
            }
        }

        // Import status message
        if (lastImportStatus != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = lastImportStatus!!,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                color = if (lastImportStatus!!.contains("נכשל")) 
                    androidx.compose.material3.MaterialTheme.colorScheme.error 
                else 
                    Color(0xFF4CAF50),
                modifier = Modifier.fillMaxWidth()
            )
        }

        // דיאלוג מחיקה
        if (showConfirmDelete) {
            val selectedSupplier2 = list.firstOrNull { it.id == selectedId }
            val hasReservations2 = selectedSupplier2?.id?.let { supplierId ->
                reservationVm.reservationsBySupplier(supplierId).collectAsState(initial = emptyList()).value.isNotEmpty()
            } ?: false

            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showConfirmDelete = false },
                title = { Text("מחיקת ספק") },
                text = {
                    if (hasReservations2) Text("לא ניתן למחוק ספק שבוצעה לו הזמנה בעבר!")
                    else Text("האם אתה בטוח שברצונך למחוק את הספק?")
                },
                confirmButton = {
                    if (!hasReservations2) {
                        androidx.compose.material3.Button(onClick = {
                            val id = selectedId
                            if (id != null) {
                                vm.delete(id)
                                selectedId = null
                            }
                            showConfirmDelete = false
                        }) { Text("מחק") }
                    }
                },
                dismissButton = {
                    androidx.compose.material3.Button(onClick = { showConfirmDelete = false }) {
                        Text(if (hasReservations2) "אישור" else "ביטול")
                    }
                }
            )
        }
    }

    // דיאלוגים
    if (showCommissionDialog) {
        val selectedSupplier = list.firstOrNull { it.id == selectedId }
        if (selectedSupplier != null) {
            CommissionDialog(
                supplier = selectedSupplier,
                onDismiss = { showCommissionDialog = false },
                onSave = { updatedSupplier ->
                    vm.save(updatedSupplier) { }
                    showCommissionDialog = false
                }
            )
        }
    }

    if (showDocsDialog) {
        SupplierDocsManageDialog(LocalContext.current, selectedId) {
            showDocsDialog = false
        }
    }

    if (showImportDialog && selectedId != null) {
        com.rentacar.app.ui.dialogs.ImportDialog(
            visible = true,
            supplierId = selectedId!!,
            onDismiss = { showImportDialog = false },
            onImported = { result ->
                val warn = if (result.warnings.isNotEmpty()) " (עם אזהרות)" else ""
                lastImportStatus = if (result.success) {
                    "ייבוא הצליח: ${result.totalRowsInFile} שורות | נוצרו ${result.createdCount} | עודכנו ${result.updatedCount} | דולגו ${result.skippedCount}$warn"
                } else {
                    "ייבוא נכשל: ${result.errors.joinToString("; ")}"
                }
            }
        )
    }

    if (showTemplateDialog && selectedId != null) {
        com.rentacar.app.ui.dialogs.TemplateSelectDialog(
            visible = true,
            supplierId = selectedId!!,
            onDismiss = { showTemplateDialog = false },
            onSaved = {
                // Template saved successfully - trigger refresh
                refreshTrigger++
            }
        )
    }
}

@Composable
private fun CommissionDialog(
    supplier: Supplier,
    onDismiss: () -> Unit,
    onSave: (Supplier) -> Unit
) {
    val context = LocalContext.current
    val settingsStore = SettingsStore(context)
    val defC1 = settingsStore.commissionDays1to6().collectAsState(initial = "3").value
    val defC7 = settingsStore.commissionDays7to23().collectAsState(initial = "5").value
    val defC24 = settingsStore.commissionDays24plus().collectAsState(initial = "7").value

    var comm1to6 by rememberSaveable { mutableStateOf(supplier.commissionDays1to6?.toString() ?: defC1) }
    var comm7to23 by rememberSaveable { mutableStateOf(supplier.commissionDays7to23?.toString() ?: defC7) }
    var comm24plus by rememberSaveable { mutableStateOf(supplier.commissionDays24plus?.toString() ?: defC24) }
    var attemptedCommissionSave by rememberSaveable { mutableStateOf(false) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("הגדרות עמלה - ${supplier.name}") },
        text = {
            Column {
                Text("הגדר ימי עמלה לכל תקופה:")
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = comm1to6,
                        onValueChange = { v -> comm1to6 = v.filter { it.isDigit() }.take(2) },
                        label = { Text("1–6 ימים *") },
                        isError = attemptedCommissionSave && comm1to6.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = comm7to23,
                        onValueChange = { v -> comm7to23 = v.filter { it.isDigit() }.take(2) },
                        label = { Text("7–23 ימים *") },
                        isError = attemptedCommissionSave && comm7to23.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = comm24plus,
                        onValueChange = { v -> comm24plus = v.filter { it.isDigit() }.take(2) },
                        label = { Text("24+ ימים *") },
                        isError = attemptedCommissionSave && comm24plus.isBlank(),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                        textStyle = TextStyle(textDirection = TextDirection.Ltr, textAlign = TextAlign.Start),
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text("טיפ: מי שלא רוצה עמלה יקליד אפס (0)")
            }
        },
        confirmButton = {
            androidx.compose.material3.Button(onClick = {
                if (comm1to6.isBlank() || comm7to23.isBlank() || comm24plus.isBlank()) {
                    attemptedCommissionSave = true
                    return@Button
                }
                val c1Int = comm1to6.toIntOrNull() ?: defC1.toIntOrNull() ?: 3
                val c7Int = comm7to23.toIntOrNull() ?: defC7.toIntOrNull() ?: 5
                val c24Int = comm24plus.toIntOrNull() ?: defC24.toIntOrNull() ?: 7
                onSave(
                    supplier.copy(
                        commissionDays1to6 = c1Int,
                        commissionDays7to23 = c7Int,
                        commissionDays24plus = c24Int
                    )
                )
            }) { Text("שמור") }
        },
        dismissButton = {
            androidx.compose.material3.Button(onClick = onDismiss) { Text("ביטול") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplierEditScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long? = null
) {
    val context = LocalContext.current
    val list by vm.list.collectAsState()
    val existing = list.firstOrNull { it.id == supplierId }

    val settingsStore = SettingsStore(context)
    val defC1 = settingsStore.commissionDays1to6().collectAsState(initial = "3").value
    val defC7 = settingsStore.commissionDays7to23().collectAsState(initial = "5").value
    val defC24 = settingsStore.commissionDays24plus().collectAsState(initial = "7").value

    var name by rememberSaveable { mutableStateOf(existing?.name ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var address by rememberSaveable { mutableStateOf(existing?.address ?: "") }
    var taxId by rememberSaveable { mutableStateOf(existing?.taxId ?: "") }
    var email by rememberSaveable { mutableStateOf(existing?.email ?: "") }
    var comm1to6 by rememberSaveable { mutableStateOf(existing?.commissionDays1to6?.toString() ?: defC1) }
    var comm7to23 by rememberSaveable { mutableStateOf(existing?.commissionDays7to23?.toString() ?: defC7) }
    var comm24plus by rememberSaveable { mutableStateOf(existing?.commissionDays24plus?.toString() ?: defC24) }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }

    val isEdit = existing != null

    LaunchedEffect(existing?.id) {
        if (existing != null) {
            name = existing.name
            phone = existing.phone ?: ""
            address = existing.address ?: ""
            taxId = existing.taxId ?: ""
            email = existing.email ?: ""
            comm1to6 = existing.commissionDays1to6?.toString() ?: defC1
            comm7to23 = existing.commissionDays7to23?.toString() ?: defC7
            comm24plus = existing.commissionDays24plus?.toString() ?: defC24
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .padding(bottom = 80.dp)
                .verticalScroll(rememberScrollState())
        ) {
            TitleBar(
                title = if (isEdit) "עריכת ספק" else "ספק חדש",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            Spacer(Modifier.height(16.dp))

        // פרטי ספק - Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // כותרת הקטגוריה
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Domain,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "פרטי חברה",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(Modifier.height(12.dp))
                
                // שם חברה
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("שם חברה *") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Domain,
                            contentDescription = null,
                            tint = if (attemptedSave && name.isBlank()) 
                                MaterialTheme.colorScheme.error 
                            else 
                                MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    isError = attemptedSave && name.isBlank(),
                    colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                        containerColor = if (name.isBlank()) Color(0xFFFFC1B6) else Color.Unspecified
                    ),
                    supportingText = { if (attemptedSave && name.isBlank()) Text("שדה חובה") },
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // ח.פ.
                OutlinedTextField(
                    value = taxId,
                    onValueChange = { taxId = it },
                    label = { Text("ח.פ.") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        
        Spacer(Modifier.height(16.dp))
        
        // פרטי קשר - Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            )
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // כותרת הקטגוריה
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Phone,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "פרטי קשר",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(Modifier.height(12.dp))
                
                // טלפון
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("טלפון") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = KeyboardType.Phone
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // כתובת
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("כתובת") },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(Modifier.height(12.dp))
                
                // Email
                OutlinedTextField(
                    value = email,
                    onValueChange = { new ->
                        val allowed: (Char) -> Boolean = { ch ->
                            (ch in 'a'..'z') || (ch in 'A'..'Z') || ch.isDigit() || ch in setOf('@', '.', '_', '-', '+', '\'')
                        }
                        email = new.filter(allowed)
                    },
                    label = { Text("Email", textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth()) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                    textStyle = TextStyle(textDirection = TextDirection.Ltr),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        }
    
        // Fixed bottom action bar
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // כפתור ביטול
            FloatingActionButton(
                onClick = { navController.popBackStack() },
                modifier = Modifier.weight(1f),
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "בטל",
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("בטל", fontWeight = FontWeight.Medium)
                }
            }

            // כפתור שמירה
            FloatingActionButton(
                onClick = {
                    if (name.isBlank()) {
                        attemptedSave = true
                        Toast.makeText(context, "יש למלא שם חברה", Toast.LENGTH_SHORT).show()
                        return@FloatingActionButton
                    }

                    val c1Int = (comm1to6.ifBlank { defC1 }).toIntOrNull() ?: defC1.toIntOrNull() ?: 3
                    val c7Int = (comm7to23.ifBlank { defC7 }).toIntOrNull() ?: defC7.toIntOrNull() ?: 5
                    val c24Int = (comm24plus.ifBlank { defC24 }).toIntOrNull() ?: defC24.toIntOrNull() ?: 7

                    val supplierToSave =
                        if (supplierId != null && supplierId != 0L) {
                            Supplier(
                                id = supplierId,
                                name = name,
                                phone = phone.ifBlank { null },
                                address = address.ifBlank { null },
                                taxId = taxId.ifBlank { null },
                                email = email.ifBlank { null },
                                commissionDays1to6 = c1Int,
                                commissionDays7to23 = c7Int,
                                commissionDays24plus = c24Int
                            )
                        } else {
                            Supplier(
                                name = name,
                                phone = phone.ifBlank { null },
                                address = address.ifBlank { null },
                                taxId = taxId.ifBlank { null },
                                email = email.ifBlank { null },
                                commissionDays1to6 = c1Int,
                                commissionDays7to23 = c7Int,
                                commissionDays24plus = c24Int
                            )
                        }

                    vm.save(supplierToSave) { navController.popBackStack() }
                },
                modifier = Modifier
                    .weight(1f)
                    .alpha(if (name.isNotBlank()) 1f else 0.5f),
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Save,
                        contentDescription = "שמור",
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "שמור",
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplierBranchesScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long,
    reservationVm: com.rentacar.app.ui.vm.ReservationViewModel,
    context: android.content.Context = LocalContext.current
) {
    var selectedBranchId by rememberSaveable { mutableStateOf<Long?>(null) }
    var showConfirmDelete by rememberSaveable { mutableStateOf(false) }

    val branches = vm.branches(supplierId).collectAsState(initial = emptyList()).value

    LaunchedEffect(supplierId) {
        navController.previousBackStackEntry?.savedStateHandle?.set("selected_supplier_id", supplierId)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp).padding(bottom = 80.dp)) {
            TitleBar("סניפי ספק", LocalTitleColor.current, onHomeClick = { navController.navigate(com.rentacar.app.ui.navigation.Routes.Suppliers) })
            Spacer(Modifier.height(12.dp))
            val itemsUi = branches.map { b ->
                val sub = listOfNotNull(b.street, b.phone).joinToString(" · ")
                ListItemModel(id = b.id, title = b.city ?: "", subtitle = sub, meta = "", icon = Icons.Filled.LocationOn)
            }
            LazyColumn(modifier = Modifier.fillMaxWidth()) {
                items(itemsUi, key = { item -> item.id ?: (item.title + (item.subtitle ?: "")).hashCode().toLong() }) { item ->
                    val b = branches.firstOrNull { it.id == item.id }
                    val isSelected = b?.id == selectedBranchId
                    val context = LocalContext.current
                    
                    BranchCard(
                        branch = b!!,
                        isSelected = isSelected,
                        onClick = { selectedBranchId = b.id },
                        onCallClick = if (!b.phone.isNullOrBlank()) {
                            {
                                val intent = Intent(Intent.ACTION_DIAL).apply {
                                    data = Uri.parse("tel:${b.phone}")
                                }
                                context.startActivity(intent)
                            }
                        } else null
                    )
                }
            }
        }

        Row(
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)
        ) {
            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp).alpha(if (selectedBranchId != null) 1f else 0.3f),
                onClick = { if (selectedBranchId != null) navController.navigate("branch_edit/$supplierId/$selectedBranchId") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("✏️", modifier = Modifier.graphicsLayer(scaleX = -1f, scaleY = 1f))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "עריכה", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }

            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp),
                onClick = { navController.navigate("branch_edit/$supplierId") }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "חדש", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }

            val selectedBranch = branches.firstOrNull { it.id == selectedBranchId }
            val hasReservations = selectedBranch?.id?.let { branchId ->
                reservationVm.reservationsByBranch(branchId).collectAsState(initial = emptyList()).value.isNotEmpty()
            } ?: false
            val deleteEnabled = selectedBranchId != null && !hasReservations

            FloatingActionButton(
                modifier = Modifier.weight(1f).height(64.dp).alpha(if (deleteEnabled) 1f else 0.3f),
                onClick = { if (deleteEnabled) showConfirmDelete = true }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Icon(imageVector = Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.height(2.dp))
                    Text(text = "מחק", fontSize = responsiveFontSize(8f), maxLines = 1, textAlign = TextAlign.Center)
                }
            }
        }
    }

    if (showConfirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showConfirmDelete = false },
            title = { Text("מחיקת סניף") },
            text = {
                val selectedBranch2 = branches.firstOrNull { it.id == selectedBranchId }
                val hasReservations2 = selectedBranch2?.id?.let { branchId ->
                    reservationVm.reservationsByBranch(branchId).collectAsState(initial = emptyList()).value.isNotEmpty()
                } ?: false
                if (hasReservations2) Text("לא ניתן למחוק סניף שבוצעה לו הזמנה בעבר!")
                else Text("האם אתה בטוח שברצונך למחוק את הסניף?")
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        selectedBranchId?.let { id ->
                            vm.deleteBranch(id)
                            selectedBranchId = null
                        }
                        showConfirmDelete = false
                    }
                ) { Text("מחק") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(
                    onClick = { showConfirmDelete = false }
                ) { Text("בטל") }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BranchEditScreen(
    navController: NavHostController,
    vm: SuppliersViewModel,
    supplierId: Long,
    branchId: Long? = null
) {
    val branches = vm.branches(supplierId).collectAsState(initial = emptyList()).value
    val existing = branchId?.let { id -> branches.firstOrNull { it.id == id } }

    var branchCity by rememberSaveable { mutableStateOf(existing?.city ?: "") }
    var branchStreet by rememberSaveable { mutableStateOf(existing?.street ?: "") }
    var branchPhone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var attemptedSave by rememberSaveable { mutableStateOf(false) }

    val isEdit = existing != null
    val salmon = Color(0xFFFA8072)

    LaunchedEffect(existing?.id) {
        if (existing != null) {
            branchCity = existing.city ?: ""
            branchStreet = existing.street ?: ""
            branchPhone = existing.phone ?: ""
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = if (isEdit) "עריכת סניף" else "סניף חדש",
            color = LocalTitleColor.current,
            onHomeClick = { navController.popBackStack() }
        )
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = branchCity,
            onValueChange = { branchCity = it },
            label = { Text("עיר *") },
            singleLine = true,
            isError = attemptedSave && branchCity.isBlank(),
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (branchCity.isBlank()) salmon else Color.Unspecified
            ),
            supportingText = { if (attemptedSave && branchCity.isBlank()) Text("שדה חובה") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = branchStreet,
            onValueChange = { branchStreet = it },
            label = { Text("רחוב *") },
            singleLine = true,
            isError = attemptedSave && branchStreet.isBlank(),
            colors = androidx.compose.material3.TextFieldDefaults.outlinedTextFieldColors(
                containerColor = if (branchStreet.isBlank()) salmon else Color.Unspecified
            ),
            supportingText = { if (attemptedSave && branchStreet.isBlank()) Text("שדה חובה") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = branchPhone,
            onValueChange = { branchPhone = it },
            label = { Text("טלפון") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            FloatingActionButton(onClick = { navController.popBackStack() }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("✖")
                    Spacer(Modifier.height(2.dp))
                    Text("בטל", fontSize = 10.sp)
                }
            }

            FloatingActionButton(
                onClick = {
                    if (branchCity.isBlank() || branchStreet.isBlank()) {
                        attemptedSave = true
                        return@FloatingActionButton
                    }
                    
                    if (isEdit && existing != null) {
                        // עדכון סניף קיים
                        val updatedBranch = existing.copy(
                            name = branchCity,
                            city = branchCity,
                            street = branchStreet,
                            phone = branchPhone.ifBlank { null }
                        )
                        vm.updateBranch(updatedBranch) {
                            navController.popBackStack()
                        }
                    } else {
                        // יצירת סניף חדש
                        vm.addBranch(
                            supplierId = supplierId,
                            name = branchCity,
                            city = branchCity,
                            street = branchStreet,
                            phone = branchPhone.ifBlank { null }
                        ) {
                            navController.popBackStack()
                        }
                    }
                }
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 6.dp, horizontal = 8.dp)) {
                    Text("💾")
                    Spacer(Modifier.height(2.dp))
                    Text("שמור", fontSize = 10.sp)
                }
            }
        }
    }
}
