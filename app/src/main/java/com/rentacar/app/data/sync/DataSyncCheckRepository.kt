package com.rentacar.app.data.sync

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.QuerySnapshot
import com.google.firebase.firestore.FirebaseFirestoreException
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.auth.CurrentUserProvider
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
        val currentUid = CurrentUserProvider.requireCurrentUid()
        Log.d(TAG, "=== Starting DataSyncCheck ===")
        
        val categories = mutableListOf<SyncCategorySummary>()
        
        // Check each entity that is backed up
        categories.add(checkCategory("customers", "לקוחות", { db.customerDao().getCount(currentUid) }))
        categories.add(checkCategory("suppliers", "ספקים", { db.supplierDao().getCount(currentUid) }))
        categories.add(checkCategory("agents", "סוכנים", { db.agentDao().getCount(currentUid) }))
        categories.add(checkCategory("carTypes", "סוגי רכב", { db.carTypeDao().getCount(currentUid) }))
        categories.add(checkCategory("branches", "סניפים", { db.branchDao().getCount(currentUid) }))
        categories.add(checkCategory("reservations", "הזמנות", { db.reservationDao().getCount(currentUid) }))
        categories.add(checkCategory("payments", "תשלומים", { db.paymentDao().getCount(currentUid) }))
        categories.add(checkCategory("commissionRules", "כללי עמלה", { db.commissionRuleDao().getCount(currentUid) }))
        categories.add(checkCategory("cardStubs", "סטובס כרטיסים", { db.cardStubDao().getCount(currentUid) }))
        categories.add(checkCategory("requests", "בקשות", { db.requestDao().getCount(currentUid) }))
        categories.add(checkCategory("carSales", "מכירות רכב", { db.carSaleDao().getCount(currentUid) }))
        
        val summary = SyncCheckSummary.create(categories)
        
        // Log summary
        val permissionErrors = categories.filter { 
            it.status == SyncCategoryStatus.ERROR && 
            it.message?.contains("PERMISSION_DENIED") == true 
        }
        
        if (permissionErrors.isNotEmpty()) {
            Log.e(TAG, "=== PERMISSION ERRORS DETECTED ===")
            permissionErrors.forEach { category ->
                Log.e(TAG, "  - $category.key: ${category.message}")
            }
            Log.e(TAG, "=== Check Firestore security rules! ===")
        }
        
        Log.d(TAG, "=== DataSyncCheck completed: hasDifferences=${summary.hasDifferences}, hasErrors=${summary.hasErrors}, localTotal=${summary.localTotal}, cloudTotal=${summary.cloudTotal} ===")
        
        return@withContext summary
    }
    
    private suspend fun checkCategory(
        collectionName: String,
        displayName: String,
        localCountProvider: suspend () -> Int
    ): SyncCategorySummary {
        var localCount: Int? = null
        var localError: String? = null
        
        try {
            localCount = localCountProvider()
        } catch (e: Exception) {
            localError = e.message ?: "Unknown error"
            Log.e(TAG, "Error getting local count for $collectionName: $localError", e)
        }
        
        var cloudCount: Int? = null
        var cloudError: String? = null
        var isPermissionError = false
        
        try {
            cloudCount = getFirestoreCount(collectionName)
        } catch (e: Exception) {
            cloudError = e.message ?: "Unknown error"
            
            // Check if this is a permission error
            if (e is FirebaseFirestoreException) {
                isPermissionError = e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED
                if (isPermissionError) {
                    Log.e(TAG, "PERMISSION_DENIED for collection=$collectionName - Check Firestore security rules!", e)
                } else {
                    Log.e(TAG, "Firestore error for collection=$collectionName code=${e.code} message=$cloudError", e)
                }
            } else {
                Log.e(TAG, "Error getting cloud count for $collectionName: $cloudError", e)
            }
        }
        
        // Determine status
        val status = when {
            localCount == null || cloudCount == null -> SyncCategoryStatus.ERROR
            localCount == cloudCount -> SyncCategoryStatus.OK
            else -> SyncCategoryStatus.WARNING
        }
        
        // Build detailed message
        val message = when {
            localCount == null -> "Failed to read local count: ${localError ?: "Unknown error"}"
            cloudCount == null -> {
                if (isPermissionError) {
                    "PERMISSION_DENIED: Check Firestore security rules for collection '$collectionName'"
                } else {
                    "Firestore error: ${cloudError ?: "Unknown error"}"
                }
            }
            localCount == cloudCount -> null
            else -> {
                val diff = cloudCount - localCount
                when {
                    diff > 0 -> "Cloud has $diff more than local"
                    else -> "Local has ${-diff} more than cloud"
                }
            }
        }
        
        // Log final status in the requested format
        val statusMessage = when (status) {
            SyncCategoryStatus.OK -> "status=OK"
            SyncCategoryStatus.WARNING -> {
                val diff = if (cloudCount != null && localCount != null) {
                    val d = cloudCount - localCount
                    if (d > 0) " (cloud has $d more)" else " (local has ${-d} more)"
                } else ""
                "status=WARNING$diff"
            }
            SyncCategoryStatus.ERROR -> {
                val errorDetails = when {
                    localCount == null -> " (local read failed)"
                    cloudCount == null -> {
                        if (isPermissionError) " (PERMISSION_DENIED)" else " (cloud read failed)"
                    }
                    else -> ""
                }
                "status=ERROR$errorDetails"
            }
        }
        
        Log.d(TAG, "category=$collectionName local=${localCount ?: "null"} cloud=${cloudCount ?: "null"} $statusMessage")
        
        return SyncCategorySummary(
            key = collectionName,
            displayName = displayName,
            localCount = localCount,
            cloudCount = cloudCount,
            status = status,
            message = message
        )
    }
    
    private suspend fun getFirestoreCount(collectionName: String): Int {
        val collection = UserCollections.userCollection(firestore, collectionName)
        val snapshot: QuerySnapshot = collection
            .get()
            .await()
        return snapshot.size()
    }
}

