package com.rentacar.app.ui.vm.yard

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarImage
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleRepository
import com.rentacar.app.data.RoleContext
import com.rentacar.app.data.SaleOwnerType
import com.rentacar.app.data.FuelType
import com.rentacar.app.data.GearboxType
import com.rentacar.app.data.BodyType
import com.rentacar.app.data.CarManufacturerEntity
import com.rentacar.app.data.CarModelEntity
import com.rentacar.app.data.CarVariantEntity
import com.rentacar.app.data.CarEngineEntity
import com.rentacar.app.data.CarTransmissionEntity
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.data.repo.CarCatalogRepository
import com.rentacar.app.data.storage.CarImageStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.first

/**
 * ViewModel for YardCarEditScreen - Yard-only car edit/add screen
 */
class YardCarEditViewModel(
    private val repo: CarSaleRepository,
    private val carCatalogRepository: CarCatalogRepository,
    savedStateHandle: SavedStateHandle? = null
) : ViewModel() {
    
    private val carId = savedStateHandle?.get<Long>("carId")
    
    private val _uiState = MutableStateFlow(YardCarEditUiState())
    val uiState: StateFlow<YardCarEditUiState> = _uiState.asStateFlow()
    
    // Catalog AutoComplete state
    private val _manufacturerQuery = MutableStateFlow("")
    val manufacturerQuery: StateFlow<String> = _manufacturerQuery.asStateFlow()
    
    private val _manufacturerSuggestions = MutableStateFlow<List<CarManufacturerEntity>>(emptyList())
    val manufacturerSuggestions: StateFlow<List<CarManufacturerEntity>> = _manufacturerSuggestions.asStateFlow()
    
    private val _selectedManufacturer: MutableStateFlow<CarManufacturerEntity?> = MutableStateFlow(null)
    val selectedManufacturer: StateFlow<CarManufacturerEntity?> = _selectedManufacturer.asStateFlow()
    
    private val _modelQuery = MutableStateFlow("")
    val modelQuery: StateFlow<String> = _modelQuery.asStateFlow()
    
    private val _modelSuggestions = MutableStateFlow<List<CarModelEntity>>(emptyList())
    val modelSuggestions: StateFlow<List<CarModelEntity>> = _modelSuggestions.asStateFlow()
    
    // Variant selection state
    private val _variantSuggestions = MutableStateFlow<List<CarVariantEntity>>(emptyList())
    val variantSuggestions: StateFlow<List<CarVariantEntity>> = _variantSuggestions.asStateFlow()
    
    private val _selectedVariant = MutableStateFlow<CarVariantEntity?>(null)
    val selectedVariant: StateFlow<CarVariantEntity?> = _selectedVariant.asStateFlow()
    
    init {
        // Seed catalog if empty
        viewModelScope.launch {
            try {
                carCatalogRepository.seedIfEmpty()
            } catch (e: Exception) {
                android.util.Log.e("YardCarEditViewModel", "Error seeding catalog", e)
            }
        }
        
        // Load existing car if editing
        if (carId != null) {
            loadCar(carId)
        } else {
            // New car - set defaults
            _uiState.value = _uiState.value.copy(
                publicationStatus = CarPublicationStatus.DRAFT,
                saleOwnerType = SaleOwnerType.YARD_OWNED // Default for new yard cars
            )
        }
    }
    
    private fun loadCar(id: Long) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val uid = CurrentUserProvider.requireCurrentUid()
                val cars = repo.listForUser(uid).first()
                val car = cars.firstOrNull { it.id == id }
                
                if (car != null) {
                    // Map CarSale to UI state
                    val images = CarImage.listFromJson(car.imagesJson)
                    _uiState.value = YardCarEditUiState(
                        brand = car.brand ?: "",
                        model = car.model ?: "",
                        year = car.year?.toString() ?: "",
                        price = car.salePrice.toInt().toString(),
                        mileageKm = car.mileageKm?.toString() ?: "",
                        carTypeName = car.carTypeName,
                        firstName = car.firstName,
                        lastName = car.lastName,
                        phone = car.phone,
                        saleDateMillis = car.saleDate,
                        commissionPrice = car.commissionPrice.toInt().toString(),
                        notes = car.notes ?: "",
                        publicationStatus = CarPublicationStatus.fromString(car.publicationStatus),
                        images = images.mapIndexed { index, img ->
                            EditableCarImage(
                                id = img.id,
                                isExisting = true,
                                remoteUrl = img.originalUrl,
                                localUri = null,
                                order = index
                            )
                        },
                        // CarSale V2 fields
                        saleOwnerType = car.saleOwnerType?.let { 
                            try { SaleOwnerType.valueOf(it) } catch (e: Exception) { null }
                        },
                        fuelType = car.fuelType?.let { 
                            try { FuelType.valueOf(it) } catch (e: Exception) { null }
                        },
                        gearboxType = car.gearboxType?.let { 
                            try { GearboxType.valueOf(it) } catch (e: Exception) { null }
                        },
                        gearCount = car.gearCount?.toString() ?: "",
                        handCount = car.handCount?.toString() ?: "",
                        engineDisplacementCc = car.engineDisplacementCc?.toString() ?: "",
                        enginePowerHp = car.enginePowerHp?.toString() ?: "",
                        bodyType = car.bodyType?.let { 
                            try { BodyType.valueOf(it) } catch (e: Exception) { null }
                        },
                        ac = car.ac ?: false,
                        color = car.color ?: "",
                        ownershipDetails = car.ownershipDetails ?: "",
                        licensePlatePartial = car.licensePlatePartial ?: "",
                        vinLastDigits = car.vinLastDigits ?: "",
                        brandId = car.brandId?.toLongOrNull(),
                        modelFamilyId = car.modelFamilyId?.toLongOrNull(),
                        isLoading = false
                    )
                    // Set manufacturer and model queries from loaded data
                    _manufacturerQuery.value = car.brand ?: ""
                    _modelQuery.value = car.model ?: ""
                    // TODO: If brandId/modelFamilyId exist, load and set selectedManufacturer accordingly
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = "רכב לא נמצא"
                    )
                }
            } catch (e: Exception) {
                android.util.Log.e("YardCarEditViewModel", "Error loading car", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת הרכב: ${e.message}"
                )
            }
        }
    }
    
    // Catalog-based AutoComplete handlers
    fun onManufacturerQueryChanged(query: String) {
        _manufacturerQuery.value = query
        viewModelScope.launch {
            _manufacturerSuggestions.value = carCatalogRepository.searchManufacturers(query)
        }
        // Also update uiState.brand (text)
        _uiState.value = _uiState.value.copy(brand = query, brandId = null)
    }
    
    fun onManufacturerSelected(item: CarManufacturerEntity) {
        _selectedManufacturer.value = item
        _manufacturerQuery.value = item.nameHe
        _uiState.value = _uiState.value.copy(
            brand = item.nameHe,
            brandId = item.id,
            // Clear model selection when manufacturer changes
            model = "",
            modelFamilyId = null
        )
        _modelQuery.value = ""
        _selectedVariant.value = null
        _variantSuggestions.value = emptyList()
        viewModelScope.launch {
            _modelSuggestions.value = carCatalogRepository.searchModels(item.id, query = "")
        }
    }
    
    fun onModelQueryChanged(query: String) {
        _modelQuery.value = query
        viewModelScope.launch {
            val manufacturerId = _selectedManufacturer.value?.id
            _modelSuggestions.value = if (manufacturerId != null) {
                carCatalogRepository.searchModels(manufacturerId, query)
            } else {
                emptyList()
            }
        }
        _uiState.value = _uiState.value.copy(model = query, modelFamilyId = null)
    }
    
    fun onModelSelected(item: CarModelEntity) {
        _modelQuery.value = item.nameHe
        _uiState.value = _uiState.value.copy(
            model = item.nameHe,
            modelFamilyId = item.id
        )
        _selectedVariant.value = null
        // Load variants for the selected manufacturer + model
        loadVariantsForCurrentSelection()
    }
    
    fun onYearChanged(value: String) {
        _uiState.value = _uiState.value.copy(year = value)
        // Reload variants when year changes (if manufacturer and model are selected)
        if (_selectedManufacturer.value != null && _uiState.value.modelFamilyId != null) {
            loadVariantsForCurrentSelection()
        }
    }
    
    // Variant loading and selection
    fun loadVariantsForCurrentSelection() {
        val ui = _uiState.value
        val manufacturerId = ui.brandId
        val modelId = ui.modelFamilyId
        if (manufacturerId == null || modelId == null) {
            _variantSuggestions.value = emptyList()
            _selectedVariant.value = null
            return
        }

        val year = ui.year.toIntOrNull()

        viewModelScope.launch {
            try {
                val variants = carCatalogRepository.findVariantsForModel(
                    manufacturerId = manufacturerId,
                    modelId = modelId,
                    year = year,
                    marketCode = "IL"
                )
                _variantSuggestions.value = variants
            } catch (e: Exception) {
                android.util.Log.e("YardCarEditViewModel", "Error loading variants", e)
                _variantSuggestions.value = emptyList()
            }
        }
    }

    fun onVariantSelected(variant: CarVariantEntity) {
        _selectedVariant.value = variant

        viewModelScope.launch {
            try {
                val engine = variant.engineId?.let { id ->
                    carCatalogRepository.getEngineById(id)
                }
                val transmission = variant.transmissionId?.let { id ->
                    carCatalogRepository.getTransmissionById(id)
                }

                _uiState.value = _uiState.value.copy(
                    // Keep existing brand/model as they are
                    bodyType = variant.bodyType?.let { bodyTypeFromString(it) } ?: _uiState.value.bodyType,
                    engineDisplacementCc = engine?.displacementCc?.toString() ?: _uiState.value.engineDisplacementCc,
                    enginePowerHp = engine?.powerHp?.toString() ?: _uiState.value.enginePowerHp,
                    fuelType = engine?.fuelType?.let { fuelTypeFromString(it) } ?: _uiState.value.fuelType,
                    gearboxType = transmission?.gearboxType?.let { gearboxTypeFromString(it) } ?: _uiState.value.gearboxType,
                    gearCount = transmission?.gearCount?.toString() ?: _uiState.value.gearCount
                )
            } catch (e: Exception) {
                android.util.Log.e("YardCarEditViewModel", "Error loading engine/transmission for variant", e)
            }
        }
    }

    // Helper functions to convert string codes to enums
    private fun fuelTypeFromString(value: String?): FuelType? {
        if (value == null) return null
        return try {
            FuelType.valueOf(value)
        } catch (e: Exception) {
            null
        }
    }

    private fun gearboxTypeFromString(value: String?): GearboxType? {
        if (value == null) return null
        return try {
            GearboxType.valueOf(value)
        } catch (e: Exception) {
            null
        }
    }

    private fun bodyTypeFromString(value: String?): BodyType? {
        if (value == null) return null
        return try {
            BodyType.valueOf(value)
        } catch (e: Exception) {
            null
        }
    }
    
    // Legacy handlers (kept for backward compatibility)
    fun onBrandChanged(value: String) {
        onManufacturerQueryChanged(value)
    }
    
    fun onModelChanged(value: String) {
        onModelQueryChanged(value)
    }
    
    fun onPriceChanged(value: String) {
        _uiState.value = _uiState.value.copy(price = value)
    }
    
    fun onMileageChanged(value: String) {
        _uiState.value = _uiState.value.copy(mileageKm = value)
    }
    
    fun onCarTypeChanged(value: String) {
        _uiState.value = _uiState.value.copy(carTypeName = value)
    }
    
    fun onFirstNameChanged(value: String) {
        _uiState.value = _uiState.value.copy(firstName = value)
    }
    
    fun onLastNameChanged(value: String) {
        _uiState.value = _uiState.value.copy(lastName = value)
    }
    
    fun onPhoneChanged(value: String) {
        _uiState.value = _uiState.value.copy(phone = value)
    }
    
    fun onNotesChanged(value: String) {
        _uiState.value = _uiState.value.copy(notes = value)
    }
    
    fun onPublicationStatusChanged(status: CarPublicationStatus) {
        _uiState.value = _uiState.value.copy(publicationStatus = status)
    }
    
    // CarSale V2 field handlers
    fun updateSaleOwnerType(saleOwnerType: SaleOwnerType?) {
        _uiState.value = _uiState.value.copy(saleOwnerType = saleOwnerType)
    }
    
    fun updateFuelType(fuelType: FuelType?) {
        _uiState.value = _uiState.value.copy(fuelType = fuelType)
    }
    
    fun updateGearboxType(gearboxType: GearboxType?) {
        _uiState.value = _uiState.value.copy(gearboxType = gearboxType)
    }
    
    fun updateGearCount(value: String) {
        _uiState.value = _uiState.value.copy(gearCount = value.filter { it.isDigit() })
    }
    
    fun updateHandCount(value: String) {
        _uiState.value = _uiState.value.copy(handCount = value.filter { it.isDigit() })
    }
    
    fun updateEngineDisplacementCc(value: String) {
        _uiState.value = _uiState.value.copy(engineDisplacementCc = value.filter { it.isDigit() })
    }
    
    fun updateEnginePowerHp(value: String) {
        _uiState.value = _uiState.value.copy(enginePowerHp = value.filter { it.isDigit() })
    }
    
    fun updateBodyType(bodyType: BodyType?) {
        _uiState.value = _uiState.value.copy(bodyType = bodyType)
    }
    
    fun updateAc(ac: Boolean) {
        _uiState.value = _uiState.value.copy(ac = ac)
    }
    
    fun updateColor(value: String) {
        _uiState.value = _uiState.value.copy(color = value)
    }
    
    fun updateOwnershipDetails(value: String) {
        _uiState.value = _uiState.value.copy(ownershipDetails = value)
    }
    
    fun updateLicensePlatePartial(value: String) {
        _uiState.value = _uiState.value.copy(licensePlatePartial = value)
    }
    
    fun updateVinLastDigits(value: String) {
        _uiState.value = _uiState.value.copy(vinLastDigits = value)
    }
    
    fun onAddImagesSelected(uris: List<Uri>) {
        // Get existing URIs
        val existingUris = _uiState.value.images
            .mapNotNull { it.localUri }
            .toSet()
        
        // Filter out duplicates
        val incoming = uris.map { it.toString() }
        val distinctNew = incoming
            .distinct()
            .filterNot { it in existingUris }
        
        // Check if duplicates were found
        val duplicatesCount = incoming.size - distinctNew.size
        if (duplicatesCount > 0) {
            val message = if (duplicatesCount == 1) {
                "התמונה הזו כבר נוספה לרכב"
            } else {
                "חלק מהתמונות כבר נוספו ונדלגו"
            }
            _uiState.value = _uiState.value.copy(errorMessage = message)
        }
        
        // Only add non-duplicate images
        val newImages = distinctNew.mapIndexed { index, uriString ->
            EditableCarImage(
                id = java.util.UUID.randomUUID().toString(),
                isExisting = false,
                remoteUrl = null,
                localUri = uriString,
                order = _uiState.value.images.size + index
            )
        }
        
        if (newImages.isNotEmpty()) {
            _uiState.value = _uiState.value.copy(
                images = _uiState.value.images + newImages
            )
        }
    }
    
    fun onErrorMessageShown() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
    
    fun onRemoveImage(imageId: String) {
        _uiState.value = _uiState.value.copy(
            images = _uiState.value.images.filter { it.id != imageId }
                .mapIndexed { index, img -> img.copy(order = index) }
        )
    }
    
    fun onSaveClicked() {
        saveCar()
    }
    
    private fun saveCar(onSuccess: (Long) -> Unit = {}) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isSaving = true,
                errorMessage = null,
                validationErrors = emptyMap()
            )
            
            try {
                // Validate
                val errors = validate()
                if (errors.isNotEmpty()) {
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        validationErrors = errors
                    )
                    return@launch
                }
                
                // TODO (Future): When publicationStatus is PUBLISHED, enforce required fields:
                // - brand, model, year, mileageKm, price, saleOwnerType must be non-null
                // - This validation should block publishing if required fields are missing
                // - For now, all fields are optional to maintain backward compatibility
                
                // Convert UI state to CarSale
                val year = _uiState.value.year.toIntOrNull()
                val price = _uiState.value.price.toIntOrNull() ?: 0
                val mileage = _uiState.value.mileageKm.toIntOrNull()
                
                // Build initial CarSale (without images - we'll update after upload)
                var carSale = CarSale(
                    id = carId ?: 0L,
                    firstName = _uiState.value.firstName,
                    lastName = _uiState.value.lastName,
                    phone = _uiState.value.phone,
                    carTypeName = _uiState.value.carTypeName.ifBlank { 
                        "${_uiState.value.brand} ${_uiState.value.model}".trim()
                    },
                    saleDate = _uiState.value.saleDateMillis,
                    salePrice = price.toDouble(),
                    commissionPrice = _uiState.value.commissionPrice.toIntOrNull()?.toDouble() ?: 0.0,
                    notes = _uiState.value.notes.takeIf { it.isNotBlank() },
                    brand = _uiState.value.brand.takeIf { it.isNotBlank() },
                    model = _uiState.value.model.takeIf { it.isNotBlank() },
                    year = year,
                    mileageKm = mileage,
                    publicationStatus = _uiState.value.publicationStatus.value,
                    imagesJson = null, // Will be set after image upload
                    // CarSale V2 fields
                    roleContext = RoleContext.YARD.name, // Always YARD for YardCarEdit flow
                    saleOwnerType = (_uiState.value.saleOwnerType ?: SaleOwnerType.YARD_OWNED).name,
                    fuelType = _uiState.value.fuelType?.name,
                    gearboxType = _uiState.value.gearboxType?.name,
                    gearCount = _uiState.value.gearCount.toIntOrNull(),
                    handCount = _uiState.value.handCount.toIntOrNull(),
                    engineDisplacementCc = _uiState.value.engineDisplacementCc.toIntOrNull(),
                    enginePowerHp = _uiState.value.enginePowerHp.toIntOrNull(),
                    bodyType = _uiState.value.bodyType?.name,
                    ac = _uiState.value.ac,
                    color = _uiState.value.color.takeIf { it.isNotBlank() },
                    ownershipDetails = _uiState.value.ownershipDetails.takeIf { it.isNotBlank() },
                    licensePlatePartial = _uiState.value.licensePlatePartial.takeIf { it.isNotBlank() },
                    vinLastDigits = _uiState.value.vinLastDigits.takeIf { it.isNotBlank() },
                    // Catalog linkage
                    brandId = _uiState.value.brandId?.toString(),
                    modelFamilyId = _uiState.value.modelFamilyId?.toString()
                )
                
                // Save car first to get ID (if new)
                val savedId = if (carId == null) {
                    repo.upsert(carSale)
                } else {
                    // Ensure we have the correct ID for updates
                    carSale.copy(id = carId).let { repo.upsert(it) }
                    carId
                }
                
                // Upload images using the new method that handles both existing and new images
                val userUid = CurrentUserProvider.requireCurrentUid()
                val imagesToProcess = _uiState.value.images
                    .filter { img ->
                        // Keep existing images that are not deleted, and new images with localUri
                        (img.isExisting && img.remoteUrl != null) || 
                        (!img.isExisting && img.localUri != null)
                    }
                
                val allImages = if (imagesToProcess.isNotEmpty()) {
                    CarImageStorage.uploadCarImages(userUid, savedId, imagesToProcess)
                } else {
                    emptyList()
                }
                
                // Update car with images
                carSale = carSale.copy(
                    id = savedId,
                    imagesJson = CarImage.listToJson(allImages)
                )
                
                repo.upsert(carSale)
                
                _uiState.value = _uiState.value.copy(
                    isSaving = false,
                    saveCompleted = true
                )
                
                onSuccess(savedId)
                
            } catch (e: Exception) {
                android.util.Log.e("YardCarEditViewModel", "Error saving car", e)
                _uiState.value = _uiState.value.copy(
                    isSaving = false,
                    errorMessage = "שגיאה בשמירת הרכב: ${e.message}"
                )
            }
        }
    }
    
    private fun validate(): Map<String, String> {
        val errors = mutableMapOf<String, String>()
        val state = _uiState.value
        
        // Customer fields are only required when selling for a customer (not YARD_OWNED)
        // TODO: Customer fields validation should only apply when saleOwnerType != YARD_OWNED
        if (state.saleOwnerType != SaleOwnerType.YARD_OWNED) {
            if (state.firstName.isBlank()) {
                errors["firstName"] = "שדה חובה"
            }
            if (state.lastName.isBlank()) {
                errors["lastName"] = "שדה חובה"
            }
            if (state.phone.isBlank()) {
                errors["phone"] = "שדה חובה"
            }
        }
        
        if (state.carTypeName.isBlank() && state.brand.isBlank() && state.model.isBlank()) {
            errors["carTypeName"] = "יש לציין סוג רכב או יצרן/מודל"
        }
        
        return errors
    }
}

