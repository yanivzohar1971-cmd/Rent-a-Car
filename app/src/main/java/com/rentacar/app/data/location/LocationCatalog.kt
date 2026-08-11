package com.rentacar.app.data.location

/**
 * Data classes for parsing location_catalog.v1.json
 * Represents a hierarchical location structure: Country -> Region -> City -> Neighborhood
 */
data class LocationCatalog(
    val countryCode: String,
    val regions: List<Region>
)

data class Region(
    val id: String,
    val labelHe: String,
    val labelEn: String,
    val cities: List<City>
)

data class City(
    val id: String,
    val labelHe: String,
    val labelEn: String,
    val neighborhoods: List<Neighborhood>
)

data class Neighborhood(
    val id: String,
    val labelHe: String,
    val labelEn: String
)

