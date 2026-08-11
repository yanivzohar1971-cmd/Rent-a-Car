package com.rentacar.app.ui.components

/**
 * Display-only Israeli license-plate grouping.
 * Operates on raw digit strings; never inserts hyphens into persisted values.
 */
object IsraeliLicensePlateFormatting {

    fun formatDisplay(digits: String): String {
        require(digits.all { it.isDigit() }) { "formatDisplay expects digits only" }
        return when (digits.length) {
            6 -> "${digits.substring(0, 2)}-${digits.substring(2, 4)}-${digits.substring(4, 6)}"
            7 -> "${digits.substring(0, 2)}-${digits.substring(2, 5)}-${digits.substring(5, 7)}"
            8 -> "${digits.substring(0, 3)}-${digits.substring(3, 5)}-${digits.substring(5, 8)}"
            9 -> "${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6, 9)}"
            else -> digits
        }
    }

    /** Original indices after which a visual hyphen is inserted (for lengths 6–9). */
    fun separatorAfterIndices(digitCount: Int): List<Int> =
        when (digitCount) {
            6 -> listOf(2, 4)
            7 -> listOf(2, 5)
            8 -> listOf(3, 5)
            9 -> listOf(3, 6)
            else -> emptyList()
        }
}
