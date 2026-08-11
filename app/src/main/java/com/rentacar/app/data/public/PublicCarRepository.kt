package com.rentacar.app.data.public

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.tasks.await
import android.util.Log

/**
 * Repository for managing public car listings in Firestore
 * Handles publishing/unpublishing cars to the publicCars collection
 */
class PublicCarRepository(
    private val firestore: FirebaseFirestore,
    private val currentUserProvider: CurrentUserProvider = CurrentUserProvider // Use singleton object
) {
    companion object {
        private const val TAG = "PublicCarRepository"
        private const val COLLECTION_NAME = "publicCars"
    }

    /**
     * Publish a car to the public listings
     * Creates or updates the document in publicCars collection
     */
    suspend fun publishCar(carSale: CarSale): Result<Unit> {
        return try {
            val uid = currentUserProvider.requireCurrentUid()
            Log.d(TAG, "publishCar ownerUid=$uid carId=${carSale.id}")
            
            val publicCar = carSale.toPublicCar(ownerUid = uid)
            
            // Verify ownerUid is set correctly
            if (publicCar.ownerUid != uid) {
                Log.e(TAG, "ownerUid mismatch: expected=$uid, got=${publicCar.ownerUid}")
                return Result.failure(Exception("ownerUid mismatch in PublicCar"))
            }
            
            val docRef = firestore
                .collection(COLLECTION_NAME)
                .document(publicCar.id)

            val firestoreMap = publicCar.toFirestoreMap()
            Log.d(TAG, "Publishing to publicCars/${publicCar.id} with ownerUid=${firestoreMap["ownerUid"]}")
            
            // Use merge to update if exists, create if not
            docRef.set(firestoreMap, SetOptions.merge())
                .await()

            Log.d(TAG, "Successfully published car ${publicCar.id} to publicCars")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error publishing car to publicCars: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Unpublish a car (remove from public listings)
     * Deletes the document from publicCars collection
     */
    suspend fun unpublishCar(carId: Long): Result<Unit> {
        return try {
            val uid = currentUserProvider.requireCurrentUid()
            val docId = carId.toString()
            
            Log.d(TAG, "unpublishCar ownerUid=$uid carId=$carId")
            
            val docRef = firestore
                .collection(COLLECTION_NAME)
                .document(docId)

            // Firestore rules will enforce ownership on the server side
            docRef.delete().await()

            Log.d(TAG, "Successfully unpublished car $carId from publicCars")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Error unpublishing car from publicCars: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * Update an existing published car (if it exists in publicCars)
     */
    suspend fun updatePublishedCar(carSale: CarSale): Result<Unit> {
        return publishCar(carSale) // Same logic as publish - uses merge
    }
}

