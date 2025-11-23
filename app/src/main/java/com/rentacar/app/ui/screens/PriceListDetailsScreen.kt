package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListDetailsUiState
import com.rentacar.app.data.SupplierPriceListItem

// Data class for group filter options
data class GroupOption(
    val key: String,
    val label: String
)

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
    // Local filter state (not in ViewModel – keep ViewModel untouched)
    var selectedGroupKey by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedClassLetter by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedManufacturer by rememberSaveable { mutableStateOf<String?>(null) }

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
                    val allItems = state.items
                    
                    // Build distinct group options from items
                    val groupOptions: List<GroupOption> = allItems
                        .mapNotNull { item ->
                            val code = item.carGroupCode?.trim()
                            val name = item.carGroupName?.trim()
                            
                            if (code.isNullOrBlank() && name.isNullOrBlank()) {
                                null
                            } else {
                                val key = (code ?: name)!!
                                val label = when {
                                    !name.isNullOrBlank() && !code.isNullOrBlank() && name != code ->
                                        "$name ($code)"
                                    !name.isNullOrBlank() -> name
                                    !code.isNullOrBlank() -> code
                                    else -> key
                                }
                                GroupOption(key = key, label = label)
                            }
                        }
                        .distinctBy { it.key }
                        .sortedBy { it.label }
                    
                    // Filter by selected group
                    val itemsAfterGroupFilter = if (selectedGroupKey == null) {
                        allItems
                    } else {
                        allItems.filter { item ->
                            val code = item.carGroupCode?.trim()
                            val name = item.carGroupName?.trim()
                            val key = (code ?: name)
                            key == selectedGroupKey
                        }
                    }
                    
                    // Build class options (A, B, C, ...) from items after group filter
                    val classOptions: List<String> = itemsAfterGroupFilter
                        .mapNotNull { item ->
                            extractClassLetter(item.carGroupCode)
                        }
                        .distinct()
                        .sorted()
                    
                    // Apply class filter (after group filter)
                    val itemsAfterClassFilter = if (selectedClassLetter == null) {
                        itemsAfterGroupFilter
                    } else {
                        itemsAfterGroupFilter.filter { item ->
                            extractClassLetter(item.carGroupCode) == selectedClassLetter
                        }
                    }
                    
                    // Manufacturer options should be derived from items AFTER class filter
                    val manufacturerOptions: List<String> = itemsAfterClassFilter
                        .mapNotNull { item ->
                            item.manufacturer?.trim().takeIf { !it.isNullOrBlank() }
                        }
                        .distinct()
                        .sorted()
                    
                    // Apply manufacturer filter last
                    val filteredItems = if (selectedManufacturer == null) {
                        itemsAfterClassFilter
                    } else {
                        itemsAfterClassFilter.filter { item ->
                            item.manufacturer?.trim() == selectedManufacturer
                        }
                    }
                    
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                    ) {
                        // Filter row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            GroupFilterDropdown(
                                groupOptions = groupOptions,
                                selectedGroupKey = selectedGroupKey,
                                onGroupSelected = { newKey ->
                                    selectedGroupKey = newKey
                                    // Reset dependent filters
                                    selectedClassLetter = null
                                    selectedManufacturer = null
                                }
                            )
                            
                            ClassFilterDropdown(
                                classOptions = classOptions,
                                selectedClassLetter = selectedClassLetter,
                                onClassSelected = { newClass ->
                                    selectedClassLetter = newClass
                                    selectedManufacturer = null
                                }
                            )
                            
                            ManufacturerFilterDropdown(
                                manufacturerOptions = manufacturerOptions,
                                selectedManufacturer = selectedManufacturer,
                                onManufacturerSelected = { newManufacturer ->
                                    selectedManufacturer = newManufacturer
                                }
                            )
                        }
                        
                        Spacer(Modifier.height(12.dp))
                        
                        // Debug header so we always see something
                        Text(
                            text = "DEBUG: headerId=$headerId, items=${state.items.size}, afterGroup=${itemsAfterGroupFilter.size}, afterClass=${itemsAfterClassFilter.size}, filtered=${filteredItems.size}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.height(8.dp))
                        
                        if (filteredItems.isEmpty()) {
                            Text(
                                text = "אין רכבים תואמים לסינון הנוכחי",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Spacer(Modifier.height(8.dp))
                        }
                        
                        LazyColumn(
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(filteredItems) { item ->
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

// Helper function to extract class letter from carGroupCode
private fun extractClassLetter(carGroupCode: String?): String? {
    // Example codes: "B 100/101", "C 102", "J 109"
    val code = carGroupCode?.trim().orEmpty()
    if (code.isEmpty()) return null

    // Take the first non-space character; if it's a letter, treat as class
    val ch = code.firstOrNull { !it.isWhitespace() } ?: return null
    return if (ch.isLetter()) ch.uppercase() else null
}

@Composable
private fun GroupFilterDropdown(
    groupOptions: List<GroupOption>,
    selectedGroupKey: String?,
    onGroupSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val selectedLabel = when {
        selectedGroupKey == null -> "כל הקבוצות"
        else -> groupOptions.firstOrNull { it.key == selectedGroupKey }?.label
            ?: "קבוצה לא ידועה"
    }
    
    Box {
        FilledTonalButton(
            onClick = { expanded = true }
        ) {
            Text(selectedLabel)
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("כל הקבוצות") },
                onClick = {
                    expanded = false
                    onGroupSelected(null)
                }
            )
            groupOptions.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    onClick = {
                        expanded = false
                        onGroupSelected(option.key)
                    }
                )
            }
        }
    }
}

@Composable
private fun ManufacturerFilterDropdown(
    manufacturerOptions: List<String>,
    selectedManufacturer: String?,
    onManufacturerSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val selectedLabel = when {
        selectedManufacturer == null -> "כל היצרנים"
        else -> selectedManufacturer
    }
    
    Box {
        FilledTonalButton(
            onClick = {
                // If there are no manufacturers at all, do nothing
                if (manufacturerOptions.isNotEmpty()) {
                    expanded = true
                }
            },
            enabled = manufacturerOptions.isNotEmpty()
        ) {
            Text(selectedLabel)
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("כל היצרנים") },
                onClick = {
                    expanded = false
                    onManufacturerSelected(null)
                }
            )
            manufacturerOptions.forEach { manufacturer ->
                DropdownMenuItem(
                    text = { Text(manufacturer) },
                    onClick = {
                        expanded = false
                        onManufacturerSelected(manufacturer)
                    }
                )
            }
        }
    }
}

@Composable
private fun ClassFilterDropdown(
    classOptions: List<String>,
    selectedClassLetter: String?,
    onClassSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val label = when {
        selectedClassLetter == null -> "כל הרמות"
        else -> "רמה ${selectedClassLetter}"
    }
    
    Box {
        FilledTonalButton(
            onClick = {
                if (classOptions.isNotEmpty()) {
                    expanded = true
                }
            },
            enabled = classOptions.isNotEmpty()
        ) {
            Text(label)
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("כל הרמות") },
                onClick = {
                    expanded = false
                    onClassSelected(null)
                }
            )
            classOptions.forEach { classLetter ->
                DropdownMenuItem(
                    text = { Text("רמה $classLetter") },
                    onClick = {
                        expanded = false
                        onClassSelected(classLetter)
                    }
                )
            }
        }
    }
}
