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

// Currency enum for price display
enum class PriceCurrency {
    NIS,
    USD
}

// Conversion rate (if USD fields don't exist, use this)
private const val NIS_TO_USD = 0.27

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

private val classWithDashRegex = Regex("([A-Za-z])\\s*[- ]\\s*(\\d{2,4}(?:/\\d{2,4})?)")
private val classSimpleRegex = Regex("([A-Za-z])\\s+(\\d{2,4}(?:/\\d{2,4})?)")
private val classLetterInParensRegex = Regex("\\(([A-Za-z])\\)")
private val digitsRegex = Regex("\\b(\\d{2,4})\\b")

/**
 * Parse class letter + code from the raw name/code fields.
 *
 * Returns:
 *  - first  = classLetter (e.g. "B", "G", "H", "M")
 *  - second = classCodeLabel for display (e.g. "B 100/101", "G 106", "M 112")
 *
 * Examples:
 *  "G - 106"            -> ("G", "G 106")
 *  "B 100/101"          -> ("B", "B 100/101")
 *  "B 100/101 - ..."    -> ("B", "B 100/101")
 *  "M-112 - רכב יוקרה" -> ("M", "M 112")
 *  "106 - מנהלים (G)"  -> ("G", "G 106")
 */
private fun parseClassInfo(
    carGroupName: String?,
    carGroupCode: String?
): Pair<String?, String?> {
    val source = buildString {
        if (!carGroupCode.isNullOrBlank()) append(carGroupCode).append(' ')
        if (!carGroupName.isNullOrBlank()) append(carGroupName)
    }.trim()

    if (source.isEmpty()) return null to null

    var letter: String? = null
    var code: String? = null

    // 1) Patterns like "G - 106", "B 100/101", "H 107"
    val m1 = classWithDashRegex.find(source)
    if (m1 != null) {
        letter = m1.groupValues[1].uppercase()
        code = m1.groupValues[2]
    } else {
        val m2 = classSimpleRegex.find(source)
        if (m2 != null) {
            letter = m2.groupValues[1].uppercase()
            code = m2.groupValues[2]
        } else {
            // 2) Patterns like "106 - ... (G)" – letter in parentheses and digits elsewhere
            val m3 = classLetterInParensRegex.find(source)
            if (m3 != null) {
                letter = m3.groupValues[1].uppercase()
                val digits = digitsRegex.find(source)?.groupValues?.getOrNull(1)
                code = digits
            }
        }
    }

    val classCodeLabel = when {
        !letter.isNullOrBlank() && !code.isNullOrBlank() -> "$letter $code"
        !letter.isNullOrBlank() -> letter
        else -> null
    }

    return letter to classCodeLabel
}

/**
 * Expand a "letter + code pattern" into individual variant codes, for future data processing.
 *
 * Example:
 *   expandClassVariants("B", "100/101") -> ["B 100", "B 101"]
 *   expandClassVariants("G", "106")     -> ["G 106"]
 *
 * Currently NOT used in this screen's UI or filtering, but provided for future logic.
 */
