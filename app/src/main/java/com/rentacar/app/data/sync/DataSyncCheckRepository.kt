package com.rentacar.app.data.sync

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.QuerySnapshot
import com.rentacar.app.data.AppDatabase
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface DataSyncCheckRepository {
    suspend fun computeSyncSummary(): SyncCheckSummary
}

class DefaultDataSyncCheckRepository(
    private val db: AppDatabase,
    private val firestore: FirebaseFirestore
) : DataSyncCheckRepository {
    
    companion object {
        private const val TAG = "DataSyncCheck"
    }
    
    override suspend fun computeSyncSummary(): SyncCheckSummary = withContext(Dispatchers.IO) {
        val categories = mutableListOf<SyncCategorySummary>()
        
        // Check each entity that is backed up
        categories.add(checkCategory("customers", "לקוחות", { db.customerDao().getCount() }))
        categories.add(checkCategory("suppliers", "ספקים", { db.supplierDao().getCount() }))
        categories.add(checkCategory("agents", "סוכנים", { db.agentDao().getCount() }))
        categories.add(checkCategory("carTypes", "סוגי רכב", { db.carTypeDao().getCount() }))
        categories.add(checkCategory("branches", "סניפים", { db.branchDao().getCount() }))
        categories.add(checkCategory("reservations", "הזמנות", { db.reservationDao().getCount() }))
        categories.add(checkCategory("payments", "תשלומים", { db.paymentDao().getCount() }))
        categories.add(checkCategory("commissionRules", "כללי עמלה", { db.commissionRuleDao().getCount() }))
        categories.add(checkCategory("cardStubs", "סטובס כרטיסים", { db.cardStubDao().getCount() }))
        categories.add(checkCategory("requests", "בקשות", { db.requestDao().getCount() }))
        categories.add(checkCategory("carSales", "מכירות רכב", { db.carSaleDao().getCount() }))
        
        return@withContext SyncCheckSummary.create(categories)
    }
    
    private suspend fun checkCategory(
        collectionName: String,
        displayName: String,
        localCountProvider: suspend () -> Int
    ): SyncCategorySummary {
        val localCount = try {
            localCountProvider()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting local count for $collectionName", e)
            null
        }
        
        val cloudCount = try {
            getFirestoreCount(collectionName)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting cloud count for $collectionName", e)
            null
        }
        
        val status = when {
            localCount == null || cloudCount == null -> SyncCategoryStatus.ERROR
            localCount == cloudCount -> SyncCategoryStatus.OK
            else -> SyncCategoryStatus.WARNING
        }
        
        val message = when {
            localCount == null -> "Failed to read local count"
            cloudCount == null -> "Collection not found or error reading from Firestore"
            localCount == cloudCount -> null
            else -> "Count mismatch: local=$localCount, cloud=$cloudCount"
        }
        
        Log.d(TAG, "Category $collectionName: local=$localCount, cloud=$cloudCount, status=$status")
        
        return SyncCategorySummary(
            key = collectionName,
            displayName = displayName,
            localCount = localCount,
            cloudCount = cloudCount,
            status = status,
            message = message
        )
    }
    
    private suspend fun getFirestoreCount(collectionName: String): Int? {
        return try {
            val snapshot: QuerySnapshot = firestore.collection(collectionName)
                .get()
                .await()
            snapshot.size()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting Firestore count for $collectionName", e)
            null
        }
    }
}

