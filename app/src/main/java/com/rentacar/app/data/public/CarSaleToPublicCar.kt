package com.rentacar.app.data.public

import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarImage

/**
 * Extension function to convert CarSale (internal YARD model) to PublicCar (buyer-facing)
 * Only includes safe, buyer-facing fields
 */
fun CarSale.toPublicCar(ownerUid: String): PublicCar {
    // Extract all image URLs from imagesJson
    val images: List<CarImage> = imagesJson?.let { json ->
        try {
            CarImage.listFromJson(json)
        } catch (e: Exception) {
            android.util.Log.e("CarSaleToPublicCar", "Error parsing imagesJson", e)
            emptyList()
        }
    } ?: emptyList()

    val imageUrls: List<String> = images
        .mapNotNull { it.originalUrl }
        .filter { it.isNotBlank() }

    val firstImageUrl: String? = imageUrls.firstOrNull()

    // Map gearboxType to Hebrew display string
    val gearTypeHebrew = when (gearboxType) {
        "AT" -> "אוטומטי"
        "MT" -> "ידני"
        "CVT" -> "CVT"
        "DCT" -> "DCT"
        "AMT" -> "רובוטי"
        else -> gearboxType // Keep original if not recognized
    }

    val now = System.currentTimeMillis()
    
    return PublicCar(
        id = id.toString(),
        ownerUid = ownerUid,
        brand = brand ?: "",
        model = model ?: "",
        year = year,
        price = salePrice.takeIf { it > 0 }, // Only include if > 0
        mileageKm = mileageKm,
        gearType = gearTypeHebrew,
        mainImageUrl = firstImageUrl,
        createdAt = createdAt ?: now,
        updatedAt = now,
        isPublished = publicationStatus == "PUBLISHED",
        city = null, // TODO: Add city field to CarSale if needed
        fuelType = fuelType,
        bodyType = bodyType,
        imageUrls = imageUrls
    )
}

