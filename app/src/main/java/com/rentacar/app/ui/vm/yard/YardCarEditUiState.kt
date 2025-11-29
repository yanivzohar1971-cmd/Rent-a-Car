package com.rentacar.app.ui.vm.yard

import android.net.Uri
import com.rentacar.app.data.CarImage
import com.rentacar.app.data.CarPublicationStatus
import com.rentacar.app.data.SaleOwnerType
import com.rentacar.app.data.FuelType
import com.rentacar.app.data.GearboxType
import com.rentacar.app.data.BodyType

/**
 * UI wrapper for car images during editing
 */
data class EditableCarImage(
    val id: String,
    val isExisting: Boolean,
    val remoteUrl: String?, // existing storage URL
    val localUri: String?,  // new image selected from device (stringified URI)
    val order: Int
)

/**
 * UI state for YardCarEditScreen (Yard-only car edit screen)
 */
data class YardCarEditUiState(
    // Core car fields
    val brand: String = "",
    val model: String = "",
    val year: String = "",
    val price: String = "",
    val mileageKm: String = "",
    val carTypeName: String = "",
    
    // Customer fields (for existing CarSale model compatibility)
    val firstName: String = "",
    val lastName: String = "",
    val phone: String = "",
    
    // Sale fields
    val saleDateMillis: Long = System.currentTimeMillis(),
    val commissionPrice: String = "",
    val notes: String = "",
    
    // Publication status
    val publicationStatus: CarPublicationStatus = CarPublicationStatus.DRAFT,
    
    // Images
    val images: List<EditableCarImage> = emptyList(),
    
    // CarSale V2 fields
    val saleOwnerType: SaleOwnerType? = null,
    val fuelType: FuelType? = null,
    val gearboxType: GearboxType? = null,
    val gearCount: String = "",
    val handCount: String = "",
    val engineDisplacementCc: String = "",
    val enginePowerHp: String = "",
    val bodyType: BodyType? = null,
    val ac: Boolean = false,
    val color: String = "",
    val ownershipDetails: String = "",
    val licensePlatePartial: String = "",
    val vinLastDigits: String = "",
    // Catalog linkage
    val brandId: Long? = null,
    val modelFamilyId: Long? = null,
    
    // UI state
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val validationErrors: Map<String, String> = emptyMap(),
    val saveCompleted: Boolean = false
)

