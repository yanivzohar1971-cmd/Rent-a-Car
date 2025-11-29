package com.rentacar.app.ui.vm.yard

import android.net.Uri
import com.rentacar.app.data.CarImage
import com.rentacar.app.data.CarPublicationStatus

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
    
    // UI state
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val validationErrors: Map<String, String> = emptyMap(),
    val saveCompleted: Boolean = false
)

