package com.rentacar.app.ui.vm.yard

/**
 * Filter model for Yard Fleet Screen
 * Used to filter cars by various criteria
 */
data class YardCarFilter(
    val status: YardCarStatusFilter = YardCarStatusFilter.ALL,
    val transmission: TransmissionFilter = TransmissionFilter.ANY,
    val fuelType: FuelTypeFilter = FuelTypeFilter.ANY,
    val minYear: Int? = null,
    val maxYear: Int? = null,
    val minPrice: Int? = null,
    val maxPrice: Int? = null,
    val query: String = ""
)

/**
 * Status filter options for yard cars
 */
enum class YardCarStatusFilter {
    ALL,
    ACTIVE,   // Maps to PUBLISHED status (visible/available cars)
    RESERVED, // Reserved for future use (not yet implemented in CarSale)
    SOLD,     // Sold cars (not yet implemented in CarSale)
    DRAFT     // Draft cars (not published yet)
}

/**
 * Transmission filter options
 * Note: Transmission field is not yet in CarSale entity, but filter is ready for future
 */
enum class TransmissionFilter {
    ANY,
    AUTOMATIC,
    MANUAL
}

/**
 * Fuel type filter options
 * Note: Fuel type field is not yet in CarSale entity, but filter is ready for future
 */
enum class FuelTypeFilter {
    ANY,
    PETROL,
    DIESEL,
    HYBRID,
    ELECTRIC
}

