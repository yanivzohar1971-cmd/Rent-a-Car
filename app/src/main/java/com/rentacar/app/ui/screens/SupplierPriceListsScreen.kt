package com.rentacar.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.dialogs.PriceListImportDialog
import com.rentacar.app.ui.vm.SupplierPriceListsViewModel
import kotlinx.coroutines.launch

@Composable
fun SupplierPriceListsScreen(
    navController: NavHostController,
    supplierId: Long,
    viewModel: SupplierPriceListsViewModel,
    onPriceListClick: (Long) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var showImportDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            TitleBar(
                title = "מחירונים – ${uiState.supplierName}",
                color = LocalTitleColor.current,
                onHomeClick = { navController.popBackStack() }
            )
            
            Spacer(Modifier.height(12.dp))
            
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (uiState.headers.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "אין מחירונים לספק זה עדיין",
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Text(
                            text = "לחץ על כפתור הייבוא כדי לייבא מחירון חדש",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(uiState.headers, key = { it.id }) { header ->
                        SupplierPriceListHeaderCard(
                            header = header,
                            onClick = {
                                android.util.Log.d("SupplierPriceLists", "Card clicked, headerId=${header.id}")
                                onPriceListClick(header.id)
                            }
                        )
                    }
                }
            }
        }
        
        // Floating Action Button for import
        FloatingActionButton(
            onClick = { showImportDialog = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(16.dp)
        ) {
            Icon(
                imageVector = Icons.Default.UploadFile,
                contentDescription = "ייבוא מחירון חדש"
            )
        }
        
        // Snackbar host
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }
    
    // Price list import dialog
    if (showImportDialog) {
        PriceListImportDialog(
            visible = true,
            supplierId = supplierId,
            supplierName = uiState.supplierName,
            onDismiss = { showImportDialog = false },
            onImported = { result ->
                val message = if (result.success) {
                    "יבוא מחירון הסתיים בהצלחה: ${result.totalRowsInFile} שורות"
                } else {
                    "יבוא מחירון נכשל: ${result.errors.joinToString("; ")}"
                }
                scope.launch {
                    snackbarHostState.showSnackbar(message)
                }
                showImportDialog = false
            }
        )
    }
}

@Composable
private fun SupplierPriceListHeaderCard(
    header: com.rentacar.app.ui.vm.SupplierPriceListHeaderUiModel,
    onClick: () -> Unit
) {
    val monthNames = listOf(
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
    )
    val monthName = if (header.month in 1..12) monthNames[header.month - 1] else "${header.month}"
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "$monthName ${header.year}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                if (header.isActive) {
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = "פעיל",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(4.dp))
            
            if (header.itemCount > 0) {
                Text(
                    text = "${header.itemCount} פריטים",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(4.dp))
            }
            
            Text(
                text = "יובא: ${header.importedAtFormatted}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            header.sourceFileName?.let { fileName ->
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "קובץ: $fileName",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

