package com.rentacar.app.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.data.admin.YardStatus
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminYardDetailsScreen(
    navController: NavHostController,
    viewModel: AdminYardDetailsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Show error/success messages
    uiState.errorMessage?.let { errorMsg ->
        LaunchedEffect(errorMsg) {
            snackbarHostState.showSnackbar(
                message = errorMsg,
                withDismissAction = true
            )
            viewModel.clearError()
        }
    }
    
    LaunchedEffect(uiState.saveSuccess) {
        if (uiState.saveSuccess) {
            snackbarHostState.showSnackbar(
                message = "נשמר בהצלחה",
                withDismissAction = true
            )
            viewModel.clearError()
        }
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        uiState.details?.yard?.displayName?.let { "מגרש: $it" } ?: "פרטי מגרש"
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        }
    ) { paddingValues ->
        if (uiState.isLoading && uiState.details == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            val details = uiState.details
            if (details != null) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    // Profile Card (read-only)
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "פרטי מגרש (לפי פרופיל)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            
                            details.profile?.let { profile ->
                                if (profile.legalName != null) {
                                    Text("שם חוקי: ${profile.legalName}")
                                    Spacer(Modifier.height(8.dp))
                                }
                                if (profile.companyId != null) {
                                    Text("ח.פ.: ${profile.companyId}")
                                    Spacer(Modifier.height(8.dp))
                                }
                                if (profile.addressCity != null || profile.addressStreet != null) {
                                    Text("כתובת: ${profile.addressCity ?: ""} ${profile.addressStreet ?: ""}")
                                    Spacer(Modifier.height(8.dp))
                                }
                                if (profile.usageValidUntil != null) {
                                    val dateStr = try {
                                        val date = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(profile.usageValidUntil)
                                        SimpleDateFormat("dd/MM/yyyy", Locale("he")).format(date)
                                    } catch (e: Exception) {
                                        profile.usageValidUntil
                                    }
                                    
                                    // Check if expired
                                    val isExpired = try {
                                        val date = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(profile.usageValidUntil)
                                        date != null && date.before(Date())
                                    } catch (e: Exception) {
                                        false
                                    }
                                    
                                    if (isExpired) {
                                        Surface(
                                            modifier = Modifier.fillMaxWidth(),
                                            color = MaterialTheme.colorScheme.errorContainer,
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text(
                                                text = "תוקף שימוש פג: $dateStr",
                                                modifier = Modifier.padding(12.dp),
                                                color = MaterialTheme.colorScheme.onErrorContainer
                                            )
                                        }
                                    } else {
                                        Text("תוקף שימוש: $dateStr")
                                    }
                                }
                            } ?: Text("אין פרטי פרופיל")
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Status Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "סטטוס מגרש",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            
                            // Current status
                            Text("סטטוס נוכחי: ${getStatusText(details.yard.status)}")
                            Spacer(Modifier.height(12.dp))
                            
                            // Status selection
                            Text("בחר סטטוס חדש:")
                            Spacer(Modifier.height(8.dp))
                            YardStatus.values().forEach { status ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    RadioButton(
                                        selected = uiState.selectedStatus == status,
                                        onClick = { viewModel.onStatusSelected(status) }
                                    )
                                    Text(
                                        getStatusText(status),
                                        modifier = Modifier.padding(start = 8.dp)
                                    )
                                }
                            }
                            
                            Spacer(Modifier.height(12.dp))
                            
                            // Reason field
                            OutlinedTextField(
                                value = uiState.statusReason,
                                onValueChange = { viewModel.onStatusReasonChanged(it) },
                                label = { Text("הערת סטטוס / סיבה") },
                                modifier = Modifier.fillMaxWidth(),
                                minLines = 2,
                                maxLines = 4
                            )
                            
                            Spacer(Modifier.height(12.dp))
                            
                            // Save button
                            Button(
                                onClick = { viewModel.saveStatus() },
                                enabled = !uiState.isSavingStatus,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (uiState.isSavingStatus) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = MaterialTheme.colorScheme.onPrimary
                                    )
                                } else {
                                    Text("עדכן סטטוס")
                                }
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Importer Card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "פונקציית ייבוא",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(12.dp))
                            
                            var expanded by remember { mutableStateOf(false) }
                            val importerOptions = listOf(
                                null to "ללא",
                                "metal_export_v1" to "metal_export_v1 – מצבת רכב (Excel)"
                            )
                            
                            ExposedDropdownMenuBox(
                                expanded = expanded,
                                onExpandedChange = { expanded = !expanded }
                            ) {
                                OutlinedTextField(
                                    value = importerOptions.find { it.first == uiState.selectedImporterId }?.second ?: "ללא",
                                    onValueChange = { },
                                    readOnly = true,
                                    label = { Text("בחר פונקציית ייבוא") },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .menuAnchor(),
                                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
                                )
                                ExposedDropdownMenu(
                                    expanded = expanded,
                                    onDismissRequest = { expanded = false }
                                ) {
                                    importerOptions.forEach { (id, label) ->
                                        DropdownMenuItem(
                                            text = { Text(label) },
                                            onClick = {
                                                viewModel.onImporterSelected(id, 1)
                                                expanded = false
                                            }
                                        )
                                    }
                                }
                            }
                            
                            Spacer(Modifier.height(12.dp))
                            
                            // Version field
                            OutlinedTextField(
                                value = uiState.importerVersion.toString(),
                                onValueChange = {
                                    it.toIntOrNull()?.let { version ->
                                        viewModel.onImporterSelected(uiState.selectedImporterId, version)
                                    }
                                },
                                label = { Text("גרסה") },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = uiState.selectedImporterId != null
                            )
                            
                            Spacer(Modifier.height(12.dp))
                            
                            // Save button
                            Button(
                                onClick = { viewModel.saveImporter() },
                                enabled = !uiState.isSavingImporter && uiState.selectedImporterId != null,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                if (uiState.isSavingImporter) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = MaterialTheme.colorScheme.onPrimary
                                    )
                                } else {
                                    Text("שמור פונקציית ייבוא")
                                }
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                }
            }
        }
    }
}

private fun getStatusText(status: YardStatus): String {
    return when (status) {
        YardStatus.PENDING -> "בהמתנה"
        YardStatus.APPROVED -> "מאושר"
        YardStatus.NEEDS_INFO -> "דורש מידע"
        YardStatus.REJECTED -> "נדחה"
    }
}

