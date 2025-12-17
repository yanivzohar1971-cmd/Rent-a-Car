package com.rentacar.app.ui.yard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.ui.components.GlobalProgressDialog
import com.rentacar.app.ui.components.TitleBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardSmartPublishScreen(
    importJobId: String?,
    navController: NavController,
    viewModel: com.rentacar.app.ui.vm.yard.YardSmartPublishViewModel
) {
    val state by viewModel.uiState.collectAsState()
    
    LaunchedEffect(importJobId) {
        viewModel.load(importJobId)
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("פרסום חכם") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .padding(padding)
                    .padding(16.dp)
                    .fillMaxSize()
            ) {
                // Summary card
                if (state.stats.total > 0) {
                    SmartPublishSummaryCard(
                        stats = state.stats,
                        importJobId = state.importJobId
                    )
                    Spacer(Modifier.height(16.dp))
                }
                
                // Filters
                SmartPublishFilters(
                    selectedStatus = state.selectedPublicationStatus,
                    selectedManufacturer = state.selectedManufacturer,
                    selectedManufacturers = state.selectedManufacturers,
                    selectedModel = state.selectedModel,
                    cars = state.cars,
                    selectedRegions = state.selectedRegions,
                    onStatusSelected = { status ->
                        viewModel.applyFilters(publicationStatus = status)
                    },
                    onManufacturerSelected = { manufacturer ->
                        viewModel.applyFilters(manufacturer = manufacturer)
                    },
                    onManufacturerToggled = { manufacturer ->
                        viewModel.toggleManufacturerFilter(manufacturer)
                    },
                    onClearManufacturerFilters = {
                        viewModel.clearManufacturerFilters()
                    },
                    onModelSelected = { model ->
                        viewModel.applyFilters(model = model)
                    },
                    onRegionToggled = { regionId ->
                        viewModel.toggleRegionFilter(regionId)
                    },
                    onClearRegionFilters = {
                        viewModel.clearRegionFilters()
                    },
                    onClearFilters = {
                        viewModel.clearManufacturerFilters()
                        viewModel.clearRegionFilters()
                        viewModel.applyFilters()
                    }
                )
                
                Spacer(Modifier.height(16.dp))
                
                // Bulk actions
                if (state.cars.isNotEmpty()) {
                    SmartPublishBulkActions(
                        state = state,
                        onPublishAll = { viewModel.publishAllInFilter() },
                        onHideAll = { viewModel.hideAllInFilter() },
                        onDraftAll = { viewModel.draftAllInFilter() },
                        onPublishNewFromImport = { viewModel.publishNewCarsFromImport() },
                        onPublishSelected = { viewModel.publishSelected() },
                        onHideSelected = { viewModel.hideSelected() },
                        onDraftSelected = { viewModel.draftSelected() },
                        onSelectAll = { viewModel.selectAllInCurrentFilter() },
                        onClearSelection = { viewModel.clearSelection() }
                    )
                    Spacer(Modifier.height(16.dp))
                }
                
                // Cars list
                if (state.cars.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            "אין רכבים להצגה",
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(state.cars) { car ->
                            CarPublishItem(
                                car = car,
                                isSelected = car.id in state.selectedCarIds,
                                onToggleSelection = { viewModel.toggleCarSelection(car.id) }
                            )
                        }
                    }
                }
                
                // Error message - show as text below list if present
                state.errorMessage?.let { errorMsg ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        errorMsg,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            
            // Progress dialog
            GlobalProgressDialog(
                visible = state.isLoading,
                message = "טוען נתונים..."
            )
        }
    }
}

@Composable
private fun SmartPublishSummaryCard(
    stats: com.rentacar.app.ui.vm.yard.SmartPublishStats,
    importJobId: String?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                "סיכום",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            if (importJobId != null && stats.draftFromImportCount > 0) {
                Text(
                    "ייבוא נוכחי: ${stats.draftFromImportCount} רכבים חדשים בטיוטה",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            
            Text(
                "סה\"כ בצי: ${stats.total}, מתוכם ${stats.draftCount} טיוטות, ${stats.publishedCount} מפורסמים, ${stats.hiddenCount} מוסתרים",
                style = MaterialTheme.typography.bodySmall
            )
            
            if (importJobId != null) {
                AssistChip(
                    onClick = { },
                    label = { Text("מציג רק רכבים מייבוא זה") }
                )
            }
        }
    }
}

