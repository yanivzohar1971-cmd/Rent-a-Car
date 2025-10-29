package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.ImportLogViewModel
import com.rentacar.app.ui.vm.RunUi
import com.rentacar.app.ui.vm.EntryUi
import com.rentacar.app.ui.vm.ImportAction

@Composable
fun ImportLogScreen(
    supplierId: Long,
    navController: NavController
) {
    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val viewModel = remember { ImportLogViewModel(db.importLogDao()) }
    
    val uiState by viewModel.uiState.collectAsState()
    
    LaunchedEffect(supplierId) {
        viewModel.loadRunsForSupplier(supplierId)
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "לוג יבואים",
            color = LocalTitleColor.current,
            onHomeClick = { navController.popBackStack() },
            startIcon = Icons.AutoMirrored.Filled.ArrowBack,
            onStartClick = { navController.popBackStack() }
        )
        Spacer(Modifier.height(8.dp))
        
        if (uiState.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.errorMessage != null) {
            Text(
                text = uiState.errorMessage!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        } else if (uiState.runs.isEmpty()) {
            Text(
                text = "אין יבואים עדיין לספק הזה",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(16.dp)
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(uiState.runs) { run ->
                    ImportRunCard(
                        run = run,
                        isExpanded = (uiState.selectedRun?.runId == run.runId),
                        entries = if (uiState.selectedRun?.runId == run.runId) uiState.entries else emptyList(),
                        onExpand = { viewModel.selectRun(run.runId) },
                        onCollapse = { viewModel.clearSelection() }
                    )
                }
            }
        }
    }
}

@Composable
fun ImportRunCard(
    run: RunUi,
    isExpanded: Boolean,
    entries: List<EntryUi>,
    onExpand: () -> Unit,
    onCollapse: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = run.timestamp,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = run.fileName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Icon(
                    imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            Spacer(Modifier.height(8.dp))
            Text(
                text = run.summary,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(Modifier.height(12.dp))
            
            // Expand/Collapse button
            Button(
                onClick = { if (isExpanded) onCollapse() else onExpand() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isExpanded) "סגור פרטים" else "הצג פרטים")
            }
            
            // Entries (if expanded)
            if (isExpanded && entries.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                
                // Summary stats for this run
                ImportSummaryStats(entries)
                
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                
                // Individual entry cards
                entries.forEach { entry ->
                    ImportEntryCard(entry)
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
fun ImportSummaryStats(entries: List<EntryUi>) {
    val created = entries.count { it.action == ImportAction.CREATED }
    val updated = entries.count { it.action == ImportAction.UPDATED }
    val skipped = entries.count { it.action == ImportAction.SKIPPED_NO_CHANGE }
    val errors = entries.count { it.action == ImportAction.ERROR }
    
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                "סיכום פירוט",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Row(
                horizontalArrangement = Arrangement.SpaceEvenly,
                modifier = Modifier.fillMaxWidth()
            ) {
                StatItem("חדש", created, Color(0xFF4CAF50))
                StatItem("עודכן", updated, Color(0xFFFFC107))
                StatItem("דולג", skipped, Color(0xFF9E9E9E))
                StatItem("שגיאות", errors, Color(0xFFF44336))
            }
        }
    }
}

@Composable
fun StatItem(label: String, count: Int, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = count.toString(),
            color = color,
            fontWeight = FontWeight.Bold,
            fontSize = 18.sp
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun ImportEntryCard(entry: EntryUi) {
    val (bgColor, icon, chipColor, chipText) = when (entry.action) {
        ImportAction.CREATED -> CardStyle(
            Color(0x1A4CAF50),
            Icons.Default.Add,
            Color(0xFF4CAF50),
            "חדש"
        )
        ImportAction.UPDATED -> CardStyle(
            Color(0x1AFFC107),
            Icons.Default.Edit,
            Color(0xFFFFC107),
            "עודכן"
        )
        ImportAction.SKIPPED_NO_CHANGE -> CardStyle(
            Color(0x1A9E9E9E),
            Icons.Default.Refresh,
            Color(0xFF9E9E9E),
            "ללא שינוי"
        )
        ImportAction.ERROR -> CardStyle(
            Color(0x1AF44336),
            Icons.Default.Error,
            Color(0xFFF44336),
            "שגיאה"
        )
    }
    
    Card(
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(12.dp)
        ) {
            // Icon circle
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(bgColor, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = chipText,
                    tint = chipColor,
                    modifier = Modifier.size(22.dp)
                )
            }
            
            Spacer(Modifier.width(12.dp))
            
            // Content
            Column(Modifier.weight(1f)) {
                Text(
                    text = "חוזה ${entry.contractNumber}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = entry.actionLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (entry.notes != null && entry.notes != entry.actionLabel) {
                    Text(
                        text = entry.notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    if (entry.amountFormatted != null) {
                        Text(
                            text = entry.amountFormatted,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    Text(
                        text = "שורה ${entry.rowNumber}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.Gray
                    )
                }
            }
            
            Spacer(Modifier.width(8.dp))
            
            // Status chip
            Box(
                modifier = Modifier
                    .background(chipColor, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(
                    text = chipText,
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

data class CardStyle(
    val bgColor: Color,
    val icon: ImageVector,
    val chipColor: Color,
    val chipText: String
)

