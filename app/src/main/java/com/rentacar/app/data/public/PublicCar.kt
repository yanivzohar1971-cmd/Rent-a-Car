package com.rentacar.app.data.public

/**
 * Public-facing car listing data model for buyer portal
 * Only contains safe, buyer-facing fields (no internal costs, margins, notes)
 */
data class PublicCar(
    val id: String = "",
    val ownerUid: String = "",
    val brand: String = "",
    val model: String = "",
    val year: Int? = null,
    val price: Double? = null,
    val mileageKm: Int? = null,
    val gearType: String? = null, // "אוטומטי", "ידני", etc. - mapped from gearboxType
    val mainImageUrl: String? = null,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
    val isPublished: Boolean = true,
    // Additional buyer-facing fields
    val city: String? = null, // Legacy field - prefer cityNameHe
    val fuelType: String? = null,
    val bodyType: String? = null,
    val imageUrls: List<String> = emptyList(), // All image URLs for gallery
    // Location fields (Yad2-style hierarchical location)
    val countryCode: String? = null,
    val regionId: String? = null,
    val cityId: String? = null,
    val neighborhoodId: String? = null,
    val regionNameHe: String? = null,
    val cityNameHe: String? = null,
    val neighborhoodNameHe: String? = null
) {
    /**
     * Convert to Firestore Map for saving
     */
    fun toFirestoreMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "ownerUid" to ownerUid,
            "brand" to brand,
            "model" to model,
            "year" to year,
            "price" to price,
            "mileageKm" to mileageKm,
            "gearType" to gearType,
            "mainImageUrl" to mainImageUrl,
            "createdAt" to createdAt,
            "updatedAt" to updatedAt,
            "isPublished" to isPublished,
            "city" to city, // Legacy - keep for backward compatibility
            "fuelType" to fuelType,
            "bodyType" to bodyType,
            "imageUrls" to imageUrls,
            // Location fields
            "countryCode" to countryCode,
            "regionId" to regionId,
            "cityId" to cityId,
            "neighborhoodId" to neighborhoodId,
            "regionNameHe" to regionNameHe,
            "cityNameHe" to cityNameHe,
            "neighborhoodNameHe" to neighborhoodNameHe
        )
    }

    companion object {
        /**
         * Create from Firestore document
         */
        fun fromFirestoreMap(id: String, data: Map<String, Any?>): PublicCar {
            return PublicCar(
                id = id,
                ownerUid = data["ownerUid"] as? String ?: "",
                brand = data["brand"] as? String ?: "",
                model = data["model"] as? String ?: "",
                year = (data["year"] as? Number)?.toInt(),
                price = (data["price"] as? Number)?.toDouble(),
                mileageKm = (data["mileageKm"] as? Number)?.toInt(),
                gearType = data["gearType"] as? String,
                mainImageUrl = data["mainImageUrl"] as? String,
                createdAt = (data["createdAt"] as? Number)?.toLong() ?: 0L,
                updatedAt = (data["updatedAt"] as? Number)?.toLong() ?: 0L,
                isPublished = data["isPublished"] as? Boolean ?: true,
                city = data["city"] as? String, // Legacy
                fuelType = data["fuelType"] as? String,
                bodyType = data["bodyType"] as? String,
                imageUrls = (data["imageUrls"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
                // Location fields
                countryCode = data["countryCode"] as? String,
                regionId = data["regionId"] as? String,
                cityId = data["cityId"] as? String,
                neighborhoodId = data["neighborhoodId"] as? String,
                regionNameHe = data["regionNameHe"] as? String,
                cityNameHe = data["cityNameHe"] as? String,
                neighborhoodNameHe = data["neighborhoodNameHe"] as? String
            )
        }
    }
}