@Composable
private fun SmartPublishFilters(
    selectedStatus: CarPublicationStatus?,
    selectedManufacturer: String?,
    selectedManufacturers: Set<String>,
    selectedModel: String?,
    cars: List<com.rentacar.app.data.CarSale>,
    selectedRegions: Set<String>,
    onStatusSelected: (CarPublicationStatus?) -> Unit,
    onManufacturerSelected: (String?) -> Unit,
    onManufacturerToggled: (String) -> Unit,
    onClearManufacturerFilters: () -> Unit,
    onModelSelected: (String?) -> Unit,
    onRegionToggled: (String) -> Unit,
    onClearRegionFilters: () -> Unit,
    onClearFilters: () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            "פילטרים",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold
        )
        
        // Publication status filter
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = selectedStatus == null,
                onClick = { onStatusSelected(null) },
                label = { Text("הכל") }
            )
            FilterChip(
                selected = selectedStatus == CarPublicationStatus.DRAFT,
                onClick = { onStatusSelected(CarPublicationStatus.DRAFT) },
                label = { Text("טיוטה") }
            )
            FilterChip(
                selected = selectedStatus == CarPublicationStatus.PUBLISHED,
                onClick = { onStatusSelected(CarPublicationStatus.PUBLISHED) },
                label = { Text("מפורסם") }
            )
            FilterChip(
                selected = selectedStatus == CarPublicationStatus.HIDDEN,
                onClick = { onStatusSelected(CarPublicationStatus.HIDDEN) },
                label = { Text("מוסתר") }
            )
        }
        
        // Manufacturer multi-select filter (chips row)
        val manufacturers = cars.mapNotNull { it.brand }.distinct().sorted()
        if (manufacturers.isNotEmpty()) {
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                if (selectedManufacturers.isEmpty()) {
                    Text(
                        "אין יצרנים מסומנים – מציג את כל היצרנים",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    manufacturers.forEach { manufacturer ->
                        FilterChip(
                            selected = manufacturer in selectedManufacturers,
                            onClick = { onManufacturerToggled(manufacturer) },
                            label = { Text(manufacturer) }
                        )
                    }
                    if (selectedManufacturers.isNotEmpty()) {
                        FilterChip(
                            selected = false,
                            onClick = onClearManufacturerFilters,
                            label = { Text("נקה בחירת יצרנים") }
                        )
                    }
                }
            }
        }
        
        // Location (region) multi-select filter (chips row)
        val availableRegions = cars
            .mapNotNull { car ->
                if (car.regionId != null && car.regionNameHe != null) {
                    car.regionId to car.regionNameHe
                } else null
            }
            .distinctBy { it.first } // Distinct by regionId
            .sortedBy { it.second } // Sort by Hebrew name
        
        if (availableRegions.isNotEmpty()) {
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                if (selectedRegions.isEmpty()) {
                    Text(
                        "אין אזורים מסומנים – מציג רכבים מכל הארץ",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    availableRegions.forEach { (regionId, regionName) ->
                        FilterChip(
                            selected = regionId in selectedRegions,
                            onClick = { onRegionToggled(regionId) },
                            label = { Text(regionName) }
                        )
                    }
                    if (selectedRegions.isNotEmpty()) {
                        FilterChip(
                            selected = false,
                            onClick = onClearRegionFilters,
                            label = { Text("נקה בחירת אזורים") }
                        )
                    }
                }
                Text(
                    "אפשר לבחור יותר מאזור אחד לחיפוש",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
        
        // Clear filters button
        if (selectedStatus != null || selectedManufacturer != null || selectedManufacturers.isNotEmpty() || selectedModel != null || selectedRegions.isNotEmpty()) {
            TextButton(onClick = onClearFilters) {
                Text("נקה פילטרים")
            }
        }
    }
}

@Composable
private fun SmartPublishBulkActions(
    state: com.rentacar.app.ui.vm.yard.YardSmartPublishUiState,
    onPublishAll: () -> Unit,
    onHideAll: () -> Unit,
    onDraftAll: () -> Unit,
    onPublishNewFromImport: () -> Unit,
    onPublishSelected: () -> Unit,
    onHideSelected: () -> Unit,
    onDraftSelected: () -> Unit,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Actions on all filtered cars
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                "פעולות על כל המסוננים",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            
            // Primary action based on filter
            when (state.selectedPublicationStatus) {
                CarPublicationStatus.DRAFT -> {
                    Button(
                        onClick = onPublishAll,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("פרסם את כל הרכבים במסנן (${state.cars.size})")
                    }
                }
                CarPublicationStatus.PUBLISHED -> {
                    Button(
                        onClick = onHideAll,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("הסתר את כל הרכבים במסנן (${state.cars.size})")
                    }
                }
                else -> {
                    Button(
                        onClick = onPublishAll,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("פרסם את כל הרכבים במסנן (${state.cars.size})")
                    }
                }
            }
            
            // Secondary actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onHideAll,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("הסתר הכל")
                }
                OutlinedButton(
                    onClick = onDraftAll,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("הפוך לטיוטה")
                }
            }
            
            // Publish new from import (if applicable)
            if (state.importJobId != null && state.stats.draftFromImportCount > 0) {
                Button(
                    onClick = onPublishNewFromImport,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("פרסם את כל הרכבים החדשים בייבוא זה (${state.stats.draftFromImportCount})")
                }
            }
        }
        
        // Actions on selected cars
        if (state.selectedCount > 0) {
            Divider(Modifier.padding(vertical = 4.dp))
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "${state.selectedCount} רכבים נבחרו",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    TextButton(onClick = onClearSelection) {
                        Text("נקה בחירה")
                    }
                }
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = onPublishSelected,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("פרסם נבחרים")
                    }
                    OutlinedButton(
                        onClick = onHideSelected,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("הסתר נבחרים")
                    }
                    OutlinedButton(
                        onClick = onDraftSelected,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("טיוטה נבחרים")
                    }
                }
            }
        } else {
            // Show "Select all" button when no cars are selected
            TextButton(
                onClick = onSelectAll,
                enabled = state.cars.isNotEmpty()
            ) {
                Text("בחר הכל (${state.cars.size})")
            }
        }
    }
}

