package com.rentacar.app.ui.yard

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.SaleOwnerType
import com.rentacar.app.data.FuelType
import com.rentacar.app.data.GearboxType
import com.rentacar.app.data.BodyType
import com.rentacar.app.data.CarManufacturerEntity
import com.rentacar.app.data.CarModelEntity
import com.rentacar.app.data.CarVariantEntity
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.yard.YardCarEditViewModel
import com.rentacar.app.ui.vm.yard.EditableCarImage
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

/**
 * Helper functions for enum to Hebrew translation
 */
private fun SaleOwnerType.toHebrew(): String = when (this) {
    SaleOwnerType.YARD_OWNED -> "הרכב שייך למגרש"
    SaleOwnerType.PRIVATE_SELLER -> "מוכרים עבור לקוח פרטי"
    SaleOwnerType.COMPANY -> "מוכרים עבור חברה"
    SaleOwnerType.LEASING -> "מוכרים עבור ליסינג"
    SaleOwnerType.RENTAL -> "מוכרים עבור חברת השכרה"
}

private fun GearboxType.toHebrew(): String = when (this) {
    GearboxType.AT -> "אוטומט"
    GearboxType.MT -> "ידני"
    GearboxType.CVT -> "CVT"
    GearboxType.DCT -> "DCT"
    GearboxType.AMT -> "רובוטי"
    GearboxType.OTHER -> "אחר"
}

private fun FuelType.toHebrew(): String = when (this) {
    FuelType.PETROL -> "בנזין"
    FuelType.DIESEL -> "דיזל"
    FuelType.HYBRID -> "היברידי"
    FuelType.EV -> "חשמלי"
    FuelType.OTHER -> "אחר"
}

private fun BodyType.toHebrew(): String = when (this) {
    BodyType.SEDAN -> "סדאן"
    BodyType.HATCHBACK -> "הצ'בק"
    BodyType.SUV -> "SUV"
    BodyType.COUPE -> "קופה"
    BodyType.WAGON -> "וואגון"
    BodyType.VAN -> "ואן"
    BodyType.PICKUP -> "פיק-אפ"
    BodyType.OTHER -> "אחר"
}