@Suppress("unused")
private fun expandClassVariants(
    letter: String?,
    rawCode: String?
): List<String> {
    if (letter.isNullOrBlank() || rawCode.isNullOrBlank()) return emptyList()
    return rawCode
        .split('/')
        .mapNotNull { part ->
            val p = part.trim()
            if (p.isEmpty()) null else "$letter $p"
        }
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
 * Delegates to parseClassInfo for robust parsing.
 */
private fun extractClassLetter(
    carGroupCode: String?,
    carGroupName: String?
): String? {
    val (letter, _) = parseClassInfo(
        carGroupName = carGroupName,
        carGroupCode = carGroupCode
    )
    return letter
}

/**
 * Extract class code (e.g. "A 110", "C 102", "K 115") from carGroupCode.
 * Returns the non-Hebrew part that contains letter + numbers.
 */
private fun extractClassCode(
    carGroupCode: String?,
    carGroupName: String?
): String? {
    // Try to get the non-Hebrew side from splitGroupAndClass
    val raw = carGroupName?.trim().takeUnless { it.isNullOrBlank() }
        ?: carGroupCode?.trim().takeUnless { it.isNullOrBlank() }
        ?: return carGroupCode?.trim()

    val parts = raw.split('-')
    if (parts.size >= 2) {
        val left = parts[0].trim()
        val right = parts[1].trim()
        val leftHasHebrew = hebrewRegex.containsMatchIn(left)
        val rightHasHebrew = hebrewRegex.containsMatchIn(right)

        // Return the non-Hebrew side
        return when {
            leftHasHebrew && !rightHasHebrew -> right
            rightHasHebrew && !leftHasHebrew -> left
            else -> carGroupCode?.trim()
        }
    }

    // No dash -> return carGroupCode if it doesn't have Hebrew
    val code = carGroupCode?.trim().orEmpty()
    return if (code.isNotEmpty() && !hebrewRegex.containsMatchIn(code)) {
        code
    } else {
        code.takeIf { it.isNotEmpty() }
    }
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
    
    // Currency toggle state
    var priceCurrency by rememberSaveable { mutableStateOf(PriceCurrency.NIS) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(text = "מחירון")
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                },
                actions = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        CurrencyChip(
                            label = "ש\"ח",
                            selected = priceCurrency == PriceCurrency.NIS,
                            onClick = { priceCurrency = PriceCurrency.NIS }
                        )
                        CurrencyChip(
                            label = "$",
                            selected = priceCurrency == PriceCurrency.USD,
                            onClick = { priceCurrency = PriceCurrency.USD }
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
                                PriceListItemRow(item = item, priceCurrency = priceCurrency)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PriceListItemRow(
    item: SupplierPriceListItem,
    priceCurrency: PriceCurrency
) {
    val groupName = extractHebrewGroupName(
        carGroupName = item.carGroupName,
        carGroupCode = item.carGroupCode
    ) ?: ""
    
    val (classLetter, classCodeLabel) = parseClassInfo(
        carGroupName = item.carGroupName,
        carGroupCode = item.carGroupCode
    )
    
    val headerClassText = classCodeLabel ?: classLetter ?: ""
    
    // Currency symbol and price values
    val currencySymbol = when (priceCurrency) {
        PriceCurrency.NIS -> "ש\"ח"
        PriceCurrency.USD -> "$"
    }
    
    val dailyPrice = if (priceCurrency == PriceCurrency.NIS) {
        item.dailyPriceNis
    } else {
        item.dailyPriceUsd ?: (item.dailyPriceNis?.times(NIS_TO_USD))
    }
    
    val weeklyPrice = if (priceCurrency == PriceCurrency.NIS) {
        item.weeklyPriceNis
    } else {
        item.weeklyPriceUsd ?: (item.weeklyPriceNis?.times(NIS_TO_USD))
    }
    
    val monthlyPrice = if (priceCurrency == PriceCurrency.NIS) {
        item.monthlyPriceNis
    } else {
        item.monthlyPriceUsd ?: (item.monthlyPriceNis?.times(NIS_TO_USD))
    }
    
    val extraKmPrice = if (priceCurrency == PriceCurrency.NIS) {
        item.extraKmPriceNis
    } else {
        item.extraKmPriceUsd ?: (item.extraKmPriceNis?.times(NIS_TO_USD))
    }
    
    val deductible = item.deductibleNis?.let { nis ->
        if (priceCurrency == PriceCurrency.USD) {
            nis * NIS_TO_USD
        } else {
            nis
        }
    }
    
    val shabbatInsurance = if (priceCurrency == PriceCurrency.NIS) {
        item.shabbatInsuranceNis
    } else {
        item.shabbatInsuranceUsd ?: (item.shabbatInsuranceNis?.times(NIS_TO_USD))
    }
    
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
            // Line 1: group + class
            if (groupName.isNotEmpty() || headerClassText.isNotEmpty()) {
                Text(
                    text = buildString {
                        append("קבוצת ")
                        if (groupName.isNotEmpty()) {
                            append(groupName)
                        } else {
                            append("לא ידוע")
                        }
                        if (headerClassText.isNotEmpty()) {
                            append(" – ")
                            append(headerClassText)
                        }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
            }
            
            // Line 2: manufacturer + model
            val manufacturerModel = buildString {
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
            }
            Text(
                text = manufacturerModel,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(4.dp))
            
            // Line 3: price line
            val priceParts = mutableListOf<String>()
            dailyPrice?.let { priceParts.add("יומי ${it.toInt()} $currencySymbol") }
            weeklyPrice?.let { priceParts.add("שבועי ${it.toInt()} $currencySymbol") }
            monthlyPrice?.let { priceParts.add("חודשי ${it.toInt()} $currencySymbol") }
            
            if (priceParts.isNotEmpty()) {
                Text(
                    text = "מחיר ${priceParts.joinToString(" · ")}",
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
            }
            
            // Line 4: included kilometers
            val kmParts = mutableListOf<String>()
            item.includedKmPerDay?.let { kmParts.add("יומי $it") }
            item.includedKmPerWeek?.let { kmParts.add("שבועי $it") }
            item.includedKmPerMonth?.let { kmParts.add("חודשי $it") }
            
            if (kmParts.isNotEmpty()) {
                Text(
                    text = "כולל ${kmParts.joinToString(" ק\"מ · ", " ק\"מ", "")}",
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(4.dp))
            }
            
            // Line 5: costs line (extra km + deductible + Saturday insurance)
            val extraKmStr = extraKmPrice?.toInt()?.toString()
            val deductibleStr = deductible?.toInt()?.toString()
            val saturdayInsuranceStr = shabbatInsurance?.toInt()?.toString()
            
            val costsParts = mutableListOf<String>()
            
            // עלות ק"מ נוסף
            if (!extraKmStr.isNullOrBlank()) {
                costsParts.add("עלות ק\"מ נוסף $extraKmStr $currencySymbol")
            }
            
            // השתתפות עצמית
            if (!deductibleStr.isNullOrBlank()) {
                costsParts.add("השתתפות עצמית $deductibleStr $currencySymbol")
            }
            
            // ביטוח שבת
            if (!saturdayInsuranceStr.isNullOrBlank()) {
                costsParts.add("ביטוח שבת $saturdayInsuranceStr $currencySymbol")
            }
            
            if (costsParts.isNotEmpty()) {
                Text(
                    text = costsParts.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun CurrencyChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = {
            Text(
                text = label,
                maxLines = 1,
                overflow = TextOverflow.Clip
            )
        },
        border = null,
        modifier = Modifier
            .padding(horizontal = 2.dp)
    )
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
