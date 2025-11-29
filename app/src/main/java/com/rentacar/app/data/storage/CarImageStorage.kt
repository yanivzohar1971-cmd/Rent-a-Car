package com.rentacar.app.data.storage

import android.net.Uri
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.rentacar.app.data.CarImage
import com.rentacar.app.data.auth.CurrentUserProvider
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
     * @return Download URL of the uploaded image
     */
    suspend fun uploadImage(
        localUri: Uri,
        carId: Long,
        imageId: String = UUID.randomUUID().toString()
    ): String {
        val ownerUid = CurrentUserProvider.requireCurrentUid()
        val path = getImagePath(ownerUid, carId, imageId)
        val storageRef: StorageReference = storage.reference.child(path)
        
        return try {
            storageRef.putFile(localUri).await()
            storageRef.downloadUrl.await().toString()
        } catch (e: Exception) {
            android.util.Log.e("CarImageStorage", "Error uploading image", e)
            throw e
        }
    }
    
    /**
     * Upload multiple images
     * @return List of CarImage with download URLs
     */
    suspend fun uploadImages(
        localUris: List<Uri>,
        carId: Long
    ): List<CarImage> {
        return localUris.mapIndexed { index, uri ->
            val imageId = UUID.randomUUID().toString()
            val downloadUrl = uploadImage(uri, carId, imageId)
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

