package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListDetailsUiState
import com.rentacar.app.data.SupplierPriceListItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PriceListDetailsScreen(
    headerId: Long,
    onBack: () -> Unit,
    viewModel: PriceListDetailsViewModel
) {
    val state by viewModel.uiState.collectAsState()

    PriceListDetailsContent(
        state = state,
        headerId = headerId,
        onBack = onBack
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PriceListDetailsContent(
    state: PriceListDetailsUiState,
    headerId: Long,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("מחירון") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when {
                state.isLoading -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(8.dp))
                        Text("טוען מחירון...")
                    }
                }
                state.errorMessage != null -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("שגיאה בטעינת מחירון")
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = state.errorMessage,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                state.items.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("אין נתונים למחירון זה")
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "DEBUG: headerId=$headerId, items.size = 0",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                    ) {
                        // Debug header so we always see something
                        Text(
                            text = "DEBUG: headerId=$headerId, items.size = ${state.items.size}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.height(8.dp))
                        
                        LazyColumn(
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(state.items) { item ->
                                PriceListItemRow(item = item)
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PriceListItemRow(item: SupplierPriceListItem) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
    ) {
        // Top line: group
        Text(
            text = buildString {
                append("קבוצה: ")
                append(item.carGroupCode ?: "")
                if (!item.carGroupName.isNullOrBlank() && item.carGroupName != item.carGroupCode) {
                    append(" - ")
                    append(item.carGroupName)
                }
            },
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(Modifier.height(2.dp))
        
        // Model line: manufacturer + model
        Text(
            text = buildString {
                if (!item.manufacturer.isNullOrBlank()) {
                    append(item.manufacturer)
                    if (!item.model.isNullOrBlank()) {
                        append(" ")
                    }
                }
                if (!item.model.isNullOrBlank()) {
                    append(item.model)
                }
                if (isEmpty()) {
                    append("דגם לא ידוע")
                }
            },
            style = MaterialTheme.typography.bodyLarge
        )
        Spacer(Modifier.height(4.dp))
        
        // Prices line
        val priceParts = mutableListOf<String>()
        item.dailyPriceNis?.let { priceParts.add("יומי: ₪${it.toInt()}") }
        item.weeklyPriceNis?.let { priceParts.add("שבועי: ₪${it.toInt()}") }
        item.monthlyPriceNis?.let { priceParts.add("חודשי: ₪${it.toInt()}") }
        
        if (priceParts.isNotEmpty()) {
            Text(
                text = priceParts.joinToString("  |  "),
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
