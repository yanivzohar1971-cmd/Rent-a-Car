package com.rentacar.app.ui.yard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowDropUp
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.*
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.navigation.Routes
import com.rentacar.app.ui.vm.yard.YardFleetViewModel
import com.rentacar.app.ui.vm.yard.YardCarItem
import com.rentacar.app.ui.vm.yard.YardCarStatus
import com.rentacar.app.ui.vm.yard.YardCarStatusFilter
import com.rentacar.app.ui.vm.yard.TransmissionFilter
import com.rentacar.app.ui.vm.yard.FuelTypeFilter
import com.rentacar.app.ui.vm.yard.YardFleetSort
import com.rentacar.app.ui.vm.yard.YardFleetSortField
import com.rentacar.app.ui.vm.yard.SortDirection

/**
 * Yard Home / Dashboard Screen
 * Main entry point for users with YARD role
 */
@Composable
fun YardHomeScreen(
    navController: NavHostController,
    authViewModel: com.rentacar.app.ui.auth.AuthViewModel
) {
    val authState by authViewModel.uiState.collectAsState()
    val userProfile = authState.currentUser
    val yardName = userProfile?.displayName ?: userProfile?.email ?: "שם מגרש לא מוגדר"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        TitleBar(
            title = "מגרש רכבים",
            color = com.rentacar.app.LocalTitleColor.current,
            onSettingsClick = { navController.navigate(Routes.Settings) }
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Yard name subtitle
        Text(
            text = yardName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Action cards
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item {
                // Yard Profile Card
                YardActionCard(
                    icon = Icons.Filled.Business,
                    title = "פרטי המגרש",
                    subtitle = "שם, כתובת, טלפון, לוגו",
                    onClick = {
                        navController.navigate(Routes.YardProfile)
                    }
                )
            }
            
            item {
                // Fleet Management Card
                YardActionCard(
                    icon = Icons.Filled.DirectionsCar,
                    title = "צי הרכב שלי",
                    subtitle = "ניהול רכבים במגרש – הוספה, עריכה, פרסום",
                    onClick = {
                        navController.navigate(Routes.YardFleet)
                    }
                )
            }
        }
    }
}

/**
 * Reusable action card for Yard home screen
 */
@Composable
private fun YardActionCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                )
            }
        }
    }
}

/**
 * Yard Profile Screen (placeholder)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardProfileScreen(navController: NavHostController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("פרטי המגרש") },
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
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "מסך פרטי מגרש – יפותח בהמשך",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center
            )
        }
    }
}

/**
 * Yard Fleet Screen
 * Shows list of cars in the yard's fleet
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardFleetScreen(
    navController: NavHostController,
    viewModel: YardFleetViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val filters by viewModel.filters.collectAsState()
    val sort by viewModel.sort.collectAsState()
    val summary by viewModel.summary.collectAsState()
    val filteredCars by viewModel.filteredCars.collectAsState()
    val errorMessage = uiState.errorMessage
    
    // Show error snackbar if there's an error
    LaunchedEffect(errorMessage) {
        errorMessage?.let { error ->
            // Show snackbar (could use Scaffold's SnackbarHost for better UX)
            android.util.Log.e("YardFleetScreen", error)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("צי הרכב שלי") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.Filled.ArrowBack,
                            contentDescription = "חזור"
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    // Navigate to Yard-only car creation screen
                    navController.navigate(Routes.YardCarEdit)
                }
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = "הוסף רכב"
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                // Loading state
                uiState.isLoading && uiState.items.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                
                // Error state (show error message, but keep items if available)
                errorMessage != null && uiState.items.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { viewModel.refreshFleet() }) {
                            Text("נסה שוב")
                        }
                    }
                }
                
                // Empty state (check filtered cars, not all items)
                filteredCars.isEmpty() && !uiState.isLoading -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = if (uiState.items.isEmpty()) {
                                "אין עדיין רכבים במגרש שלך"
                            } else {
                                "לא נמצאו רכבים התואמים לסינון"
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        if (uiState.items.isEmpty()) {
                            Button(
                                onClick = {
                                    navController.navigate(Routes.YardCarEdit)
                                }
                            ) {
                                Text("הוסף רכב ראשון")
                            }
                        } else {
                            Button(
                                onClick = {
                                    viewModel.clearAllFilters()
                                }
                            ) {
                                Text("נקה סינון")
                            }
                        }
                    }
                }
                
                // Normal state with items
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        // Summary card at the top
                        item {
                            YardFleetSummaryCard(summary = summary)
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        
                        // Filter bar
                        item {
                            YardFleetFilterBar(
                                filters = filters,
                                onStatusFilterChanged = viewModel::updateStatusFilter,
                                onTransmissionFilterChanged = viewModel::updateTransmissionFilter,
                                onFuelTypeFilterChanged = viewModel::updateFuelTypeFilter,
                                onQueryChanged = viewModel::updateQuery,
                                onClearFilters = viewModel::clearAllFilters
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        
                        // Sort bar
                        item {
                            YardFleetSortBar(
                                sort = sort,
                                onSortFieldSelected = { field -> viewModel.updateSortField(field) }
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        
                        items(filteredCars) { car ->
                            YardCarCard(
                                car = car,
                                onClick = {
                                    // Navigate to Yard-only car edit screen
                                    val carId = car.id.toLongOrNull()
                                    if (carId != null) {
                                        navController.navigate(Routes.YardCarEditWithId.replace("{carId}", carId.toString()))
                                    }
                                }
                            )
                        }
                        
                        // Show error message at bottom if items exist but there's also an error
                        if (errorMessage != null) {
                            item {
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = errorMessage,
                                        modifier = Modifier.padding(12.dp),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Car card item for fleet list
 */
