package com.rentacar.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListGroupUiModel
import com.rentacar.app.data.SupplierPriceListItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PriceListDetailsScreen(
    headerId: Long,
    onBack: () -> Unit,
    viewModel: PriceListDetailsViewModel
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = state.headerSupplierName?.let { 
                            "מחירון – $it"
                        } ?: "מחירון",
                        textAlign = TextAlign.End
                    )
                },
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
        when {
            state.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            state.errorMessage != null -> {
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
                        text = state.errorMessage ?: "",
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
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    // 1) Group dropdown
                    GroupDropdown(
                        groups = state.groups,
                        selectedGroupCode = state.selectedGroupCode,
                        onGroupSelected = { code ->
                            if (code != null) {
                                viewModel.onGroupSelected(code)
                            }
                        }
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // 2) Model dropdown
                    ModelDropdown(
                        models = state.modelsForSelectedGroup,
                        selectedModelId = state.selectedModelId,
                        onModelSelected = { modelId ->
                            if (modelId != null) {
                                viewModel.onModelSelected(modelId)
                            }
                        },
                        enabled = state.selectedGroupCode != null && state.modelsForSelectedGroup.isNotEmpty()
                    )
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // 3) Tariff card
                    if (state.selectedItem != null) {
                        TariffCard(
                            item = state.selectedItem,
                            modifier = Modifier.fillMaxWidth()
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "בחר קבוצה ואז דגם כדי לצפות במחירון",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupDropdown(
    groups: List<PriceListGroupUiModel>,
    selectedGroupCode: String?,
    onGroupSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    
    val filteredGroups = remember(groups, searchQuery) {
        if (searchQuery.isBlank()) {
            groups
        } else {
            val q = searchQuery.lowercase()
            groups.filter { 
                it.code.lowercase().contains(q) || 
                it.name.lowercase().contains(q) 
            }
        }
    }
    
    val selectedGroup = groups.firstOrNull { it.code == selectedGroupCode }
    val displayName = selectedGroup?.let { 
        if (it.name.isNotBlank() && it.name != it.code) {
            "${it.code} – ${it.name}"
        } else {
            it.code
        }
    } ?: "בחר קבוצה"
    
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded }
    ) {
        OutlinedTextField(
            value = displayName,
            onValueChange = { searchQuery = it },
            readOnly = false,
            label = { Text("קבוצה") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            singleLine = true
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            // Search field inside menu
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("חיפוש קבוצה") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                singleLine = true
            )
            HorizontalDivider()
            
            // Clear selection option
            DropdownMenuItem(
                text = { Text("ללא קבוצה") },
                onClick = {
                    onGroupSelected(null)
                    expanded = false
                    searchQuery = ""
                }
            )
            HorizontalDivider()
            
            // Group options
            filteredGroups.forEach { group ->
                val groupDisplayName = if (group.name.isNotBlank() && group.name != group.code) {
                    "${group.code} – ${group.name}"
                } else {
                    group.code
                }
                DropdownMenuItem(
                    text = { Text(groupDisplayName) },
                    onClick = {
                        onGroupSelected(group.code)
                        expanded = false
                        searchQuery = ""
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ModelDropdown(
    models: List<SupplierPriceListItem>,
    selectedModelId: Long?,
    onModelSelected: (Long?) -> Unit,
    enabled: Boolean
) {
    var expanded by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    
    val filteredModels = remember(models, searchQuery) {
        if (searchQuery.isBlank()) {
            models
        } else {
            val q = searchQuery.lowercase()
            models.filter { item ->
                item.manufacturer?.lowercase()?.contains(q) == true ||
                item.model?.lowercase()?.contains(q) == true ||
                (item.manufacturer + " " + item.model).lowercase().contains(q)
            }
        }
    }
    
    val selectedModel = models.firstOrNull { it.id == selectedModelId }
    val selectedModelDisplay = selectedModel?.let { item ->
        listOfNotNull(item.manufacturer, item.model)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .ifBlank { "דגם לא ידוע" }
    } ?: "בחר דגם"
    
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { if (enabled) expanded = !expanded }
    ) {
        OutlinedTextField(
            value = selectedModelDisplay,
            onValueChange = { searchQuery = it },
            readOnly = false,
            label = { Text("דגם") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            enabled = enabled,
            singleLine = true
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            // Search field inside menu
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                label = { Text("חיפוש דגם") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                singleLine = true
            )
            HorizontalDivider()
            
            // Clear selection option
            DropdownMenuItem(
                text = { Text("ללא דגם") },
                onClick = {
                    onModelSelected(null)
                    expanded = false
                    searchQuery = ""
                }
            )
            HorizontalDivider()
            
            // Model options
            filteredModels.forEach { item ->
                val modelDisplay = listOfNotNull(item.manufacturer, item.model)
                    .filter { it.isNotBlank() }
                    .joinToString(" ")
                    .ifBlank { "דגם לא ידוע" }
                DropdownMenuItem(
                    text = { 
                        Column {
                            Text(modelDisplay)
                            if (item.carGroupCode != null) {
                                Text(
                                    text = item.carGroupCode,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    },
                    onClick = {
                        onModelSelected(item.id)
                        expanded = false
                        searchQuery = ""
                    }
                )
            }
        }
    }
}

@Composable
private fun FilterChipsRow(
    availableManufacturers: List<String>,
    selectedManufacturer: String?,
    onManufacturerSelected: (String?) -> Unit,
    enabled: Boolean
) {
    var manufacturerMenuExpanded by remember { mutableStateOf(false) }
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Manufacturer filter chip
        Box {
            FilterChip(
                selected = selectedManufacturer != null,
                onClick = { if (enabled) manufacturerMenuExpanded = true },
                label = { 
                    Text(
                        if (selectedManufacturer != null) "יצרן: $selectedManufacturer" else "יצרן"
                    ) 
                },
                enabled = enabled
            )
            DropdownMenu(
                expanded = manufacturerMenuExpanded,
                onDismissRequest = { manufacturerMenuExpanded = false }
            ) {
                DropdownMenuItem(
                    text = { Text("הסר סינון") },
                    onClick = {
                        onManufacturerSelected(null)
                        manufacturerMenuExpanded = false
                    }
                )
                HorizontalDivider()
                availableManufacturers.forEach { manufacturer ->
                    DropdownMenuItem(
                        text = { Text(manufacturer) },
                        onClick = {
                            onManufacturerSelected(manufacturer)
                            manufacturerMenuExpanded = false
                        }
                    )
                }
            }
        }
        
        // Note: Gearbox filter placeholder - gearbox field doesn't exist in entity
        // FilterChip(
        //     selected = false,
        //     onClick = { },
        //     label = { Text("גיר") },
        //     enabled = false
        // )
    }
}

@Composable
private fun TariffCard(
    item: com.rentacar.app.data.SupplierPriceListItem?,
    modifier: Modifier = Modifier
) {
    if (item == null) {
        Card(
            modifier = modifier,
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "בחר קבוצה ודגם כדי לראות תעריף",
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        return
    }
    
    Card(
        modifier = modifier,
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.End
        ) {
            // Title line
            Text(
                text = buildString {
                    if (!item.manufacturer.isNullOrBlank()) {
                        append(item.manufacturer)
                        if (!item.model.isNullOrBlank()) append(" ")
                    }
                    if (!item.model.isNullOrBlank()) {
                        append(item.model)
                    }
                    if (isEmpty()) append("דגם לא ידוע")
                },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )
            
            Spacer(Modifier.height(4.dp))
            
            // Subtitle line
            val subtitleParts = mutableListOf<String>()
            item.carGroupName?.let { subtitleParts.add(it) }
            item.carGroupCode?.let { subtitleParts.add(it) }
            // Note: gearbox would go here if it existed
            
            if (subtitleParts.isNotEmpty()) {
                Text(
                    text = subtitleParts.joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            
            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))
            
            // Tariff rows
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End
            ) {
                // NIS prices
                if (item.dailyPriceNis != null || item.weeklyPriceNis != null || item.monthlyPriceNis != null) {
                    TariffRow(
                        label = "יומי",
                        value = item.dailyPriceNis?.let { "₪${it.toInt()}" },
                        modifier = Modifier.fillMaxWidth()
                    )
                    TariffRow(
                        label = "שבועי",
                        value = item.weeklyPriceNis?.let { "₪${it.toInt()}" },
                        modifier = Modifier.fillMaxWidth()
                    )
                    TariffRow(
                        label = "חודשי",
                        value = item.monthlyPriceNis?.let { "₪${it.toInt()}" },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                // USD prices (if available)
                if (item.dailyPriceUsd != null || item.weeklyPriceUsd != null || item.monthlyPriceUsd != null) {
                    Spacer(Modifier.height(8.dp))
                    if (item.dailyPriceUsd != null || item.weeklyPriceUsd != null || item.monthlyPriceUsd != null) {
                        TariffRow(
                            label = "יומי (USD)",
                            value = item.dailyPriceUsd?.let { "$${it.toInt()}" },
                            modifier = Modifier.fillMaxWidth()
                        )
                        TariffRow(
                            label = "שבועי (USD)",
                            value = item.weeklyPriceUsd?.let { "$${it.toInt()}" },
                            modifier = Modifier.fillMaxWidth()
                        )
                        TariffRow(
                            label = "חודשי (USD)",
                            value = item.monthlyPriceUsd?.let { "$${it.toInt()}" },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))
            
            // Extra info
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.End
            ) {
                val includedKm = item.includedKmPerDay ?: item.includedKmPerWeek ?: item.includedKmPerMonth
                if (includedKm != null) {
                    Text(
                        text = "כלול $includedKm ק\"מ ליום",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                if (item.extraKmPriceNis != null) {
                    Text(
                        text = "ק\"מ נוסף: ₪${item.extraKmPriceNis.toInt()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                if (item.deductibleNis != null) {
                    Text(
                        text = "השתתפות עצמית: ₪${item.deductibleNis.toInt()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                val insurance = item.shabbatInsuranceNis ?: item.shabbatInsuranceUsd
                if (insurance != null) {
                    Text(
                        text = "ביטוח: ${insurance.toInt()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

@Composable
private fun TariffRow(
    label: String,
    value: String?,
    modifier: Modifier = Modifier
) {
    if (value != null) {
        Row(
            modifier = modifier,
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(8.dp))
    }
}
