package com.rentacar.app.ui.vm.yard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.data.yard.YardProfile
import com.rentacar.app.data.yard.YardProfileRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.util.Log

/**
 * ViewModel for YardProfileScreen
 */
class YardProfileViewModel(
    private val repository: YardProfileRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(YardProfileUiState())
    val uiState: StateFlow<YardProfileUiState> = _uiState.asStateFlow()
    
    init {
        loadProfile()
    }
    
    private fun loadProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val userId = CurrentUserProvider.requireCurrentUid()
                val profile = repository.getYardProfileOnce(userId)
                
                if (profile != null) {
                    // Load existing profile
                    _uiState.value = _uiState.value.copy(
                        displayName = profile.displayName,
                        legalName = profile.legalName ?: "",
                        registrationNumber = profile.registrationNumber ?: "",
                        phone = profile.phone,
                        secondaryPhone = profile.secondaryPhone ?: "",
                        email = profile.email ?: "",
                        website = profile.website ?: "",
                        contactPersonName = profile.contactPersonName ?: "",
                        city = profile.city,
                        street = profile.street,
                        houseNumber = profile.houseNumber ?: "",
                        zipCode = profile.zipCode ?: "",
                        openingHours = profile.openingHours ?: "",
                        usageValidUntilMillis = profile.usageValidUntil,
                        isLoading = false
                    )
                } else {
                    // No profile exists - start with empty defaults
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
            } catch (e: Exception) {
                Log.e("YardProfileViewModel", "Error loading profile", e)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "שגיאה בטעינת הפרטים: ${e.message}"
                )
            }
        }
    }
    
    // Field update handlers
    fun onDisplayNameChanged(value: String) {
        _uiState.value = _uiState.value.copy(
            displayName = value,
            displayNameError = false
        )
    }
    
    fun onLegalNameChanged(value: String) {
        _uiState.value = _uiState.value.copy(legalName = value)
    }
    
    fun onRegistrationNumberChanged(value: String) {
        _uiState.value = _uiState.value.copy(registrationNumber = value)
    }
    
    fun onPhoneChanged(value: String) {
        _uiState.value = _uiState.value.copy(
            phone = value,
            phoneError = false
        )
    }
    
    fun onSecondaryPhoneChanged(value: String) {
        _uiState.value = _uiState.value.copy(secondaryPhone = value)
    }
    
    fun onEmailChanged(value: String) {
        _uiState.value = _uiState.value.copy(email = value)
    }
    
    fun onWebsiteChanged(value: String) {
        _uiState.value = _uiState.value.copy(website = value)
    }
    
    fun onContactPersonNameChanged(value: String) {
        _uiState.value = _uiState.value.copy(contactPersonName = value)
    }
    
    fun onCityChanged(value: String) {
        _uiState.value = _uiState.value.copy(
            city = value,
            cityError = false
        )
    }
    
    fun onStreetChanged(value: String) {
        _uiState.value = _uiState.value.copy(
            street = value,
            streetError = false
        )
    }
    
    fun onHouseNumberChanged(value: String) {
        _uiState.value = _uiState.value.copy(houseNumber = value)
    }
    
    fun onZipCodeChanged(value: String) {
        _uiState.value = _uiState.value.copy(zipCode = value)
    }
    
    fun onOpeningHoursChanged(value: String) {
        _uiState.value = _uiState.value.copy(openingHours = value)
    }
    
    fun onUsageValidUntilChanged(millis: Long?) {
        _uiState.value = _uiState.value.copy(usageValidUntilMillis = millis)
    }
    
    fun onSaveClicked() {
        saveProfile()
    }
    
    fun onErrorMessageShown() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
    
    fun onSaveSuccessHandled() {
        _uiState.value = _uiState.value.copy(saveSuccess = false)
    }
    
    private fun saveProfile() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isSaving = true,
                errorMessage = null,
                saveSuccess = false,
                attemptedSave = true
            )
            
            try {
                // Validate required fields
                val errors = validate()
                if (errors.isNotEmpty()) {
                    _uiState.value = _uiState.value.copy(
                        isSaving = false,
                        hasValidationErrors = true,
                        displayNameError = errors.containsKey("displayName"),
                        phoneError = errors.containsKey("phone"),
                        cityError = errors.containsKey("city"),
                        streetError = errors.containsKey("street")
                    )
                    return@launch
                }
                
                // Build YardProfile from UI state
                val profile = YardProfile(
                    displayName = _uiState.value.displayName.trim(),
                    legalName = _uiState.value.legalName.takeIf { it.isNotBlank() },
                    registrationNumber = _uiState.value.registrationNumber.takeIf { it.isNotBlank() },
                    phone = _uiState.value.phone.trim(),
                    secondaryPhone = _uiState.value.secondaryPhone.takeIf { it.isNotBlank() },
                    email = _uiState.value.email.takeIf { it.isNotBlank() },
                    website = _uiState.value.website.takeIf { it.isNotBlank() },
                    contactPersonName = _uiState.value.contactPersonName.takeIf { it.isNotBlank() },
                    city = _uiState.value.city.trim(),
                    street = _uiState.value.street.trim(),
                    houseNumber = _uiState.value.houseNumber.takeIf { it.isNotBlank() },
                    zipCode = _uiState.value.zipCode.takeIf { it.isNotBlank() },
                    openingHours = _uiState.value.openingHours.takeIf { it.isNotBlank() },
                    usageValidUntil = _uiState.value.usageValidUntilMillis,
                    isActive = true
                )
                
                val userId = CurrentUserProvider.requireCurrentUid()
                val result = repository.saveYardProfile(userId, profile)
                
                result.fold(
                    onSuccess = {
                        _uiState.value = _uiState.value.copy(
                            isSaving = false,
                            saveSuccess = true,
                            hasValidationErrors = false
                        )
                    },
                    onFailure = { e ->
                        Log.e("YardProfileViewModel", "Error saving profile", e)
                        _uiState.value = _uiState.value.copy(
                            isSaving = false,
                            errorMessage = "שגיאה בשמירת הפרטים: ${e.message}"
                        )
                    }
                )
            } catch (e: Exception) {
                Log.e("YardProfileViewModel", "Error saving profile", e)
                _uiState.value = _uiState.value.copy(
                    isSaving = false,
                    errorMessage = "שגיאה בשמירת הפרטים: ${e.message}"
                )
            }
        }
    }
    
    private fun validate(): Map<String, String> {
        val errors = mutableMapOf<String, String>()
        val state = _uiState.value
        
        if (state.displayName.isBlank()) {
            errors["displayName"] = "שדה חובה"
        }
        
        if (state.phone.isBlank()) {
            errors["phone"] = "שדה חובה"
        }
        
        if (state.city.isBlank()) {
            errors["city"] = "שדה חובה"
        }
        
        if (state.street.isBlank()) {
            errors["street"] = "שדה חובה"
        }
        
        return errors
    }
}

