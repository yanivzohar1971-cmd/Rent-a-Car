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
import com.rentacar.app.data.auth.CurrentUserProvider
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
    savedStateHandle: SavedStateHandle? = null
) : ViewModel() {
    
    private val carId = savedStateHandle?.get<Long>("carId")
    
    private val _uiState = MutableStateFlow(YardCarEditUiState())
    val uiState: StateFlow<YardCarEditUiState> = _uiState.asStateFlow()
    
    init {
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
                        isLoading = false
                    )
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
    
    // Intent handlers
    fun onBrandChanged(value: String) {
        _uiState.value = _uiState.value.copy(brand = value)
    }
    
    fun onModelChanged(value: String) {
        _uiState.value = _uiState.value.copy(model = value)
    }
    
    fun onYearChanged(value: String) {
        _uiState.value = _uiState.value.copy(year = value)
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
        val newImages = uris.mapIndexed { index, uri ->
            EditableCarImage(
                id = java.util.UUID.randomUUID().toString(),
                isExisting = false,
                remoteUrl = null,
                localUri = uri.toString(),
                order = _uiState.value.images.size + index
            )
        }
        _uiState.value = _uiState.value.copy(
            images = _uiState.value.images + newImages
        )
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
                    vinLastDigits = _uiState.value.vinLastDigits.takeIf { it.isNotBlank() }
                )
                
                // Save car first to get ID (if new)
                val savedId = if (carId == null) {
                    repo.upsert(carSale)
                } else {
                    carId
                }
                
                // Upload new images
                val imagesToUpload = _uiState.value.images
                    .filter { !it.isExisting && it.localUri != null }
                    .map { Uri.parse(it.localUri) }
                
                val uploadedImages = if (imagesToUpload.isNotEmpty()) {
                    CarImageStorage.uploadImages(imagesToUpload, savedId)
                } else {
                    emptyList()
                }
                
                // Combine existing and new images
                val existingImages = _uiState.value.images
                    .filter { it.isExisting && it.remoteUrl != null }
                    .map { img ->
                        CarImage(
                            id = img.id,
                            originalUrl = img.remoteUrl!!,
                            thumbUrl = null,
                            order = img.order
                        )
                    }
                
                val allImages = (existingImages + uploadedImages).sortedBy { it.order }
                
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

