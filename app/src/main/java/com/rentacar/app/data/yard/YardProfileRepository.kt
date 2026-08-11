package com.rentacar.app.data.yard

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.tasks.await
import android.util.Log

/**
 * Repository for managing YardProfile in Firestore
 * Stores data under /users/{uid}/yardProfile/profile
 */
class YardProfileRepository(
    private val firestore: FirebaseFirestore,
    private val currentUserProvider: CurrentUserProvider = CurrentUserProvider
) {
    companion object {
        private const val TAG = "YardProfileRepository"
        private const val COLLECTION_NAME = "yardProfile"
        private const val DOCUMENT_ID = "profile"
    }

    /**
     * Get yard profile once (non-reactive)
     */
    suspend fun getYardProfileOnce(userId: String): YardProfile? = try {
        val docRef = firestore
            .collection("users")
            .document(userId)
            .collection(COLLECTION_NAME)
            .document(DOCUMENT_ID)

        val snapshot = docRef.get().await()
        if (snapshot.exists()) {
            snapshot.toObject(YardProfile::class.java)
        } else {
            null
        }
    } catch (e: Exception) {
        Log.e(TAG, "Error getting yard profile for userId=$userId", e)
        null
    }

    /**
     * Observe yard profile (reactive Flow)
     */
    fun observeYardProfile(userId: String): Flow<YardProfile?> = flow {
        try {
            val docRef = firestore
                .collection("users")
                .document(userId)
                .collection(COLLECTION_NAME)
                .document(DOCUMENT_ID)

            val snapshot = docRef.get().await()
            if (snapshot.exists()) {
                emit(snapshot.toObject(YardProfile::class.java))
            } else {
                emit(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error observing yard profile for userId=$userId", e)
            emit(null)
        }
    }

    /**
     * Save yard profile
     * Sets createdAt if null, and always updates updatedAt with current time
     */
    suspend fun saveYardProfile(userId: String, profile: YardProfile): Result<Unit> = try {
        val now = System.currentTimeMillis()
        val profileToSave = profile.copy(
            id = DOCUMENT_ID,
            createdAt = profile.createdAt ?: now,
            updatedAt = now
        )

        val docRef = firestore
            .collection("users")
            .document(userId)
            .collection(COLLECTION_NAME)
            .document(DOCUMENT_ID)

        // Use merge to update if exists, create if not
        docRef.set(profileToSave, SetOptions.merge()).await()

        Log.d(TAG, "Successfully saved yard profile for userId=$userId")
        Result.success(Unit)
    } catch (e: Exception) {
        Log.e(TAG, "Error saving yard profile for userId=$userId", e)
        Result.failure(e)
    }
}

