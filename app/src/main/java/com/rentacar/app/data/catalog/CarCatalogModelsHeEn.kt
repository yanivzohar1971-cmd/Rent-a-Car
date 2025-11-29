package com.rentacar.app.data.catalog

/**
 * Data classes for parsing car_catalog_models_he_en.json
 */
data class BrandModelsHeEn(
    val brandEn: String,
    val brandHe: String,
    val models: List<ModelHeEn>
)

data class ModelHeEn(
    val modelEn: String,
    val modelHe: String
)