@Composable
private fun CarPublishItem(
    car: com.rentacar.app.data.CarSale,
    isSelected: Boolean,
    onToggleSelection: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (isSelected) {
                    Modifier.background(
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                        RoundedCornerShape(8.dp)
                    )
                } else {
                    Modifier
                }
            ),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggleSelection)
                .padding(12.dp),
            horizontalArrangement = Arrangement.Start,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Checkbox for selection
            Checkbox(
                checked = isSelected,
                onCheckedChange = { onToggleSelection() },
                modifier = Modifier.padding(end = 8.dp)
            )
            
            Spacer(Modifier.width(8.dp))
            
            // Car details
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "${car.brand ?: ""} ${car.model ?: ""} ${car.year ?: ""}".trim(),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "מחיר: ${car.salePrice.toInt()} ₪",
                    style = MaterialTheme.typography.bodySmall
                )
                if (car.mileageKm != null) {
                    Text(
                        "קילומטраж: ${car.mileageKm}",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            
            // Status badges
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Status badge
                val status = CarPublicationStatus.fromString(car.publicationStatus)
                val statusText = when (status) {
                    CarPublicationStatus.DRAFT -> "טיוטה"
                    CarPublicationStatus.PUBLISHED -> "מפורסם"
                    CarPublicationStatus.HIDDEN -> "מוסתר"
                }
                AssistChip(
                    onClick = { },
                    label = { Text(statusText) }
                )
                
                // New from import badge
                if (car.isNewFromImport) {
                    AssistChip(
                        onClick = { },
                        label = { Text("חדש מהייבוא") }
                    )
                }
            }
        }
    }
}

