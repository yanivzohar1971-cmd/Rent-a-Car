package com.rentacar.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListDetailsUiState
import com.rentacar.app.data.SupplierPriceListItem

// Data class for group filter options
data class GroupOption(
    val key: String,
    val label: String
)

private val hebrewRegex = Regex("[א-ת]")

/**
 * Extracts ONLY the Hebrew group name, without codes.
 *
 * Examples:
 *  "B 100/101 - רכב קטן"   -> "רכב קטן"
 *  "רכב קטן - C 102"       -> "רכב קטן"
 *  "106 - מנהלים (G)"      -> "מנהלים (G)"   (Hebrew side)
 *  "רכב משפחתי גדול"       -> "רכב משפחתי גדול" (no dash -> whole string)
 */
private fun extractHebrewGroupName(
    carGroupName: String?,
    carGroupCode: String?
): String? {
    val raw = carGroupName?.trim().takeUnless { it.isNullOrBlank() }
        ?: carGroupCode?.trim().takeUnless { it.isNullOrBlank() }
        ?: return null

    val parts = raw.split('-')
    if (parts.size >= 2) {
        val left = parts[0].trim()
        val right = parts[1].trim()
        val leftHasHebrew = hebrewRegex.containsMatchIn(left)
        val rightHasHebrew = hebrewRegex.containsMatchIn(right)

        return when {
            leftHasHebrew && !rightHasHebrew -> left
            rightHasHebrew && !leftHasHebrew -> right
            leftHasHebrew && rightHasHebrew  -> right // arbitrary but stable
            else                             -> raw
        }
    }

    // No dash -> if it has Hebrew, use it; otherwise null
    return if (hebrewRegex.containsMatchIn(raw)) raw else null
}

/**
 * Parse a raw group name/code into:
 *  - groupName: Hebrew semantic name (e.g. "רכב קטן", "רכב יוקרה")
 *  - classLetter: A/B/C/... class letter if we can infer it
 *
 * Examples:
 *  "B 100/101 - רכב קטן"  -> groupName = "רכב קטן", classLetter = "B"
 *  "רכב קטן - C 102"      -> groupName = "רכב קטן", classLetter = "C"
 *  "106 - מנהלים (G)"     -> groupName = "מנהלים (G)" (Hebrew part), classLetter = "G"
 */
private fun splitGroupAndClass(
    carGroupName: String?,
    carGroupCode: String?
): Pair<String?, String?> {
    // Prefer the stored name; fallback to code if needed
    val raw = carGroupName?.trim().takeUnless { it.isNullOrBlank() }
        ?: carGroupCode?.trim().takeUnless { it.isNullOrBlank() }
        ?: return null to null

    // Split once on '-'
    val parts = raw.split('-')
    val left = parts.getOrNull(0)?.trim().orEmpty()
    val right = parts.getOrNull(1)?.trim().orEmpty()

    val leftHasHebrew = hebrewRegex.containsMatchIn(left)
    val rightHasHebrew = hebrewRegex.containsMatchIn(right)

    // Decide which side is the Hebrew "group name"
    val groupName = (when {
        leftHasHebrew && !rightHasHebrew -> left
        rightHasHebrew && !leftHasHebrew -> right
        // If both / none contain Hebrew, fallback to the raw string
        else -> {
            if (hebrewRegex.containsMatchIn(raw)) {
                raw
            } else {
                // last fallback: whichever side is non-empty, or raw
                listOf(left, right, raw).firstOrNull { it.isNotBlank() } ?: raw
            }
        }
    }).ifBlank { null }

    // The "other" side is where the class letter usually lives
    val nonHebrewSide = when (groupName) {
        left -> right
        right -> left
        else -> carGroupCode ?: right
    }

    // Extract first Latin letter from that side as class
    val classLetter = nonHebrewSide
        .firstOrNull { it.isLetter() }
        ?.uppercase()

    return groupName to classLetter
}

/**
 * Extract just the class letter (A/B/C/...) from name+code.
 * First tries splitGroupAndClass, then falls back to carGroupCode.
 */
