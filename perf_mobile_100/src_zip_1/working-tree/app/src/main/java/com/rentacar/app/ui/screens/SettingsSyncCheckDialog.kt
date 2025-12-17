package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
        Card(
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .fillMaxHeight(0.8f),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                // Header row with icon + title
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Start
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .size(24.dp)
                            .padding(end = 8.dp)
                    )
                    Text(
                        text = "בדיקת סנכרון נתונים",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                // DEBUG line with totals
                uiState.summary?.let { summary ->
                    Text(
                        text = "DEBUG: Local=${summary.localTotal}, Cloud=${summary.cloudTotal}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
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
                        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                        
                        // Table header row (RTL order: סטטוס, ענן, מקומי, שם)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                                    RoundedCornerShape(4.dp)
                                )
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            // סטטוס
                            Text(
                                "סטטוס",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(0.9f),
                                textAlign = TextAlign.Center
                            )
                            // ענן
                            Text(
                                "ענן",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1.1f),
                                textAlign = TextAlign.Center
                            )
                            // מקומי
                            Text(
                                "מקומי",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1.1f),
                                textAlign = TextAlign.Center
                            )
                            // שם
                            Text(
                                "שם",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(2f),
                                textAlign = TextAlign.End
                            )
                        }
                        
                        // Table body with LazyColumn
                        LazyColumn(
                            modifier = Modifier.weight(1f)
                        ) {
                            itemsIndexed(summary.categories) { index, category ->
                                SyncCategoryRow(
                                    category = category,
                                    isEven = index % 2 == 0
                                )
                            }
                        }
                        
                        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                        
                        // Bottom section: status chips + action buttons
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Left side: status chips
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (!summary.hasDifferences && !summary.hasErrors) {
                                    StatusChip(
                                        text = "✅ תקין",
                                        color = Color(0xFF4CAF50)
                                    )
                                }
                                if (summary.hasDifferences) {
                                    StatusChip(
                                        text = "⚠ יש הבדלים",
                                        color = Color(0xFFFFC107)
                                    )
                                }
                                if (summary.hasErrors) {
                                    StatusChip(
                                        text = "❌ שגוי/חסר",
                                        color = Color(0xFFF44336)
                                    )
                                }
                            }
                            
                            // Right side: action buttons
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                TextButton(onClick = onRetry) {
                                    Text("נסה שוב")
                                }
                                TextButton(onClick = onDismiss) {
                                    Text("סגור")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncCategoryRow(
    category: com.rentacar.app.data.sync.SyncCategorySummary,
    isEven: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (isEven) Color.Transparent
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            )
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // סטטוס (status icon with colored background)
        Box(
            modifier = Modifier.weight(0.9f),
            contentAlignment = Alignment.Center
        ) {
            StatusIconWithBackground(status = category.status)
        }
        
        // ענן (cloud count)
        Text(
            text = category.cloudCount?.toString() ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1.1f),
            textAlign = TextAlign.Center
        )
        
        // מקומי (local count)
        Text(
            text = category.localCount?.toString() ?: "—",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1.1f),
            textAlign = TextAlign.Center
        )
        
        // שם (name, right-aligned RTL)
        Text(
            text = category.displayName,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(2f),
            textAlign = TextAlign.End,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun StatusIconWithBackground(status: SyncCategoryStatus) {
    val (icon, tint, bgColor) = when (status) {
        SyncCategoryStatus.OK -> Triple(
            Icons.Default.Check,
            Color(0xFF4CAF50), // Green
            Color(0xFF4CAF50).copy(alpha = 0.2f) // Light green background
        )
        SyncCategoryStatus.WARNING -> Triple(
            Icons.Default.Warning,
            Color(0xFFFFC107), // Yellow
            Color(0xFFFFC107).copy(alpha = 0.2f) // Light yellow background
        )
        SyncCategoryStatus.ERROR -> Triple(
            Icons.Default.Error,
            Color(0xFFF44336), // Red
            Color(0xFFF44336).copy(alpha = 0.2f) // Light red background
        )
    }
    
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = when (status) {
                SyncCategoryStatus.OK -> "תקין"
                SyncCategoryStatus.WARNING -> "אזהרה"
                SyncCategoryStatus.ERROR -> "שגיאה"
            },
            tint = tint,
            modifier = Modifier.size(20.dp)
        )
    }
}

@Composable
private fun StatusChip(text: String, color: Color) {
    Surface(
        color = color.copy(alpha = 0.15f),
        shape = RoundedCornerShape(16.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
        )
    }
}

