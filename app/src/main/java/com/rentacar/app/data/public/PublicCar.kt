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
    val city: String? = null,
    val fuelType: String? = null,
    val bodyType: String? = null,
    val imageUrls: List<String> = emptyList() // All image URLs for gallery
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
            "city" to city,
            "fuelType" to fuelType,
            "bodyType" to bodyType,
            "imageUrls" to imageUrls
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
                city = data["city"] as? String,
                fuelType = data["fuelType"] as? String,
                bodyType = data["bodyType"] as? String,
                imageUrls = (data["imageUrls"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
            )
        }
    }
}

