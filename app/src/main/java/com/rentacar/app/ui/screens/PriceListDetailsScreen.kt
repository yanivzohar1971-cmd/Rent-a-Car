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
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.background
import com.rentacar.app.ui.vm.PriceListDetailsViewModel
import com.rentacar.app.ui.vm.PriceListDetailsUiState
import com.rentacar.app.data.SupplierPriceListItem
import com.rentacar.app.data.extractHebrewGroupName
import com.rentacar.app.data.parseClassInfo
import com.rentacar.app.data.normalizeClassSource
import com.rentacar.app.data.expandClassVariants
import com.rentacar.app.data.hebrewRegex

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
                state.isLoading && state.items.isEmpty() -> {
                    // Full-screen loading ONLY when there is no data yet
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
                    // Always show content when data exists, even if refreshing
                    Box(modifier = Modifier.fillMaxSize()) {
                        val allItems = state.items
                        
                        // Step 1: Define NormalizedItem data class
                        data class NormalizedItem(
                            val item: SupplierPriceListItem,
                            val groupName: String?,        // Hebrew semantic group, may be null
                            val classCodeLabel: String?    // e.g. "M 112", "G 106", "B 100/101"
                        )
                        
                        // Step 2: Build normalized items list
                        val normalizedItems: List<NormalizedItem> = allItems.map { item ->
                            val groupName = extractHebrewGroupName(
                                carGroupName = item.carGroupName,
                                carGroupCode = item.carGroupCode
                            )
                            val (_, classCodeLabel) = parseClassInfo(
                                carGroupName = item.carGroupName,
                                carGroupCode = item.carGroupCode
                            )
                            NormalizedItem(
                                item = item,
                                groupName = groupName,
                                classCodeLabel = classCodeLabel
                            )
                        }
                        
                        // Step 3: Build classCodeLabel -> dominant groupName map
                        val classToGroupName: Map<String, String> = normalizedItems
                            .filter { it.groupName != null && it.classCodeLabel != null }
                            .groupBy { it.classCodeLabel!! }
                            .mapValues { (_, itemsForClass) ->
                                // Pick the most frequent groupName for this class code
                                itemsForClass
                                    .groupingBy { it.groupName!! }
                                    .eachCount()
                                    .maxBy { it.value }
                                    .key
                            }
                        
                        // Step 4: Define effectiveGroupName accessor
                        fun NormalizedItem.effectiveGroupName(): String? {
                            // 1) If item already has Hebrew groupName, use it.
                            if (!groupName.isNullOrBlank()) return groupName
                            
                            // 2) If no Hebrew, but we know classCodeLabel and that class has a dominant groupName → use it.
                            if (!classCodeLabel.isNullOrBlank()) {
                                classToGroupName[classCodeLabel]?.let { inferred ->
                                    return inferred
                                }
                            }
                            
                            // 3) Otherwise, no semantic group known.
                            return null
                        }
                        
                        // Step 5: Build groupOptions using effectiveGroupName ONLY
                        val groupOptions: List<GroupOption> = normalizedItems
                            .mapNotNull { normalized ->
                                val effectiveName = normalized.effectiveGroupName()
                                effectiveName?.let { name ->
                                    GroupOption(
                                        key = name,
                                        label = name
                                    )
                                }
                            }
                            .distinctBy { it.key }
                            .sortedBy { it.label }
                        
                        // Step 6: Apply group filter using effectiveGroupName
                        val itemsAfterGroupFilter: List<NormalizedItem> = if (selectedGroupKey == null) {
                            normalizedItems
                        } else {
                            normalizedItems.filter { normalized ->
                                normalized.effectiveGroupName() == selectedGroupKey
                            }
                        }
                        
                        // Step 7: Build Class options (letters) from itemsAfterGroupFilter
                        val classOptions: List<String> = itemsAfterGroupFilter
                            .mapNotNull { normalized ->
                                extractClassLetter(
                                    carGroupCode = normalized.item.carGroupCode,
                                    carGroupName = normalized.item.carGroupName
                                )
                            }
                            .distinct()
                            .sorted()
                        
                        // Step 8: Apply Class filter next
                        val itemsAfterClassFilter: List<NormalizedItem> = if (selectedClassLetter == null) {
                            itemsAfterGroupFilter
                        } else {
                            itemsAfterGroupFilter.filter { normalized ->
                                extractClassLetter(
                                    carGroupCode = normalized.item.carGroupCode,
                                    carGroupName = normalized.item.carGroupName
                                ) == selectedClassLetter
                            }
                        }
                        
                        // Step 9: Manufacturer options should be derived from items AFTER class filter
                        val manufacturerOptions: List<String> = itemsAfterClassFilter
                            .mapNotNull { normalized ->
                                normalized.item.manufacturer?.trim().takeIf { !it.isNullOrBlank() }
                            }
                            .distinct()
                            .sorted()
                        
                        // Step 10: Apply manufacturer filter last
                        val filteredNormalizedItems: List<NormalizedItem> = if (selectedManufacturer == null) {
                            itemsAfterClassFilter
                        } else {
                            itemsAfterClassFilter.filter { normalized ->
                                normalized.item.manufacturer?.trim() == selectedManufacturer
                            }
                        }
                        
                        // Step 11: Finally, the list of actual items to show
                        val filteredItems: List<SupplierPriceListItem> = filteredNormalizedItems.map { it.item }
                        
                        // Inline loading indicator when refreshing existing data
                        if (state.isLoading) {
                            LinearProgressIndicator(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .align(Alignment.TopCenter)
                            )
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
}

// Helper composables for price list item card
@Composable
private fun GroupLabelRow(groupText: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
                .background(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(16.dp)
                )
                .padding(vertical = 6.dp, horizontal = 12.dp)
        ) {
            Text(
                text = groupText,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun ModelTitleRow(modelName: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "🚗",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(end = 4.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = modelName,
            style = MaterialTheme.typography.titleLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun InfoRow(
    emoji: String,
    text: String
) {
    if (text.isBlank()) return

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = emoji,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(end = 6.dp)
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            lineHeight = 18.sp
        )
    }
}

@Composable
private fun HighlightsRow(
    includedKmText: String?,
    deductibleText: String?,
    shabatText: String?,
    modifier: Modifier = Modifier
) {
    val chips = listOfNotNull(
        includedKmText?.takeIf { it.isNotBlank() },
        deductibleText?.takeIf { it.isNotBlank() },
        shabatText?.takeIf { it.isNotBlank() }
    )
    if (chips.isEmpty()) return

    Row(
        modifier = modifier
            .fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        chips.forEach { chipText ->
            PriceHighlightChip(text = chipText)
        }
    }
}

@Composable
private fun PriceHighlightChip(text: String) {
    Surface(
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
        tonalElevation = 0.dp
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// Table helper composables for price list item card
@Composable
private fun TableLabelSpacer() {
    // Fixed width cell for alignment with row labels
    Box(
        modifier = Modifier.width(64.dp)
    )
}


@Composable
private fun TableRowLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        modifier = Modifier.width(64.dp)
    )
}

@Composable
private fun PriceTableSection(
    dailyPrice: String?,
    weeklyPrice: String?,
    monthlyPrice: String?,
    dailyKm: String?,
    weeklyKm: String?,
    monthlyKm: String?,
    extraKmPrice: String?,
    deductible: String?,
    shabbatInsurance: String?,
    modifier: Modifier = Modifier
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        // Header row: יומי / שבועי / חודשי
        Row(modifier = Modifier.fillMaxWidth()) {
            TableLabelSpacer() // empty cell at the start for row labels
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "יומי",
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "שבועי",
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "חודשי",
                    style = MaterialTheme.typography.labelMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Row: מחיר
        Row(modifier = Modifier.fillMaxWidth()) {
            TableRowLabel("מחיר")
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = dailyPrice ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = weeklyPrice ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = monthlyPrice ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Row: עד (included KM limit)
        Row(modifier = Modifier.fillMaxWidth()) {
            TableRowLabel("עד")
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = dailyKm?.let { "$it ק\"מ" } ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = weeklyKm?.let { "$it ק\"מ" } ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = monthlyKm?.let { "$it ק\"מ" } ?: "-",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Start,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Extra costs header row
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "ק\"מ נוסף",
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "השתתפות עצמית",
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = "ביטוח שבת",
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Extra costs values row
        Row(modifier = Modifier.fillMaxWidth()) {
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = extraKmPrice ?: "-",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = deductible ?: "-",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Box(modifier = Modifier.weight(1f)) {
                Text(
                    text = shabbatInsurance ?: "-",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.fillMaxWidth()
                )
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
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(24.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 1) Small label – group + class code
            val groupText = buildString {
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
            }
            if (groupText.isNotEmpty()) {
                GroupLabelRow(groupText = groupText)
            }
            
            // 2) Main model line with car emoji
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
            ModelTitleRow(modelName = manufacturerModel)
            
            // 3) Price table section - structured mini-table
            val dailyPriceStr = dailyPrice?.toInt()?.let { "$it $currencySymbol" }
            val weeklyPriceStr = weeklyPrice?.toInt()?.let { "$it $currencySymbol" }
            val monthlyPriceStr = monthlyPrice?.toInt()?.let { "$it $currencySymbol" }
            
            val dailyKmStr = item.includedKmPerDay?.toString()
            val weeklyKmStr = item.includedKmPerWeek?.toString()
            val monthlyKmStr = item.includedKmPerMonth?.toString()
            
            val extraKmStr = extraKmPrice?.toInt()?.let { "$it $currencySymbol" }
            val deductibleStr = deductible?.toInt()?.let { "$it $currencySymbol" }
            val saturdayInsuranceStr = shabbatInsurance?.toInt()?.let { "$it $currencySymbol" }
            
            PriceTableSection(
                dailyPrice = dailyPriceStr,
                weeklyPrice = weeklyPriceStr,
                monthlyPrice = monthlyPriceStr,
                dailyKm = dailyKmStr,
                weeklyKm = weeklyKmStr,
                monthlyKm = monthlyKmStr,
                extraKmPrice = extraKmStr,
                deductible = deductibleStr,
                shabbatInsurance = saturdayInsuranceStr,
                modifier = Modifier.padding(top = 8.dp)
            )
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
