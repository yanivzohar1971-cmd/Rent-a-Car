package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListItemUiModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PriceListDetailsScreen(
    headerId: Long,
    onBack: () -> Unit,
    viewModel: PriceListDetailsViewModel
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.header?.let { 
                            "מחירון – ${it.supplierName ?: "ספק לא ידוע"}"
                        } ?: "מחירון",
                        textAlign = TextAlign.End
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        when {
            uiState.isLoading && uiState.header == null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.errorMessage != null -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "שגיאה בטעינת מחירון",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = uiState.errorMessage ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    // Header card
                    uiState.header?.let { header ->
                        PriceListHeaderCard(header = header)
                    }
                    
                    // Search bar
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = { viewModel.onSearchQueryChange(it) },
                        label = { Text("חיפוש ברשימת המחירון") },
                        placeholder = { Text("חיפוש לפי קוד קבוצה, שם רכב, יצרן או דגם") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        singleLine = true
                    )
                    
                    // Items list
                    if (uiState.items.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = "אין פריטים במחירון זה",
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = "נסה לייבא מחדש או לבדוק את קובץ האקסל",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .weight(1f),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(uiState.items, key = { it.id }) { item ->
                                PriceListItemRow(item = item)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PriceListHeaderCard(header: com.rentacar.app.ui.vm.PriceListHeaderUiModel) {
    val monthNames = listOf(
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
    )
    val monthName = if (header.month in 1..12) monthNames[header.month - 1] else "${header.month}"
    
    val dateFormat = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault())
    val importDate = dateFormat.format(Date(header.importedAtMillis))
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.End
        ) {
            // Supplier name
            Text(
                text = header.supplierName ?: "ספק לא ידוע",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )
            
            Spacer(Modifier.height(4.dp))
            
            // Month/Year
            Text(
                text = "$monthName ${header.year}",
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )
            
            Spacer(Modifier.height(4.dp))
            
            // Import date
            Text(
                text = "יובא: $importDate",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )
            
            // Source file name
            header.sourceFileName?.let { fileName ->
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "קובץ: $fileName",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            
            // Active badge
            if (header.isActive) {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
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
        }
    }
}

@Composable
private fun PriceListItemRow(item: PriceListItemUiModel) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // First line: group & code
            Text(
                text = buildString {
                    if (!item.carGroupName.isNullOrBlank()) append(item.carGroupName)
                    if (!item.carGroupCode.isNullOrBlank()) {
                        if (isNotEmpty()) append(" • ")
                        append(item.carGroupCode)
                    }
                }.ifBlank { "קבוצת רכב לא ידועה" },
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )

            // Second line: manufacturer + model
            if (!item.manufacturer.isNullOrBlank() || !item.model.isNullOrBlank()) {
                Text(
                    text = listOfNotNull(item.manufacturer, item.model)
                        .filter { it.isNotBlank() }
                        .joinToString(" "),
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.End,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 2.dp)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Prices block
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End
            ) {
                // NIS row
                if (item.dailyPriceNis != null ||
                    item.weeklyPriceNis != null ||
                    item.monthlyPriceNis != null
                ) {
                    Text(
                        text = formatPriceLine("₪", item.dailyPriceNis, item.weeklyPriceNis, item.monthlyPriceNis),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                // USD row
                if (item.dailyPriceUsd != null ||
                    item.weeklyPriceUsd != null ||
                    item.monthlyPriceUsd != null
                ) {
                    Text(
                        text = formatPriceLine("$", item.dailyPriceUsd, item.weeklyPriceUsd, item.monthlyPriceUsd),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Insurance / km / deductible
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                val insurance = item.shabbatInsuranceNis ?: item.shabbatInsuranceUsd
                if (insurance != null) {
                    Text(
                        text = "ביטוח: ${insurance}",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                
                val km = item.includedKmPerDay ?: item.includedKmPerWeek ?: item.includedKmPerMonth
                if (km != null) {
                    Text(
                        text = "ק\"מ: $km",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                
                if (item.deductibleNis != null) {
                    Text(
                        text = "השתתפות עצמית: ${item.deductibleNis}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

private fun formatPriceLine(
    currencySymbol: String,
    daily: Double?,
    weekly: Double?,
    monthly: Double?
): String {
    val parts = mutableListOf<String>()
    if (daily != null) parts += "יומי: $currencySymbol${daily}"
    if (weekly != null) parts += "שבועי: $currencySymbol${weekly}"
    if (monthly != null) parts += "חודשי: $currencySymbol${monthly}"
    return parts.joinToString(" • ").ifBlank { "" }
}
