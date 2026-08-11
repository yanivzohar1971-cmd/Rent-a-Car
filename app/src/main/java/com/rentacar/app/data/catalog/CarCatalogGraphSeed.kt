package com.rentacar.app.data.catalog

import com.google.gson.annotations.SerializedName

/**
 * Root data class for car catalog graph JSON seed file
 */
data class CarCatalogGraphSeed(
    val version: Int,
    val info: InfoNode? = null,
    val brands: List<BrandNode> = emptyList(),
    val models: List<ModelNode> = emptyList(),
    val generations: List<GenerationNode> = emptyList(),
    val engines: List<EngineNode> = emptyList(),
    val transmissions: List<TransmissionNode> = emptyList(),
    val variants: List<VariantNode> = emptyList(),
    val markets: List<MarketNode> = emptyList(),
    val variantMarkets: List<VariantMarketNode> = emptyList()
)

data class InfoNode(
    val description: String? = null,
    val sinceYear: Int? = null,
    val marketsFocus: List<String> = emptyList()
)

data class BrandNode(
    val id: String,
    @SerializedName("nameEn")
    val nameEn: String,
    @SerializedName("nameHe")
    val nameHe: String,
    val countryCode: String? = null,
    val isActive: Boolean = true
)

data class ModelNode(
    val id: String,
    val brandId: String,
    @SerializedName("nameEn")
    val nameEn: String,
    @SerializedName("nameHe")
    val nameHe: String,
    val aliases: List<String> = emptyList(),
    val segments: List<String> = emptyList()
)

data class GenerationNode(
    val id: String,
    val modelFamilyId: String,
    val yearsFrom: Int? = null,
    val yearsTo: Int? = null,
    val regionCodes: List<String> = emptyList(),
    val platformCode: String? = null
)

data class EngineNode(
    val id: String,
    val displacementCc: Int? = null,
    val powerHp: Int? = null,
    val fuelType: String? = null,
    val turbo: Boolean = false,
    val engineCode: String? = null
)

data class TransmissionNode(
    val id: String,
    val type: String? = null,
    val gears: Int? = null,
    val notes: String? = null
)

data class VariantNode(
    val id: String,
    val generationId: String,
    val engineId: String? = null,
    val transmissionId: String? = null,
    val bodyType: String? = null,
    val trimLevel: String? = null,
    val yearFrom: Int? = null,
    val yearTo: Int? = null,
    val ac: Boolean = false,
    val displayName: String? = null
)

data class MarketNode(
    val id: String,
    @SerializedName("nameHe")
    val nameHe: String,
    @SerializedName("nameEn")
    val nameEn: String
)

data class VariantMarketNode(
    val variantId: String,
    val marketId: String
)

