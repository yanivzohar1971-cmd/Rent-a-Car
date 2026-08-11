package com.rentacar.app.data

/**
 * Validation for optional Sale-form vehicle fields (license plate + vehicle year).
 * Empty values are always valid.
 */
object CarSaleVehicleFieldsValidation {

    sealed class ValidationResult {
        data object Ok : ValidationResult()
        data class Error(val messageHe: String) : ValidationResult()
    }

    fun normalizeLicensePlate(raw: String): String =
        raw.filter { it.isDigit() }.take(9)

    fun normalizeVehicleYearInput(raw: String): String =
        raw.filter { it.isDigit() }.take(4)

    /**
     * Empty or 6–9 digits only.
     */
    fun validateLicensePlate(value: String): ValidationResult {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return ValidationResult.Ok
        if (!trimmed.matches(Regex("\\d{6,9}"))) {
            return ValidationResult.Error("מספר רישוי חייב להכיל 6 עד 9 ספרות")
        }
        return ValidationResult.Ok
    }

    /**
     * Empty or exactly 4 digits. No year-range business rules.
     */
    fun validateVehicleYear(value: String): ValidationResult {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return ValidationResult.Ok
        if (!trimmed.matches(Regex("\\d{4}"))) {
            return ValidationResult.Error("שנתון הרכב חייב להכיל 4 ספרות")
        }
        return ValidationResult.Ok
    }

    fun licensePlateForPersistence(uiValue: String): String? {
        val normalized = normalizeLicensePlate(uiValue)
        return normalized.ifBlank { null }
    }

    fun vehicleYearForPersistence(uiValue: String): Int? {
        val normalized = normalizeVehicleYearInput(uiValue)
        if (normalized.isBlank()) return null
        return normalized.toIntOrNull()
    }
}
