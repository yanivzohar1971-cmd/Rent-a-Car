package com.rentacar.app.ui.vm.yard

/**
 * UI state for YardProfileScreen
 */
data class YardProfileUiState(
    // Form fields
    val displayName: String = "",
    val legalName: String = "",
    val registrationNumber: String = "",
    val phone: String = "",
    val secondaryPhone: String = "",
    val email: String = "",
    val website: String = "",
    val contactPersonName: String = "",
    val city: String = "",
    val street: String = "",
    val houseNumber: String = "",
    val zipCode: String = "",
    val openingHours: String = "",
    val usageValidUntilMillis: Long? = null, // timestamp in milliseconds
    
    // UI state
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val saveSuccess: Boolean = false,
    
    // Validation flags
    val hasValidationErrors: Boolean = false,
    val displayNameError: Boolean = false,
    val phoneError: Boolean = false,
    val cityError: Boolean = false,
    val streetError: Boolean = false,
    val attemptedSave: Boolean = false // Only show errors after user attempts to save
)

