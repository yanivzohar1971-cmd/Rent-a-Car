package com.rentacar.app.data.storage

import android.net.Uri
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.rentacar.app.data.CarImage
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.ui.vm.yard.EditableCarImage
import kotlinx.coroutines.tasks.await
import java.util.UUID

/**
 * Helper for uploading car images to Firebase Storage
 */
object CarImageStorage {
    
    private val storage = FirebaseStorage.getInstance()
    
    /**
     * Get storage path for a car image
     * Pattern: users/{ownerUid}/cars/{carId}/images/{imageId}.jpg
     */
    private fun getImagePath(ownerUid: String, carId: Long, imageId: String): String {
        return "users/$ownerUid/cars/$carId/images/$imageId.jpg"
    }
    
    /**
     * Upload a local image URI to Firebase Storage
     * @param userUid The user UID (owner of the car)
     * @param localUri Local URI of the image to upload
     * @param carId The car ID
     * @param imageId The image ID (will generate UUID if not provided)
     * @return Download URL of the uploaded image
     */
    private suspend fun uploadImage(
        userUid: String,
        localUri: Uri,
        carId: Long,
        imageId: String = UUID.randomUUID().toString()
    ): String {
        val path = getImagePath(userUid, carId, imageId)
        val storageRef: StorageReference = storage.reference.child(path)
        
        return try {
            // Upload file and wait for completion
            storageRef.putFile(localUri).await()
            // Get download URL after upload completes
            val downloadUrl = storageRef.downloadUrl.await()
            downloadUrl.toString()
        } catch (e: Exception) {
            android.util.Log.e("CarImageStorage", "Error uploading image to path: $path", e)
            throw Exception("שגיאה בהעלאת תמונה: ${e.message}", e)
        }
    }
    
    /**
     * Upload car images from EditableCarImage list
     * Handles existing images (keeps them) and new images (uploads them)
     * @param userUid The user UID (owner of the car)
     * @param carId The car ID
     * @param images List of EditableCarImage (existing + new)
     * @return List of CarImage with download URLs, sorted by order
     */
    suspend fun uploadCarImages(
        userUid: String,
        carId: Long,
        images: List<EditableCarImage>
    ): List<CarImage> {
        val result = mutableListOf<CarImage>()
        
        for (editableImage in images.sortedBy { it.order }) {
            // Skip images marked for deletion (already filtered in ViewModel)
            
            if (editableImage.isExisting && editableImage.remoteUrl != null) {
                // Keep existing image as-is
                result.add(
                    CarImage(
                        id = editableImage.id,
                        originalUrl = editableImage.remoteUrl,
                        thumbUrl = null, // TODO: Generate thumbnails via Cloud Functions
                        order = editableImage.order
                    )
                )
            } else if (!editableImage.isExisting && editableImage.localUri != null) {
                // Upload new image
                try {
                    val localUri = Uri.parse(editableImage.localUri)
                    val imageId = editableImage.id.ifBlank { UUID.randomUUID().toString() }
                    val downloadUrl = uploadImage(userUid, localUri, carId, imageId)
                    
                    result.add(
                        CarImage(
                            id = imageId,
                            originalUrl = downloadUrl,
                            thumbUrl = null, // TODO: Generate thumbnails via Cloud Functions
                            order = editableImage.order
                        )
                    )
                } catch (e: Exception) {
                    android.util.Log.e("CarImageStorage", "Failed to upload image ${editableImage.id}", e)
                    throw Exception("שגיאה בהעלאת תמונה: ${e.message}", e)
                }
            }
        }
        
        return result.sortedBy { it.order }
    }
    
    /**
     * Upload multiple images (legacy method - kept for backward compatibility)
     * @return List of CarImage with download URLs
     */
    suspend fun uploadImages(
        localUris: List<Uri>,
        carId: Long
    ): List<CarImage> {
        val ownerUid = CurrentUserProvider.requireCurrentUid()
        return localUris.mapIndexed { index, uri ->
            val imageId = UUID.randomUUID().toString()
            val downloadUrl = uploadImage(ownerUid, uri, carId, imageId)
            CarImage(
                id = imageId,
                originalUrl = downloadUrl,
                thumbUrl = null, // TODO: Generate thumbnails via Cloud Functions
                order = index
            )
        }
    }
    
    /**
     * Delete an image from Storage (optional - for future cleanup)
     */
    suspend fun deleteImage(ownerUid: String, carId: Long, imageId: String) {
        try {
            val path = getImagePath(ownerUid, carId, imageId)
            val storageRef: StorageReference = storage.reference.child(path)
            storageRef.delete().await()
        } catch (e: Exception) {
            android.util.Log.e("CarImageStorage", "Error deleting image", e)
            // Don't throw - deletion failures are non-critical
        }
    }
}

