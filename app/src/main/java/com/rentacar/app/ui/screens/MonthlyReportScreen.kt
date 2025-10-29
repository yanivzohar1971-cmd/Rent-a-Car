package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
                            KpiCard(
                                title = "סה\"כ עסקאות",
                                value = uiState.totalDeals.toString(),
                                modifier = Modifier.weight(1f)
                            )
                            KpiCard(
                                title = "פעיל / מאושר",
                                value = uiState.totalConfirmed.toString(),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            KpiCard(
                                title = "שולם",
                                value = uiState.totalPaid.toString(),
                                modifier = Modifier.weight(1f)
                            )
                            KpiCard(
                                title = "בוטל",
                                value = uiState.totalCancelled.toString(),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    
                    item {
                        KpiCard(
                            title = "סכום ברוטו",
                            value = "₪${formatAmount(uiState.totalGrossAmount)}",
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    
                    item {
                        KpiCard(
                            title = "סכום עמלה",
                            value = "₪${formatAmount(uiState.totalCommissionAmount)}",
                            modifier = Modifier.fillMaxWidth()
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
private fun KpiCard(
    title: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun AgentCard(agent: AgentUiRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = agent.agentName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "${agent.dealsCount} עסקאות",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "ברוטו: ₪${formatAmount(agent.grossAmount)}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "עמלה: ₪${formatAmount(agent.commissionAmount)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "שולם: ${agent.paidCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "מבוטל: ${agent.cancelledCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "פתוח: ${agent.confirmedCount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
        }
    }
}

private fun formatAmount(amount: Double): String {
    val formatter = DecimalFormat("#,##0.00")
    return formatter.format(amount)
}

