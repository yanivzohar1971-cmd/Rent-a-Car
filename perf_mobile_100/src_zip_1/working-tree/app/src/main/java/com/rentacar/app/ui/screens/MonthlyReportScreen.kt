package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rentacar.app.LocalTitleColor
import com.rentacar.app.di.DatabaseModule
import com.rentacar.app.reports.MonthlyReportRepository
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.AgentUiRow
import com.rentacar.app.ui.vm.MonthlyReportViewModel
import java.text.DecimalFormat

@Composable
fun MonthlyReportScreen(
    supplierId: Long,
    year: Int,
    month: Int,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val repository = remember {
        MonthlyReportRepository(
            db.supplierMonthlyDealDao(),
            db.supplierDao()
        )
    }
    val viewModel = remember { MonthlyReportViewModel(repository) }
    
    val uiState by viewModel.uiState.collectAsState()
    
    LaunchedEffect(supplierId, year, month) {
        viewModel.loadReport(supplierId, year, month)
    }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "דוח חודשי",
            color = LocalTitleColor.current,
            onHomeClick = onBack
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Subtitle: Supplier and Period
        if (uiState.supplierName.isNotEmpty()) {
            Text(
                text = "ספק: ${uiState.supplierName} | ${uiState.month}/${uiState.year}",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        when {
            uiState.isLoading -> {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(16.dp))
                Text("טוען דוח...", style = MaterialTheme.typography.bodyMedium)
            }
            
            uiState.errorMessage != null -> {
                Text(
                    text = uiState.errorMessage!!,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // KPIs Section
                    item {
                        Text(
                            "סיכום כללי",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            KpiCardEmoji(
                                title = "סה\"כ עסקאות",
                                value = uiState.totalDeals.toString(),
                                emoji = "📊",
                                modifier = Modifier.weight(1f)
                            )
                            KpiCardEmoji(
                                title = "פעיל / מאושר",
                                value = uiState.totalConfirmed.toString(),
                                emoji = "✅",
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            KpiCardEmoji(
                                title = "שולם",
                                value = uiState.totalPaid.toString(),
                                emoji = "💵",
                                modifier = Modifier.weight(1f),
                                valueColor = Color(0xFF4CAF50)
                            )
                            KpiCardEmoji(
                                title = "בוטל",
                                value = uiState.totalCancelled.toString(),
                                emoji = "❌",
                                modifier = Modifier.weight(1f),
                                valueColor = Color(0xFFF44336)
                            )
                        }
                    }
                    
                    item {
                        KpiCardEmoji(
                            title = "סכום ברוטו",
                            value = "₪${formatAmount(uiState.totalGrossAmount)}",
                            emoji = "💰",
                            modifier = Modifier.fillMaxWidth(),
                            valueColor = Color(0xFF4CAF50)
                        )
                    }
                    
                    item {
                        KpiCardEmoji(
                            title = "סכום עמלה",
                            value = "₪${formatAmount(uiState.totalCommissionAmount)}",
                            emoji = "💸",
                            modifier = Modifier.fillMaxWidth(),
                            valueColor = MaterialTheme.colorScheme.primary
                        )
                    }
                    
                    // Agent Breakdown Section
                    if (uiState.agents.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                "פילוח לפי נציג",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        
                        items(uiState.agents) { agent ->
                            AgentCard(agent)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun KpiCardEmoji(
    title: String,
    value: String,
    emoji: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Emoji icon
            Text(
                text = emoji,
                fontSize = 36.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = valueColor,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun AgentCard(agent: AgentUiRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier.padding(18.dp)
        ) {
            // Agent name with emoji
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "👤",
                    fontSize = 24.sp
                )
                Text(
                    text = agent.agentName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Stats row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Left column - Amounts
                Column(modifier = Modifier.weight(1f)) {
                    StatRowEmoji(
                        emoji = "📋",
                        label = "עסקאות",
                        value = agent.dealsCount.toString(),
                        valueColor = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    StatRowEmoji(
                        emoji = "💰",
                        label = "ברוטו",
                        value = "₪${formatAmount(agent.grossAmount)}",
                        valueColor = Color(0xFF4CAF50)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    StatRowEmoji(
                        emoji = "💸",
                        label = "עמלה",
                        value = "₪${formatAmount(agent.commissionAmount)}",
                        valueColor = MaterialTheme.colorScheme.primary
                    )
                }
                
                // Right column - Status breakdown
                Column(horizontalAlignment = Alignment.End) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "💵",
                            fontSize = 18.sp
                        )
                        Text(
                            text = "${agent.paidCount}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF4CAF50),
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "❌",
                            fontSize = 18.sp
                        )
                        Text(
                            text = "${agent.cancelledCount}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFFF44336),
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "⏳",
                            fontSize = 18.sp
                        )
                        Text(
                            text = "${agent.confirmedCount}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF2196F3),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatRowEmoji(emoji: String, label: String, value: String, valueColor: Color) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = emoji,
            fontSize = 16.sp
        )
        Text(
            text = "$label:",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = valueColor
        )
    }
}

private fun formatAmount(amount: Double): String {
    val formatter = DecimalFormat("#,##0.00")
    return formatter.format(amount)
}

