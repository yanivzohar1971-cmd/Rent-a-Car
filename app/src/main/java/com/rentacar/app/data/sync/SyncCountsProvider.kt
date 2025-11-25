package com.rentacar.app.data.sync

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.QuerySnapshot
import com.rentacar.app.data.AppDatabase
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Shared service for getting local and cloud counts for sync operations.
 * Used by both DataSyncCheck and sync workers.
 */
class SyncCountsProvider(
    private val db: AppDatabase,
    private val firestore: FirebaseFirestore
) {
    
    companion object {
        private const val TAG = "SyncCountsProvider"
    }
    
    data class CategoryCounts(
        val localCount: Int,
        val cloudCount: Int
    )
    
    /**
     * Get counts for a specific category.
     * Returns null if there's an error getting either count.
     */
    suspend fun getCounts(
        collectionName: String,
        localCountProvider: suspend () -> Int
    ): CategoryCounts? = withContext(Dispatchers.IO) {
        try {
            val localCount = localCountProvider()
            val cloudCount = getFirestoreCount(collectionName)
            CategoryCounts(localCount, cloudCount)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting counts for $collectionName", e)
            null
        }
    }
    
    private suspend fun getFirestoreCount(collectionName: String): Int {
        val snapshot: QuerySnapshot = firestore.collection(collectionName)
            .get()
            .await()
        return snapshot.size()
    }
}

