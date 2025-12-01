package com.rentacar.app.ui.yard

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.rentacar.app.data.yard.YardImportPreviewRow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardImportScreen(
    navController: NavController,
    viewModel: YardImportViewModel
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
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
        ) {
            Text(
                "בחר קובץ Excel בפורמט המצבת של המגרש, קובץ אחד לכל יבוא.",
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    filePicker.launch("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                }
            ) {
                Text(selectedFileName ?: "בחר קובץ")
            }

            Spacer(Modifier.height(16.dp))

            when (state.status) {
                ImportStatus.UPLOADING,
                ImportStatus.WAITING_FOR_PREVIEW -> {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(8.dp))
                    Text("מעבד את הקובץ...")
                }

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
                        enabled = !state.isCommitting
                    ) {
                        if (state.isCommitting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Text("אשר יבוא")
                        }
                    }
                }

                ImportStatus.COMMITTED -> {
                    Text(
                        "היבוא הושלם. ניתן לחזור לצי המגרש.",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { navController.popBackStack() }) {
                        Text("חזרה לצי המגרש")
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
    }
}

@Composable
private fun PreviewList(rows: List<YardImportPreviewRow>) {
    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .weight(1f, fill = false)
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

