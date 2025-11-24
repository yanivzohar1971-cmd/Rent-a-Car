package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.rentacar.app.data.sync.SyncCategoryStatus
import com.rentacar.app.ui.settings.SyncCheckUiState

@Composable
fun DataSyncCheckDialog(
    uiState: SyncCheckUiState,
    onDismiss: () -> Unit,
    onRetry: () -> Unit
) {
    if (!uiState.isDialogOpen) return
    
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.large,
            tonalElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .fillMaxHeight(0.8f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Title
                Text(
                    text = "בדיקת סנכרון נתונים",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                
                // Subtitle with totals
                uiState.summary?.let { summary ->
                    Text(
                        text = "DEBUG: Local=${summary.localTotal}, Cloud=${summary.cloudTotal}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                }
                
                // Error message
                uiState.errorMessage?.let { error ->
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                
                // Content
                if (uiState.isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CircularProgressIndicator()
                            Text("Checking data sync...")
                        }
                    }
                } else if (uiState.errorMessage != null && uiState.summary == null) {
                    // Error state - show error message and retry button
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Text(
                                text = uiState.errorMessage,
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                } else {
                    uiState.summary?.let { summary ->
                        // Table header
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                "שם",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(2f)
                            )
                            Text(
                                "מקומי",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            Text(
                                "ענן",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                            Text(
                                "סטטוס",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                        
                        HorizontalDivider()
                        
                        // Table rows
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .verticalScroll(rememberScrollState())
                        ) {
                            summary.categories.forEach { category ->
                                SyncCategoryRow(category = category)
                            }
                        }
                        
                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        
                        // Summary pills
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            if (!summary.hasDifferences && !summary.hasErrors) {
                                StatusPill(
                                    text = "תקין",
                                    color = Color(0xFF4CAF50) // Green
                                )
                            }
                            if (summary.hasDifferences) {
                                StatusPill(
                                    text = "יש הבדלים",
                                    color = Color(0xFFFFC107) // Yellow
                                )
                            }
                            if (summary.hasErrors) {
                                StatusPill(
                                    text = "שגוי/חסר",
                                    color = Color(0xFFF44336) // Red
                                )
                            }
                        }
                    }
                }
                
                Spacer(Modifier.height(8.dp))
                
                // Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (uiState.errorMessage != null || uiState.summary != null) {
                        TextButton(
                            onClick = onRetry,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("נסה שוב")
                        }
                    }
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("סגור")
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncCategoryRow(category: com.rentacar.app.data.sync.SyncCategorySummary) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = category.displayName,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(2f)
        )
        Text(
            text = category.localCount?.toString() ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Text(
            text = category.cloudCount?.toString() ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.Center
        ) {
            StatusIcon(status = category.status)
        }
    }
}

@Composable
private fun StatusIcon(status: SyncCategoryStatus) {
    when (status) {
        SyncCategoryStatus.OK -> {
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "תקין",
                tint = Color(0xFF4CAF50) // Green
            )
        }
        SyncCategoryStatus.WARNING -> {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "אזהרה",
                tint = Color(0xFFFFC107) // Yellow
            )
        }
        SyncCategoryStatus.ERROR -> {
            Icon(
                imageVector = Icons.Default.Error,
                contentDescription = "שגיאה",
                tint = Color(0xFFF44336) // Red
            )
        }
    }
}

@Composable
private fun StatusPill(text: String, color: Color) {
    Surface(
        color = color.copy(alpha = 0.2f),
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = color,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        )
    }
}

