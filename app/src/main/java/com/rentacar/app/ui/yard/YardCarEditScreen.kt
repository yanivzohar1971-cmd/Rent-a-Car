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
import com.rentacar.app.ui.components.TitleBar
import com.rentacar.app.ui.vm.yard.YardCarEditViewModel
import com.rentacar.app.ui.vm.yard.EditableCarImage

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
    
    // Image picker launcher - supports multiple images
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia()
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
                                        // PickMultipleVisualMedia: launch with PickVisualMediaRequest to filter to images only
                                        imagePickerLauncher.launch(
                                            PickVisualMediaRequest(
                                                ActivityResultContracts.PickVisualMedia.ImageOnly
                                            )
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
                    
                    // Brand
                    OutlinedTextField(
                        value = uiState.brand,
                        onValueChange = { viewModel.onBrandChanged(it) },
                        label = { Text("יצרן") },
                        leadingIcon = {
                            Icon(Icons.Filled.DirectionsCar, contentDescription = null)
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Model
                    OutlinedTextField(
                        value = uiState.model,
                        onValueChange = { viewModel.onModelChanged(it) },
                        label = { Text("מודל") },
                        leadingIcon = {
                            Icon(Icons.Filled.DirectionsCar, contentDescription = null)
                        },
                        modifier = Modifier.fillMaxWidth()
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
            
            // Customer Details Section (for backward compatibility with CarSale)
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
    
    // Show error Snackbar
    uiState.errorMessage?.let { errorMsg ->
        LaunchedEffect(errorMsg) {
            // Snackbar will be shown via Scaffold's snackbarHostState if needed
        }
    }
}