private fun extractClassLetter(
    carGroupCode: String?,
    carGroupName: String?
): String? {
    val (_, fromSplit) = splitGroupAndClass(
        carGroupName = carGroupName,
        carGroupCode = carGroupCode
    )
    if (!fromSplit.isNullOrBlank()) return fromSplit

    val code = carGroupCode?.trim().orEmpty()
    if (code.isEmpty()) return null
    val ch = code.firstOrNull { it.isLetter() } ?: return null
    return ch.uppercase()
}

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
                    
                    // 1) Build distinct group options using ONLY the Hebrew group name + GROUP BY
                    val groupOptions: List<GroupOption> = allItems
                        .mapNotNull { item ->
                            val groupName = extractHebrewGroupName(
                                carGroupName = item.carGroupName,
                                carGroupCode = item.carGroupCode
                            )
                            groupName?.let { name ->
                                GroupOption(
                                    key = name,
                                    label = name
                                )
                            }
                        }
                        .distinctBy { it.key }   // REAL GROUP BY on Hebrew name
                        .sortedBy { it.label }
                    
                    // 2) Apply Group filter using the same Hebrew name
                    val itemsAfterGroupFilter = if (selectedGroupKey == null) {
                        allItems
                    } else {
                        allItems.filter { item ->
                            val groupName = extractHebrewGroupName(
                                carGroupName = item.carGroupName,
                                carGroupCode = item.carGroupCode
                            )
                            groupName == selectedGroupKey
                        }
                    }
                    
                    // 3) Build Class options (letters) from itemsAfterGroupFilter
                    val classOptions: List<String> = itemsAfterGroupFilter
                        .mapNotNull { item ->
                            extractClassLetter(
                                carGroupCode = item.carGroupCode,
                                carGroupName = item.carGroupName
                            )
                        }
                        .distinct()
                        .sorted()
                    
                    // 4) Apply Class filter next
                    val itemsAfterClassFilter = if (selectedClassLetter == null) {
                        itemsAfterGroupFilter
                    } else {
                        itemsAfterGroupFilter.filter { item ->
                            extractClassLetter(
                                carGroupCode = item.carGroupCode,
                                carGroupName = item.carGroupName
                            ) == selectedClassLetter
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
                        // Filter row - responsive pills
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Each Box gets weight so chips distribute nicely across width
                            Box(modifier = Modifier.weight(1f)) {
                                ManufacturerFilterChip(
                                    manufacturerOptions = manufacturerOptions,
                                    selectedManufacturer = selectedManufacturer,
                                    onManufacturerSelected = { newManufacturer ->
                                        selectedManufacturer = newManufacturer
                                    }
                                )
                            }
                            
                            Box(modifier = Modifier.weight(1f)) {
                                GroupFilterChip(
                                    groupOptions = groupOptions,
                                    selectedGroupKey = selectedGroupKey,
                                    onGroupSelected = { newKey ->
                                        selectedGroupKey = newKey
                                        // Reset dependent filters
                                        selectedClassLetter = null
                                        selectedManufacturer = null
                                    }
                                )
                            }
                            
                            Box(modifier = Modifier.weight(1f)) {
                                ClassFilterChip(
                                    classOptions = classOptions,
                                    selectedClassLetter = selectedClassLetter,
                                    onClassSelected = { newClass ->
                                        selectedClassLetter = newClass
                                        selectedManufacturer = null
                                    }
                                )
                            }
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
    val (groupName, _) = splitGroupAndClass(
        carGroupName = item.carGroupName,
        carGroupCode = item.carGroupCode
    )
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            // Top line: group (semantic name)
            if (!groupName.isNullOrBlank()) {
                Text(
                    text = "קבוצה: $groupName",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(Modifier.height(2.dp))
            }
            
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
}

@Composable
private fun ManufacturerFilterChip(
    manufacturerOptions: List<String>,
    selectedManufacturer: String?,
    onManufacturerSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val label = selectedManufacturer ?: "כל היצרנים"
    
    AssistChip(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            if (manufacturerOptions.isNotEmpty()) {
                expanded = true
            }
        },
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingIcon = {
            Icon(
                imageVector = Icons.Default.DirectionsCar,
                contentDescription = null
            )
        },
        shape = MaterialTheme.shapes.large,
        border = AssistChipDefaults.assistChipBorder(enabled = true)
    )
    
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

@Composable
private fun GroupFilterChip(
    groupOptions: List<GroupOption>,
    selectedGroupKey: String?,
    onGroupSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val label = when {
        selectedGroupKey == null -> "כל הקבוצות"
        else -> groupOptions.firstOrNull { it.key == selectedGroupKey }?.label
            ?: "קבוצה לא ידועה"
    }
    
    AssistChip(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            if (groupOptions.isNotEmpty()) {
                expanded = true
            }
        },
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        shape = MaterialTheme.shapes.large,
        border = AssistChipDefaults.assistChipBorder(enabled = true)
    )
    
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

@Composable
private fun ClassFilterChip(
    classOptions: List<String>,
    selectedClassLetter: String?,
    onClassSelected: (String?) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    val label = when {
        selectedClassLetter == null -> "כל הרמות"
        else -> "רמה ${selectedClassLetter}"
    }
    
    AssistChip(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            if (classOptions.isNotEmpty()) {
                expanded = true
            }
        },
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        trailingIcon = {
            Icon(
                imageVector = Icons.Default.ArrowDropDown,
                contentDescription = null
            )
        },
        shape = MaterialTheme.shapes.large,
        border = AssistChipDefaults.assistChipBorder(enabled = true),
        enabled = classOptions.isNotEmpty()
    )
    
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
