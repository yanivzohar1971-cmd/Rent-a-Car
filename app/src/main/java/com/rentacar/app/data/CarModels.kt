package com.rentacar.app.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * Publication status for cars in yard inventory
 */
enum class CarPublicationStatus(val value: String, val displayName: String) {
    DRAFT("DRAFT", "טיוטה"),
    PUBLISHED("PUBLISHED", "מפורסם"),
    HIDDEN("HIDDEN", "מוסתר");
    
    companion object {
        fun fromString(value: String?): CarPublicationStatus {
            return when (value) {
                DRAFT.value -> DRAFT
                PUBLISHED.value -> PUBLISHED
                HIDDEN.value -> HIDDEN
                else -> PUBLISHED // Default for backward compatibility
            }
        }
    }
}

/**
 * Represents a car image stored in Firebase Storage
 */
data class CarImage(
    val id: String,
    val originalUrl: String,
    val thumbUrl: String? = null,
    val order: Int = 0
) {
    companion object {
        private val gson = Gson()
        
        /**
         * Serialize list of CarImage to JSON string
         */
        fun listToJson(images: List<CarImage>): String {
            return if (images.isEmpty()) "" else gson.toJson(images)
        }
        
        /**
         * Deserialize JSON string to list of CarImage
         */
        fun listFromJson(json: String?): List<CarImage> {
            if (json.isNullOrBlank()) return emptyList()
            return try {
                val type = object : TypeToken<List<CarImage>>() {}.type
                gson.fromJson(json, type) ?: emptyList()
            } catch (e: Exception) {
                android.util.Log.e("CarImage", "Error parsing images JSON", e)
                emptyList()
            }
        }
    }
}

/**
 * Role context for car listings (who is creating/managing the listing)
 */
enum class RoleContext {
    BUYER,
    SELLER,
    AGENT,
    YARD
}

/**
 * Type of sale owner
 */
enum class SaleOwnerType {
    YARD_OWNED,
    PRIVATE_SELLER,
    COMPANY,
    LEASING,
    RENTAL
}

/**
 * Fuel type for vehicles
 */
enum class FuelType {
    PETROL,
    DIESEL,
    HYBRID,
    EV,
    OTHER
}

/**
 * Gearbox/transmission type
 */
enum class GearboxType {
    AT,   // Automatic
    MT,   // Manual
    CVT,
    DCT,
    AMT,
    OTHER
}

/**
 * Body type for vehicles
 */
enum class BodyType {
    SEDAN,
    HATCHBACK,
    SUV,
    COUPE,
    WAGON,
    VAN,
    PICKUP,
    OTHER
}

