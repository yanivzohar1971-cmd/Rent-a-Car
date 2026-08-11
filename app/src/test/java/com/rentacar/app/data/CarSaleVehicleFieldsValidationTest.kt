package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CarSaleVehicleFieldsValidationTest {

    @Test
    fun licensePlate_empty_valid() {
        assertEquals(
            CarSaleVehicleFieldsValidation.ValidationResult.Ok,
            CarSaleVehicleFieldsValidation.validateLicensePlate("")
        )
    }

    @Test
    fun licensePlate_fiveDigits_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateLicensePlate("12345")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun licensePlate_sixToNine_valid() {
        listOf("123456", "1234567", "12345678", "123456789").forEach { value ->
            assertEquals(
                "expected valid for $value",
                CarSaleVehicleFieldsValidation.ValidationResult.Ok,
                CarSaleVehicleFieldsValidation.validateLicensePlate(value)
            )
        }
    }

    @Test
    fun licensePlate_tenDigits_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateLicensePlate("1234567890")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun licensePlate_letters_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateLicensePlate("12345A")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun licensePlate_normalizeFiltersNonDigitsAndCapsLength() {
        assertEquals("123456789", CarSaleVehicleFieldsValidation.normalizeLicensePlate("12AB3456789X0"))
    }

    @Test
    fun vehicleYear_empty_valid() {
        assertEquals(
            CarSaleVehicleFieldsValidation.ValidationResult.Ok,
            CarSaleVehicleFieldsValidation.validateVehicleYear("")
        )
    }

    @Test
    fun vehicleYear_threeDigits_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateVehicleYear("999")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun vehicleYear_fourDigits_validIncludingEdgeYears() {
        listOf("1900", "1967", "2026", "9999").forEach { value ->
            assertEquals(
                CarSaleVehicleFieldsValidation.ValidationResult.Ok,
                CarSaleVehicleFieldsValidation.validateVehicleYear(value)
            )
        }
    }

    @Test
    fun vehicleYear_fiveDigits_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateVehicleYear("20266")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun vehicleYear_lettersOrSeparators_invalid() {
        assertTrue(
            CarSaleVehicleFieldsValidation.validateVehicleYear("20A6")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
        assertTrue(
            CarSaleVehicleFieldsValidation.validateVehicleYear("20-26")
                is CarSaleVehicleFieldsValidation.ValidationResult.Error
        )
    }

    @Test
    fun vehicleYear_persistenceConversion() {
        assertEquals(null, CarSaleVehicleFieldsValidation.vehicleYearForPersistence(""))
        assertEquals(2020, CarSaleVehicleFieldsValidation.vehicleYearForPersistence("2020"))
        assertEquals(null, CarSaleVehicleFieldsValidation.licensePlateForPersistence(""))
        assertEquals("12345678", CarSaleVehicleFieldsValidation.licensePlateForPersistence("12345678"))
    }
}