/**
 * Yard-only screen for adding/editing cars
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun YardCarEditScreen(
    navController: NavHostController,
    viewModel: YardCarEditViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val isEdit = !uiState.isLoading && (uiState.brand.isNotEmpty() || uiState.model.isNotEmpty() || uiState.images.any { it.isExisting })
    
    // Catalog AutoComplete state
    val manufacturerQuery by viewModel.manufacturerQuery.collectAsState()
    val manufacturerSuggestions by viewModel.manufacturerSuggestions.collectAsState()
    val selectedManufacturer by viewModel.selectedManufacturer.collectAsState()
    
    val modelQuery by viewModel.modelQuery.collectAsState()
    val modelSuggestions by viewModel.modelSuggestions.collectAsState()
    
    // Variant state
    val variantSuggestions by viewModel.variantSuggestions.collectAsState()
    val selectedVariant by viewModel.selectedVariant.collectAsState()
    
    // Image picker launcher - supports multiple images
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(10) // Max 10 images
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            viewModel.onAddImagesSelected(uris)
        }
    }
    
    // Handle save completion - navigate back
    LaunchedEffect(uiState.saveCompleted) {
        if (uiState.saveCompleted) {
            navController.popBackStack()
        }
    }
    
    // Show error message
    uiState.errorMessage?.let { errorMsg ->
        LaunchedEffect(errorMsg) {
            // Error is shown via Snackbar in Scaffold
        }
    }
    
    // Loading state
    if (uiState.isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator()
        }
        return
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "עריכת רכב" else "הוספת רכב") },
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
                onClick = { if (!uiState.isSaving) viewModel.onSaveClicked() },
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.alpha(if (!uiState.isSaving) 1f else 0.5f)
            ) {
                if (uiState.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                } else {
                    Text("שמירה", fontWeight = FontWeight.Bold)
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Publication Status Section
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "סטטוס פרסום",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Draft
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { viewModel.onPublicationStatusChanged(CarPublicationStatus.DRAFT) },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = uiState.publicationStatus == CarPublicationStatus.DRAFT,
                                onClick = { viewModel.onPublicationStatusChanged(CarPublicationStatus.DRAFT) }
                            )
                            Text("טיוטה", modifier = Modifier.padding(start = 4.dp))
                        }
                        // Published
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { viewModel.onPublicationStatusChanged(CarPublicationStatus.PUBLISHED) },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = uiState.publicationStatus == CarPublicationStatus.PUBLISHED,
                                onClick = { viewModel.onPublicationStatusChanged(CarPublicationStatus.PUBLISHED) }
                            )
                            Text("מפורסם", modifier = Modifier.padding(start = 4.dp))
                        }
                        // Hidden
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { viewModel.onPublicationStatusChanged(CarPublicationStatus.HIDDEN) },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = uiState.publicationStatus == CarPublicationStatus.HIDDEN,
                                onClick = { viewModel.onPublicationStatusChanged(CarPublicationStatus.HIDDEN) }
                            )
                            Text("מוסתר", modifier = Modifier.padding(start = 4.dp))
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Images Section
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "תמונות הרכב",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(uiState.images) { image ->
                            Box(
                                modifier = Modifier
                                    .size(100.dp)
                                    .clip(RoundedCornerShape(8.dp))
                            ) {
                                AsyncImage(
                                    model = image.localUri?.let { Uri.parse(it) } ?: image.remoteUrl,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(RoundedCornerShape(8.dp)),
                                    contentScale = ContentScale.Crop
                                )
                                IconButton(
                                    onClick = { viewModel.onRemoveImage(image.id) },
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(32.dp)
                                        .background(
                                            MaterialTheme.colorScheme.errorContainer,
                                            CircleShape
                                        )
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Close,
                                        contentDescription = "הסר תמונה",
                                        tint = MaterialTheme.colorScheme.onErrorContainer,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                        item {
                            Card(
                                modifier = Modifier
                                    .size(100.dp)
                                    .clickable { 
                                        // PickMultipleVisualMedia: launch to allow image selection
                                        imagePickerLauncher.launch(
                                            PickVisualMediaRequest.Builder()
                                                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                                .build()
                                        )
                                    },
                                shape = RoundedCornerShape(8.dp),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer
                                )
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxSize(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.Add,
                                        contentDescription = "הוסף תמונות",
                                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = "הוסף",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                    )
                                }
                            }
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Ownership Type Section (Step 5C)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "סוג בעלות",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    var expanded by remember { mutableStateOf(false) }
                    
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = !expanded }
                    ) {
                        OutlinedTextField(
                            value = uiState.saleOwnerType?.toHebrew() ?: "בחר סוג בעלות",
                            onValueChange = { },
                            readOnly = true,
                            label = { Text("למי שייך הרכב?") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false }
                        ) {
                            SaleOwnerType.values().forEach { ownerType ->
                                DropdownMenuItem(
                                    text = { Text(ownerType.toHebrew()) },
                                    onClick = {
                                        viewModel.updateSaleOwnerType(ownerType)
                                        expanded = false
                                    }
                                )
                            }
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Car Details Section
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "פרטי רכב",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    // Brand (AutoComplete)
                    CarManufacturerAutoComplete(
                        query = manufacturerQuery,
                        suggestions = manufacturerSuggestions,
                        onQueryChange = viewModel::onManufacturerQueryChanged,
                        onSuggestionSelected = viewModel::onManufacturerSelected
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Model (AutoComplete)
                    CarModelAutoComplete(
                        query = modelQuery,
                        suggestions = modelSuggestions,
                        isEnabled = selectedManufacturer != null,
                        onQueryChange = viewModel::onModelQueryChanged,
                        onSuggestionSelected = viewModel::onModelSelected
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Year
                    OutlinedTextField(
                        value = uiState.year,
                        onValueChange = { viewModel.onYearChanged(it.filter { ch -> ch.isDigit() }) },
                        label = { Text("שנת ייצור") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Variant selector (if variants available)
                    if (variantSuggestions.isNotEmpty()) {
                        VariantSelector(
                            variants = variantSuggestions,
                            selectedVariant = selectedVariant,
                            onVariantSelected = { viewModel.onVariantSelected(it) }
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                    
                    // Price
                    OutlinedTextField(
                        value = uiState.price,
                        onValueChange = { viewModel.onPriceChanged(it.filter { ch -> ch.isDigit() }) },
                        label = { Text("מחיר") },
                        leadingIcon = {
                            Icon(Icons.Filled.AttachMoney, contentDescription = null)
                        },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Mileage
                    OutlinedTextField(
                        value = uiState.mileageKm,
                        onValueChange = { viewModel.onMileageChanged(it.filter { ch -> ch.isDigit() }) },
                        label = { Text("קילומטраж") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Notes
                    OutlinedTextField(
                        value = uiState.notes,
                        onValueChange = { viewModel.onNotesChanged(it) },
                        label = { Text("הערות") },
                        minLines = 3,
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Technical Car Details Section (Step 5B)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "פרטים טכניים",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    // Gearbox Type
                    var gearboxExpanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = gearboxExpanded,
                        onExpandedChange = { gearboxExpanded = !gearboxExpanded }
                    ) {
                        OutlinedTextField(
                            value = uiState.gearboxType?.toHebrew() ?: "",
                            onValueChange = { },
                            readOnly = true,
                            label = { Text("סוג תיבת הילוכים") },
                            leadingIcon = {
                                Icon(Icons.Filled.Settings, contentDescription = null)
                            },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = gearboxExpanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = gearboxExpanded,
                            onDismissRequest = { gearboxExpanded = false }
                        ) {
                            GearboxType.values().forEach { gearboxType ->
                                DropdownMenuItem(
                                    text = { Text(gearboxType.toHebrew()) },
                                    onClick = {
                                        viewModel.updateGearboxType(gearboxType)
                                        gearboxExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Gear Count
                    OutlinedTextField(
                        value = uiState.gearCount,
                        onValueChange = { viewModel.updateGearCount(it) },
                        label = { Text("מספר הילוכים") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Hand Count
                    OutlinedTextField(
                        value = uiState.handCount,
                        onValueChange = { viewModel.updateHandCount(it) },
                        label = { Text("מספר יד") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Engine Displacement
                    OutlinedTextField(
                        value = uiState.engineDisplacementCc,
                        onValueChange = { viewModel.updateEngineDisplacementCc(it) },
                        label = { Text("נפח מנוע (סמ״ק)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Engine Power
                    OutlinedTextField(
                        value = uiState.enginePowerHp,
                        onValueChange = { viewModel.updateEnginePowerHp(it) },
                        label = { Text("כוח סוס (HP)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Fuel Type
                    var fuelExpanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = fuelExpanded,
                        onExpandedChange = { fuelExpanded = !fuelExpanded }
                    ) {
                        OutlinedTextField(
                            value = uiState.fuelType?.toHebrew() ?: "",
                            onValueChange = { },
                            readOnly = true,
                            label = { Text("סוג דלק") },
                            leadingIcon = {
                                Icon(Icons.Filled.LocalGasStation, contentDescription = null)
                            },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fuelExpanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = fuelExpanded,
                            onDismissRequest = { fuelExpanded = false }
                        ) {
                            FuelType.values().forEach { fuelType ->
                                DropdownMenuItem(
                                    text = { Text(fuelType.toHebrew()) },
                                    onClick = {
                                        viewModel.updateFuelType(fuelType)
                                        fuelExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Body Type
                    var bodyTypeExpanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(
                        expanded = bodyTypeExpanded,
                        onExpandedChange = { bodyTypeExpanded = !bodyTypeExpanded }
                    ) {
                        OutlinedTextField(
                            value = uiState.bodyType?.toHebrew() ?: "",
                            onValueChange = { },
                            readOnly = true,
                            label = { Text("סוג רכב") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = bodyTypeExpanded) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor()
                        )
                        ExposedDropdownMenu(
                            expanded = bodyTypeExpanded,
                            onDismissRequest = { bodyTypeExpanded = false }
                        ) {
                            BodyType.values().forEach { bodyType ->
                                DropdownMenuItem(
                                    text = { Text(bodyType.toHebrew()) },
                                    onClick = {
                                        viewModel.updateBodyType(bodyType)
                                        bodyTypeExpanded = false
                                    }
                                )
                            }
                        }
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // AC Switch
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "מיזוג אוויר",
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Switch(
                            checked = uiState.ac,
                            onCheckedChange = { viewModel.updateAc(it) }
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Color
                    OutlinedTextField(
                        value = uiState.color,
                        onValueChange = { viewModel.updateColor(it) },
                        label = { Text("צבע") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Ownership Details
                    OutlinedTextField(
                        value = uiState.ownershipDetails,
                        onValueChange = { viewModel.updateOwnershipDetails(it) },
                        label = { Text("פרטי בעלות / הערות") },
                        minLines = 2,
                        maxLines = 4,
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // License Plate Partial
                    OutlinedTextField(
                        value = uiState.licensePlatePartial,
                        onValueChange = { viewModel.updateLicensePlatePartial(it) },
                        label = { Text("לוחית רישוי (חלקית)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // VIN Last Digits
                    OutlinedTextField(
                        value = uiState.vinLastDigits,
                        onValueChange = { viewModel.updateVinLastDigits(it) },
                        label = { Text("מספר VIN (ספרות אחרונות)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Customer Details Section (conditional - only when not YARD_OWNED) - Step 5C
            if (uiState.saleOwnerType != SaleOwnerType.YARD_OWNED) {
                Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "פרטי לקוח",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    
                    // First Name
                    OutlinedTextField(
                        value = uiState.firstName,
                        onValueChange = { viewModel.onFirstNameChanged(it) },
                        label = { Text("שם פרטי") },
                        leadingIcon = {
                            Icon(Icons.Filled.Person, contentDescription = null)
                        },
                        isError = uiState.validationErrors.containsKey("firstName"),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Last Name
                    OutlinedTextField(
                        value = uiState.lastName,
                        onValueChange = { viewModel.onLastNameChanged(it) },
                        label = { Text("שם משפחה") },
                        leadingIcon = {
                            Icon(Icons.Filled.Person, contentDescription = null)
                        },
                        isError = uiState.validationErrors.containsKey("lastName"),
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Phone
                    OutlinedTextField(
                        value = uiState.phone,
                        onValueChange = { viewModel.onPhoneChanged(it) },
                        label = { Text("טלפון") },
                        leadingIcon = {
                            Icon(Icons.Filled.Phone, contentDescription = null)
                        },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone),
                        isError = uiState.validationErrors.containsKey("phone"),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
            }
        }
    }
    
    // Show error Snackbar
    uiState.errorMessage?.let { errorMsg ->
        LaunchedEffect(errorMsg) {
            // Snackbar will be shown via Scaffold's snackbarHostState if needed
        }
    }
}

/**
 * AutoComplete composable for car manufacturer selection
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CarManufacturerAutoComplete(
    query: String,
    suggestions: List<CarManufacturerEntity>,
    onQueryChange: (String) -> Unit,
    onSuggestionSelected: (CarManufacturerEntity) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded && suggestions.isNotEmpty(),
        onExpandedChange = { expanded = it }
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                onQueryChange(it)
                expanded = true
            },
            label = { Text("יצרן") },
            leadingIcon = {
                Icon(Icons.Filled.DirectionsCar, contentDescription = null)
            },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded && suggestions.isNotEmpty()) },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            singleLine = true
        )

        ExposedDropdownMenu(
            expanded = expanded && suggestions.isNotEmpty(),
            onDismissRequest = { expanded = false }
        ) {
            suggestions.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.nameHe) },
                    onClick = {
                        onSuggestionSelected(item)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * AutoComplete composable for car model selection
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CarModelAutoComplete(
    query: String,
    suggestions: List<CarModelEntity>,
    isEnabled: Boolean,
    onQueryChange: (String) -> Unit,
    onSuggestionSelected: (CarModelEntity) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded && suggestions.isNotEmpty() && isEnabled,
        onExpandedChange = { expanded = it && isEnabled }
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                onQueryChange(it)
                if (isEnabled) {
                    expanded = true
                }
            },
            label = { Text("דגם") },
            leadingIcon = {
                Icon(Icons.Filled.DirectionsCar, contentDescription = null)
            },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded && suggestions.isNotEmpty() && isEnabled) },
            enabled = isEnabled,
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            singleLine = true,
            placeholder = { Text(if (isEnabled) "בחר דגם" else "בחר תחילה יצרן") }
        )

        ExposedDropdownMenu(
            expanded = expanded && suggestions.isNotEmpty() && isEnabled,
            onDismissRequest = { expanded = false }
        ) {
            suggestions.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.nameHe) },
                    onClick = {
                        onSuggestionSelected(item)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * Variant selector composable for car variant selection
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VariantSelector(
    variants: List<CarVariantEntity>,
    selectedVariant: CarVariantEntity?,
    onVariantSelected: (CarVariantEntity) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val label = selectedVariant?.let { formatVariantLabel(it) } ?: "בחר וריאנט"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it }
    ) {
        OutlinedTextField(
            value = label,
            onValueChange = {},
            readOnly = true,
            label = { Text("וריאנט") },
            modifier = Modifier
                .menuAnchor()
                .fillMaxWidth(),
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            variants.forEach { variant ->
                DropdownMenuItem(
                    text = { Text(formatVariantLabel(variant)) },
                    onClick = {
                        onVariantSelected(variant)
                        expanded = false
                    }
                )
            }
        }
    }
}

/**
 * Format variant label for display
 */
private fun formatVariantLabel(variant: CarVariantEntity): String {
    val parts = mutableListOf<String>()
    
    // Add body type if available
    variant.bodyType?.let { parts.add(it) }
    
    // Add year range if available
    if (variant.fromYear != null && variant.toYear != null) {
        parts.add("${variant.fromYear}–${variant.toYear}")
    } else if (variant.fromYear != null) {
        parts.add("מ-${variant.fromYear}")
    }
    
    // Use external_id as fallback if no other info
    if (parts.isEmpty()) {
        return variant.externalId
    }
    
    return parts.joinToString(" • ")
}