@Composable
private fun YardCarCard(
    car: YardCarItem,
    onClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Line 1: Brand + Model + Year (if available)
            val yearText = car.year?.let { ", $it" } ?: ""
            Text(
                text = "${car.brand} ${car.model}$yearText",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Line 2: Price
            Text(
                text = car.price?.let { "₪$it" } ?: "מחיר לא מוגדר",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            // Line 3: Status chip
            val (statusText, statusColor) = when (car.status) {
                YardCarStatus.PUBLISHED -> "מפורסם" to MaterialTheme.colorScheme.primary
                YardCarStatus.HIDDEN -> "מוסתר" to MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                YardCarStatus.DRAFT -> "טיוטה" to MaterialTheme.colorScheme.error
            }
            
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = statusColor.copy(alpha = 0.2f)
            ) {
                Text(
                    text = statusText,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor
                )
            }
        }
    }
}

/**
 * Filter bar for Yard Fleet Screen
 */
@Composable
private fun YardFleetFilterBar(
    filters: com.rentacar.app.ui.vm.yard.YardCarFilter,
    onStatusFilterChanged: (YardCarStatusFilter) -> Unit,
    onTransmissionFilterChanged: (TransmissionFilter) -> Unit,
    onFuelTypeFilterChanged: (FuelTypeFilter) -> Unit,
    onQueryChanged: (String) -> Unit,
    onClearFilters: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // First row: Status, Transmission, Fuel filters
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StatusFilterChip(
                selectedStatus = filters.status,
                onStatusSelected = onStatusFilterChanged,
                modifier = Modifier.weight(1f)
            )
            TransmissionFilterChip(
                selected = filters.transmission,
                onSelected = onTransmissionFilterChanged,
                modifier = Modifier.weight(1f)
            )
            FuelFilterChip(
                selected = filters.fuelType,
                onSelected = onFuelTypeFilterChanged,
                modifier = Modifier.weight(1f)
            )
        }
        
        // Second row: Search field and clear button
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                modifier = Modifier.weight(1f),
                value = filters.query,
                onValueChange = onQueryChanged,
                singleLine = true,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Search,
                        contentDescription = null
                    )
                },
                label = { Text("חיפוש") },
                placeholder = { Text("יצרן / דגם / לוחית / הערה") }
            )
            
            IconButton(
                onClick = onClearFilters,
                enabled = filters != com.rentacar.app.ui.vm.yard.YardCarFilter()
            ) {
                Icon(
                    imageVector = Icons.Filled.Clear,
                    contentDescription = "נקה סינון"
                )
            }
        }
    }
}

/**
 * Status filter chip
 */
