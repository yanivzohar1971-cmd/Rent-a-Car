package com.rentacar.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class IsraeliLicensePlateFormattingTest {

    @Test
    fun emptyAndPartial_noHyphens() {
        assertEquals("", IsraeliLicensePlateFormatting.formatDisplay(""))
        assertEquals("1", IsraeliLicensePlateFormatting.formatDisplay("1"))
        assertEquals("12345", IsraeliLicensePlateFormatting.formatDisplay("12345"))
    }

    @Test
    fun sixDigits() {
        assertEquals("12-34-56", IsraeliLicensePlateFormatting.formatDisplay("123456"))
    }

    @Test
    fun sevenDigits() {
        assertEquals("12-345-67", IsraeliLicensePlateFormatting.formatDisplay("1234567"))
    }

    @Test
    fun eightDigits() {
        assertEquals("123-45-678", IsraeliLicensePlateFormatting.formatDisplay("12345678"))
        assertEquals("750-62-834", IsraeliLicensePlateFormatting.formatDisplay("75062834"))
    }

    @Test
    fun nineDigits() {
        // Pattern XXX-XXX-XXX
        assertEquals("123-456-789", IsraeliLicensePlateFormatting.formatDisplay("123456789"))
        assertEquals("123-123-123", IsraeliLicensePlateFormatting.formatDisplay("123123123"))
    }

    @Test
    fun formatterDoesNotAlterCallerRawValue() {
        val raw = "75062834"
        IsraeliLicensePlateFormatting.formatDisplay(raw)
        assertEquals("75062834", raw)
    }
}
