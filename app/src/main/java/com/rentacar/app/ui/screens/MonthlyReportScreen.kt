package com.rentacar.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
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
import com.rentacar.app.ui.vm.ReservationViewModel
import kotlinx.coroutines.flow.first
import java.text.DecimalFormat
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun MonthlyReportScreen(
    supplierId: Long,
    year: Int,
    month: Int,
    onBack: () -> Unit,
    reservationVm: ReservationViewModel? = null
) {
    val context = LocalContext.current
    val db = remember { DatabaseModule.provideDatabase(context) }
    val repository = remember {
        MonthlyReportRepository(
            db.supplierMonthlyDealDao(),
            db.supplierDao()
        )
    }
    val viewModel = remember(supplierId, year, month) {
        MonthlyReportViewModel(repository, initialYear = year, initialMonth = month)
    }
    val uiState by viewModel.uiState.collectAsState()
    val selectedPayoutMonth by viewModel.selectedPayoutMonth.collectAsState(initial = YearMonth.now())
    val currentMonth = YearMonth.now(ZoneId.of("Asia/Jerusalem"))
    val nextEnabled = selectedPayoutMonth < currentMonth
    val earliestDataMonth = uiState.earliestDataMonth
    val prevEnabled = earliestDataMonth == null || selectedPayoutMonth > earliestDataMonth

    LaunchedEffect(supplierId, selectedPayoutMonth) {
        if (selectedPayoutMonth > currentMonth) {
            viewModel.setFutureMonthEmptyState()
            return@LaunchedEffect
        }
        if (reservationVm != null) {
            val reservations = reservationVm.reservationsBySupplier(supplierId).first()
            val agents = reservationVm.agents.value
            viewModel.loadReportWithReservations(supplierId, reservations, agents)
        } else {
            viewModel.loadReport(supplierId)
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TitleBar(
            title = "דוח חודשי",
            color = LocalTitleColor.current,
            onHomeClick = onBack
        )
        
        Spacer(modifier = Modifier.height(6.dp))
        
        // Month/Year selector: left arrow points left (prev), right arrow points right (next); no AutoMirror
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = { viewModel.nextMonth() },
                enabled = nextEnabled
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronRight,
                    contentDescription = "חודש הבא"
                )
            }
            Text(
                text = selectedPayoutMonth.format(DateTimeFormatter.ofPattern("MM/yyyy")),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )
            IconButton(
                onClick = { viewModel.prevMonth() },
                enabled = prevEnabled
            ) {
                Icon(
                    imageVector = Icons.Filled.ChevronLeft,
                    contentDescription = "חודש קודם"
                )
            }
        }
        
        Spacer(modifier = Modifier.height(6.dp))
        
        // Subtitle: Supplier (period shown in selector)
        if (uiState.supplierName.isNotEmpty()) {
            Text(
                text = "ספק: ${uiState.supplierName}",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
        if (uiState.isLoading) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth().height(2.dp),
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
        val sectionTitle = when {
            !uiState.hasDataForSelectedMonth -> "אין נתונים לחודש זה"
            uiState.infoMessage == "אין נתונים לחודשים עתידיים" -> "אין נתונים לחודשים עתידיים"
            uiState.infoMessage == "אין נתונים לחודשים אחורה" -> "אין נתונים לחודשים אחורה"
            else -> "סיכום כללי"
        }
        val listState = rememberLazyListState()
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            item {
                Text(
                    sectionTitle,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }
            item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
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
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
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
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            KpiCardEmoji(
                                title = "סכום ברוטו",
                                value = "₪${formatAmount(uiState.totalGrossAmount)}",
                                emoji = "💰",
                                modifier = Modifier.weight(1f),
                                valueColor = Color(0xFF4CAF50)
                            )
                            KpiCardEmoji(
                                title = "סכום עמלה",
                                value = "₪${formatAmount(uiState.totalCommissionAmount)}",
                                emoji = "💸",
                                modifier = Modifier.weight(1f),
                                valueColor = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                    if (uiState.agents.isNotEmpty()) {
                        item {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                "פילוח לפי נציג",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        items(uiState.agents, key = { it.agentName }) { agent ->
                            AgentCard(agent)
                        }
                    }
        }
        val footerMsg = uiState.errorMessage
            ?: uiState.infoMessage
            ?: (if (!uiState.hasDataForSelectedMonth) "אין נתונים לחודש זה" else null)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = footerMsg ?: "",
                style = MaterialTheme.typography.bodyMedium,
                color = if (uiState.errorMessage != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .alpha(if (footerMsg != null) 1f else 0f)
            )
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
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = emoji,
                fontSize = 26.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
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

