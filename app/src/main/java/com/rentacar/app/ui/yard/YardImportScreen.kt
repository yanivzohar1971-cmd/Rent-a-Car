package com.rentacar.app.ui.yard

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.rentacar.app.ui.components.GlobalProgressDialog
import com.rentacar.app.data.yard.YardImportPreviewRow
import com.rentacar.app.data.yard.YardImportStats
import com.rentacar.app.ui.navigation.Routes
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardImportScreen(
    navController: NavController,
    viewModel: YardImportViewModel,
    onNavigateToFleet: () -> Unit = { navController.navigate(Routes.YardFleet) },
    onNewImport: () -> Unit = {}
) {
    val state by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val storage = FirebaseStorage.getInstance()

    var selectedFileName by remember { mutableStateOf<String?>(null) }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            // Get file name from URI
            val fileName = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    cursor.getString(nameIndex)
                } else null
            } ?: uri.lastPathSegment ?: "import.xlsx"

            selectedFileName = fileName

            viewModel.startImport(fileName) { jobId, uploadPath ->
                // Upload file to Firebase Storage
                scope.launch {
                    try {
                        val storageRef: StorageReference = storage.reference.child(uploadPath)
                        storageRef.putFile(uri).await()
                        // After upload completes, start waiting for preview
                        viewModel.beginWaitingForPreview(jobId)
                    } catch (e: Exception) {
                        android.util.Log.e("YardImportScreen", "Error uploading file", e)
                        // Error will be shown via UI state
                    }
                }
            }
        }
    }

    // Determine if an operation is in progress
    val isBusy = when (state.status) {
        ImportStatus.UPLOADING,
        ImportStatus.WAITING_FOR_PREVIEW,
        ImportStatus.COMMITTING -> true
        else -> false
    }

    // Get progress message based on status
    val progressMessage = when (state.status) {
        ImportStatus.UPLOADING -> "מעלה את קובץ האקסל…"
        ImportStatus.WAITING_FOR_PREVIEW -> "מעבד את הקובץ ומכין תצוגה מקדימה…"
        ImportStatus.COMMITTING -> "מעדכן את צי הרכבים במגרש…"
        else -> "מעבד…"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ייבוא צי ממסמך אקסל") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .padding(padding)
                    .padding(16.dp)
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    "בחר קובץ Excel בפורמט המצבת של המגרש, קובץ אחד לכל יבוא.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        filePicker.launch("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    },
                    enabled = !isBusy
                ) {
                    Text(selectedFileName ?: "בחר קובץ")
                }

                Spacer(Modifier.height(16.dp))

                when (state.status) {
                    ImportStatus.PREVIEW_READY -> {
                        state.summary?.let { summary ->
                            Text("סיכום:", style = MaterialTheme.typography.titleMedium)
                            Text("שורות: ${summary.rowsTotal}")
                            Text("עם שגיאות: ${summary.rowsWithErrors}")
                            Text("עם אזהרות: ${summary.rowsWithWarnings}")
                            Spacer(Modifier.height(8.dp))
                        }
                        PreviewList(state.previewRows)
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.commitImport() },
                            enabled = !isBusy
                        ) {
                            Text("אשר יבוא")
                        }
                    }

                    ImportStatus.COMMITTED -> {
                        // Show statistics UI if available
                        state.lastStats?.let { stats ->
                            ImportStatisticsSection(stats = stats)
                            Spacer(Modifier.height(24.dp))
                            
                            // Action buttons after successful import
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Button(
                                    onClick = onNavigateToFleet,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("לצפייה בצי המגרש")
                                }
                                
                                OutlinedButton(
                                    onClick = {
                                        viewModel.resetForNewImport()
                                        selectedFileName = null
                                        onNewImport()
                                    },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("ייבוא נוסף")
                                }
                            }
                        }
                    }

                    ImportStatus.FAILED -> {
                        Text(
                            "אירעה שגיאה: ${state.errorMessage ?: "לא ידוע"}",
                            color = MaterialTheme.colorScheme.error
                        )
                    }

                    else -> {}
                }

                // Show error message if any
                state.errorMessage?.let { errorMsg ->
                    if (state.status != ImportStatus.FAILED) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            errorMsg,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            // Show global progress dialog when busy
            GlobalProgressDialog(
                visible = isBusy,
                message = progressMessage
            )
        }
    }
}

@Composable
private fun PreviewList(rows: List<YardImportPreviewRow>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
    ) {
        items(rows) { row ->
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                val n = row.normalized
                Text(
                    "רכב ${row.rowIndex}: ${n.license ?: "-"}  ${n.manufacturer ?: ""} ${n.model ?: ""} ${n.year ?: ""}"
                )
                if (row.issues.isNotEmpty()) {
                    val hasError = row.issues.any { it.level == "ERROR" }
                    val label = if (hasError) "שגיאות" else "אזהרות"
                    Text(
                        "$label: ${row.issues.joinToString { it.code }}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            Divider()
        }
    }
}

@Composable
private fun ImportStatisticsSection(stats: YardImportStats) {
    // Success header
    Text(
        text = "הייבוא הושלם בהצלחה",
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold
    )
    
    Spacer(Modifier.height(16.dp))
    
    // Main stats card
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "סיכום מהיר",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(Modifier.height(4.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                StatChip(label = "סה\"כ רכבים", value = stats.validRows)
                StatChip(label = "חדשים", value = stats.carsCreated)
                StatChip(label = "עודכנו", value = stats.carsUpdated)
            }
            
            // Top models section
            if (stats.topModels.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Divider()
                Spacer(Modifier.height(8.dp))
                Text(
                    "הדגמים המובילים בייבוא",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                
                Spacer(Modifier.height(8.dp))
                
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    stats.topModels.forEach { (model, count) ->
                        AssistChip(
                            onClick = { /* no-op */ },
                            label = {
                                Text("$model · $count")
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatChip(label: String, value: Int) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Text(
            text = value.toString(),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