@Composable
private fun StatusFilterChip(
    selectedStatus: YardCarStatusFilter,
    onStatusSelected: (YardCarStatusFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    
    Box(modifier = modifier) {
        FilterChip(
            selected = selectedStatus != YardCarStatusFilter.ALL,
            onClick = { expanded = true },
            label = {
                Text(
                    text = when (selectedStatus) {
                        YardCarStatusFilter.ALL -> "הכל"
                        YardCarStatusFilter.ACTIVE -> "פעיל"
                        YardCarStatusFilter.RESERVED -> "הוזמן"
                        YardCarStatusFilter.SOLD -> "נמכר"
                        YardCarStatusFilter.DRAFT -> "טיוטה"
                    }
                )
            }
        )
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            YardCarStatusFilter.values().forEach { status ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = when (status) {
                                YardCarStatusFilter.ALL -> "הכל"
                                YardCarStatusFilter.ACTIVE -> "פעיל"
                                YardCarStatusFilter.RESERVED -> "הוזמן"
                                YardCarStatusFilter.SOLD -> "נמכר"
                                YardCarStatusFilter.DRAFT -> "טיוטה"
                            }
                        )
                    },
                    onClick = {
                        onStatusSelected(status)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * Transmission filter chip
 */
@Composable
private fun TransmissionFilterChip(
    selected: TransmissionFilter,
    onSelected: (TransmissionFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    
    Box(modifier = modifier) {
        FilterChip(
            selected = selected != TransmissionFilter.ANY,
            onClick = { expanded = true },
            label = {
                Text(
                    text = when (selected) {
                        TransmissionFilter.ANY -> "הכל"
                        TransmissionFilter.AUTOMATIC -> "אוטומט"
                        TransmissionFilter.MANUAL -> "ידני"
                    }
                )
            }
        )
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            TransmissionFilter.values().forEach { transmission ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = when (transmission) {
                                TransmissionFilter.ANY -> "הכל"
                                TransmissionFilter.AUTOMATIC -> "אוטומט"
                                TransmissionFilter.MANUAL -> "ידני"
                            }
                        )
                    },
                    onClick = {
                        onSelected(transmission)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * Fuel type filter chip
 */
@Composable
private fun FuelFilterChip(
    selected: FuelTypeFilter,
    onSelected: (FuelTypeFilter) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    
    Box(modifier = modifier) {
        FilterChip(
            selected = selected != FuelTypeFilter.ANY,
            onClick = { expanded = true },
            label = {
                Text(
                    text = when (selected) {
                        FuelTypeFilter.ANY -> "הכל"
                        FuelTypeFilter.PETROL -> "בנזין"
                        FuelTypeFilter.DIESEL -> "דיזל"
                        FuelTypeFilter.HYBRID -> "היברידי"
                        FuelTypeFilter.ELECTRIC -> "חשמלי"
                    }
                )
            }
        )
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            FuelTypeFilter.values().forEach { fuelType ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = when (fuelType) {
                                FuelTypeFilter.ANY -> "הכל"
                                FuelTypeFilter.PETROL -> "בנזין"
                                FuelTypeFilter.DIESEL -> "דיזל"
                                FuelTypeFilter.HYBRID -> "היברידי"
                                FuelTypeFilter.ELECTRIC -> "חשמלי"
                            }
                        )
                    },
                    onClick = {
                        onSelected(fuelType)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * Summary card showing fleet statistics
 */
@Composable
private fun YardFleetSummaryCard(
    summary: com.rentacar.app.ui.vm.yard.YardFleetSummary
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Text(
                text = "סיכום המגרש",
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
                        text = "סה\"כ רכבים: ${summary.totalCount}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "פעילים לפרסום: ${summary.activeCount}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Column(
                    horizontalAlignment = Alignment.End
                ) {
                    Text(
                        text = "נמכרו: ${summary.soldCount}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Text(
                        text = "טיוטות: ${summary.draftCount}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            HorizontalDivider()
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "שווי מוערך: ${formatCurrency(summary.totalEstimatedValue)}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

/**
 * Format currency value with thousands separators
 */
private fun formatCurrency(value: Long): String {
    return if (value == 0L) {
        "₪ 0"
    } else {
        val formatted = java.text.NumberFormat.getNumberInstance(java.util.Locale.US).format(value)
        "₪ $formatted"
    }
}

/**
 * Sort bar for yard fleet
 */
@Composable
private fun YardFleetSortBar(
    sort: YardFleetSort,
    onSortFieldSelected: (YardFleetSortField) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "מיון לפי:",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
        
        SortChip(
            label = "תאריך",
            selected = sort.field == YardFleetSortField.CREATED_AT,
            direction = sort.direction,
            onClick = { onSortFieldSelected(YardFleetSortField.CREATED_AT) }
        )
        
        SortChip(
            label = "מחיר",
            selected = sort.field == YardFleetSortField.PRICE,
            direction = sort.direction,
            onClick = { onSortFieldSelected(YardFleetSortField.PRICE) }
        )
        
        SortChip(
            label = "שנה",
            selected = sort.field == YardFleetSortField.YEAR,
            direction = sort.direction,
            onClick = { onSortFieldSelected(YardFleetSortField.YEAR) }
        )
        
        SortChip(
            label = "ק\"מ",
            selected = sort.field == YardFleetSortField.MILEAGE,
            direction = sort.direction,
            onClick = { onSortFieldSelected(YardFleetSortField.MILEAGE) }
        )
    }
}

/**
 * Sort chip component
 */
@Composable
private fun SortChip(
    label: String,
    selected: Boolean,
    direction: SortDirection,
    onClick: () -> Unit
) {
    FilterChip(
        onClick = onClick,
        label = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(label)
                if (selected) {
                    Icon(
                        imageVector = if (direction == SortDirection.ASC) {
                            Icons.Filled.ArrowDropUp
                        } else {
                            Icons.Filled.ArrowDropDown
                        },
                        contentDescription = if (direction == SortDirection.ASC) "עולה" else "יורד",
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        },
        selected = selected
    )
}

