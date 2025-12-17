package com.rentacar.app.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.firebase.firestore.FirebaseFirestore
import com.google.gson.Gson
import com.rentacar.app.data.*
import com.rentacar.app.data.sync.SyncQueueDao
import com.rentacar.app.data.sync.SyncQueueEntity
import com.rentacar.app.data.sync.SyncCountsProvider
import com.rentacar.app.data.sync.SyncProgressRepository
import com.rentacar.app.data.sync.SyncProgressState
import com.rentacar.app.data.sync.UserCollections
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.di.DatabaseModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class CloudDeltaSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {
    
    companion object {
        private const val TAG = "cloud_delta_sync"
    }
    
    private val db by lazy { DatabaseModule.provideDatabase(appContext) }
    private val firestore by lazy { 
        val instance = FirebaseFirestore.getInstance()
        // Log project ID for debugging
        Log.d(TAG, "Using Firestore projectId=${instance.app.options.projectId}")
        instance
    }
    private val syncQueueDao by lazy { db.syncQueueDao() }
    private val countsProvider by lazy { SyncCountsProvider(db, firestore) }
    private val gson = Gson()
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            // Reset progress state at start
            SyncProgressRepository.reset()
            
            // Check counts and mark categories for first-time seed if needed
            checkAndMarkForSeed()
            
            // Process sync queue - now processes ALL dirty items table-by-table
            // processSyncQueue() already sets the final completion state, so we don't need to update it here
            val syncedCount = processSyncQueue()
            val output = workDataOf("syncedCount" to syncedCount)
            Log.d(TAG, "Sync completed: syncedCount=$syncedCount")
            
            // Note: processSyncQueue() already handles setting the completion state or resetting to idle
            // No need to update state here as it's already done in processSyncQueue()
            
            Result.success(output)
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected error in delta sync", t)
            SyncProgressRepository.updateProgress(
                SyncProgressState.error("שגיאה בסנכרון: ${t.message ?: "שגיאה לא ידועה"}")
            )
            Result.retry()
        }
    }
    
    /**
     * Check each category's counts. If cloudCount == 0 && localCount > 0,
     * mark all local records as dirty for first-time seed to cloud.
     */
    private suspend fun checkAndMarkForSeed() {
        val now = System.currentTimeMillis()
        
        // Map collection names (plural) to entity types (singular) used in sync
        data class CategoryInfo(
            val collectionName: String,
            val entityType: String,
            val localCountProvider: suspend () -> Int
        )
        
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val categories = listOf(
            CategoryInfo("customers", "customer") { db.customerDao().getCount(currentUid) },
            CategoryInfo("suppliers", "supplier") { db.supplierDao().getCount(currentUid) },
            CategoryInfo("agents", "agent") { db.agentDao().getCount(currentUid) },
            CategoryInfo("carTypes", "carType") { db.carTypeDao().getCount(currentUid) },
            CategoryInfo("branches", "branch") { db.branchDao().getCount(currentUid) },
            CategoryInfo("reservations", "reservation") { db.reservationDao().getCount(currentUid) },
            CategoryInfo("payments", "payment") { db.paymentDao().getCount(currentUid) },
            CategoryInfo("commissionRules", "commissionRule") { db.commissionRuleDao().getCount(currentUid) },
            CategoryInfo("cardStubs", "cardStub") { db.cardStubDao().getCount(currentUid) },
            CategoryInfo("requests", "request") { db.requestDao().getCount(currentUid) },
            CategoryInfo("carSales", "carSale") { db.carSaleDao().getCount(currentUid) }
        )
        
        for (category in categories) {
            try {
                val counts = countsProvider.getCounts(category.collectionName, category.localCountProvider)
                if (counts != null) {
                    val localCount = counts.localCount
                    val cloudCount = counts.cloudCount
                    
                    if (cloudCount == 0 && localCount > 0) {
                        Log.d(
                            TAG,
                            "category=${category.collectionName} local=$localCount cloud=$cloudCount action=SEED_TO_CLOUD - marking all as dirty"
                        )
                        markAllAsDirty(category.entityType, now)
                    } else if (category.entityType == "branch" && cloudCount < localCount) {
                        // Special handling for branches: if Firestore has fewer branches than local,
                        // mark all branches as dirty once so they will be pushed.
                        Log.d(
                            TAG,
                            "category=${category.collectionName} local=$localCount cloud=$cloudCount action=SEED_BRANCH_PARTIAL - marking all branches as dirty"
                        )
                        markAllAsDirty(category.entityType, now)
                    } else {
                        Log.d(
                            TAG,
                            "category=${category.collectionName} local=$localCount cloud=$cloudCount action=DELTA_PUSH"
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking counts for ${category.collectionName}", e)
            }
        }
    }
    
    /**
     * Mark all local records of a category as dirty for sync.
     * entityType should be singular (e.g., "customer", "supplier") to match syncSingleItem().
     */
    private suspend fun markAllAsDirty(entityType: String, lastDirtyAt: Long) {
        try {
            val currentUid = CurrentUserProvider.requireCurrentUid()
            when (entityType) {
                "customer" -> {
                    val customers = db.customerDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    customers.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${customers.size} customers as dirty")
                }
                "supplier" -> {
                    val suppliers = db.supplierDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    suppliers.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${suppliers.size} suppliers as dirty")
                }
                "agent" -> {
                    val agents = db.agentDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    agents.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${agents.size} agents as dirty")
                }
                "carType" -> {
                    val carTypes = db.carTypeDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    carTypes.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${carTypes.size} carTypes as dirty")
                }
                "branch" -> {
                    // Branches need special handling - get all suppliers first
                    val suppliers = db.supplierDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    var branchCount = 0
                    suppliers.forEach { supplier ->
                        val branches = db.branchDao().getBySupplier(supplier.id, currentUid).firstOrNull() ?: emptyList()
                        branches.forEach { branch ->
                            syncQueueDao.markDirty(entityType, branch.id, lastDirtyAt)
                            branchCount++
                        }
                    }
                    Log.d(TAG, "Marked $branchCount branches as dirty")
                }
                "reservation" -> {
                    val reservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    reservations.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${reservations.size} reservations as dirty")
                }
                "payment" -> {
                    // Payments are linked to reservations
                    val reservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    var paymentCount = 0
                    reservations.forEach { reservation ->
                        val payments = db.paymentDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
                        payments.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                        paymentCount += payments.size
                    }
                    Log.d(TAG, "Marked $paymentCount payments as dirty")
                }
                "commissionRule" -> {
                    val rules = db.commissionRuleDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    rules.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${rules.size} commissionRules as dirty")
                }
                "cardStub" -> {
                    // CardStubs are linked to reservations
                    val reservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    var stubCount = 0
                    reservations.forEach { reservation ->
                        val stubs = db.cardStubDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
                        stubs.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                        stubCount += stubs.size
                    }
                    Log.d(TAG, "Marked $stubCount cardStubs as dirty")
                }
                "request" -> {
                    val requests = db.requestDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    requests.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${requests.size} requests as dirty")
                }
                "carSale" -> {
                    val sales = db.carSaleDao().getAll(currentUid).firstOrNull() ?: emptyList()
                    sales.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${sales.size} carSales as dirty")
                }
                else -> {
                    Log.w(TAG, "Unknown entity type for markAllAsDirty: $entityType")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error marking all $entityType as dirty", e)
        }
    }
    
    /**
     * NEW BEHAVIOR (after refactoring):
     * - Processes ALL dirty items across ALL tables, with no artificial limit
     * - Processes table-by-table for better progress reporting
     * - Reports progress in real-time via SyncProgressRepository
     * - Handles errors gracefully with retries for transient failures
     * 
     * Process:
     * 1. Get all entity types that have dirty items
     * 2. For each entity type, count dirty items and fetch them all
     * 3. Process each table sequentially, updating progress after each item
     * 4. Continue until all dirty items are processed or a fatal error occurs
     */
    private suspend fun processSyncQueue(): Int {
        // Get all entity types that have dirty items
        val entityTypes = syncQueueDao.getDirtyEntityTypes()
        if (entityTypes.isEmpty()) {
            Log.d(TAG, "No dirty items to sync")
            SyncProgressRepository.updateProgress(SyncProgressState.idle())
            return 0
        }
        
        // Map entity types to Hebrew display names
        val entityTypeToDisplayName = mapOf(
            "customer" to "לקוחות",
            "supplier" to "ספקים",
            "agent" to "סוכנים",
            "carType" to "סוגי רכב",
            "branch" to "סניפים",
            "reservation" to "הזמנות",
            "payment" to "תשלומים",
            "commissionRule" to "כללי עמלה",
            "cardStub" to "סטבים",
            "request" to "בקשות",
            "carSale" to "מכירות רכב"
        )
        
        // Calculate REAL dirty counts per table and overall
        // Use a data class to store table info with display names
        data class TableSyncInfo(
            val key: String,
            val displayName: String,
            val dirtyCount: Int
        )
        
        val tableInfos = mutableListOf<TableSyncInfo>()
        
        // Query REAL dirty counts for each table
        for (entityType in entityTypes) {
            val dirtyCount = syncQueueDao.getDirtyCountByType(entityType)
            if (dirtyCount > 0) {
                val displayName = entityTypeToDisplayName[entityType] ?: entityType
                tableInfos.add(TableSyncInfo(entityType, displayName, dirtyCount))
            }
        }
        
        // Filter out tables with 0 dirty items
        val tablesToSync = tableInfos.filter { it.dirtyCount > 0 }
        val totalTablesToSync = tablesToSync.size
        
        // Calculate overall total - this is assigned ONCE and never modified during loops
        val overallTotalItems = tablesToSync.sumOf { it.dirtyCount }
        
        if (totalTablesToSync == 0 || overallTotalItems == 0) {
            Log.d(TAG, "No dirty items to sync (counts calculated)")
            // Reset to idle state with all zeros - do NOT show progress dialog
            SyncProgressRepository.reset()
            return 0
        }
        
        // Debug log to verify counts
        Log.d(TAG, "Init totals: tables=$totalTablesToSync overallTotalItems=$overallTotalItems tableInfos=${tablesToSync.map { "${it.displayName}=${it.dirtyCount}" }}")
        
        // Initialize progress state with REAL totals
        SyncProgressRepository.updateProgress(
            isRunning = true,
            totalTables = totalTablesToSync,
            overallTotalItems = overallTotalItems
        )
        
        // Counters - only increment on successful sync
        var overallProcessedItems = 0
        var overallSyncedCount = 0
        
        // Process each table sequentially
        for ((tableIndex, tableInfo) in tablesToSync.withIndex()) {
            val entityType = tableInfo.key
            val tableDisplayName = tableInfo.displayName
            val tableDirtyCount = tableInfo.dirtyCount  // REAL dirty count for this table
            
            Log.d(TAG, "Processing table: $entityType ($tableDisplayName) - $tableDirtyCount dirty items")
            
            // Update progress: starting new table
            // Set currentTableItemTotal = dirtyCount (assignment, not increment)
            SyncProgressRepository.updateProgress(
                currentTableIndex = tableIndex + 1,
                totalTables = totalTablesToSync,
                currentTableName = tableDisplayName,
                currentTableItemIndex = 0,
                currentTableItemTotal = tableDirtyCount,  // Set with =, never +=
                isRunning = true,
                overallTotalItems = overallTotalItems  // Preserve the initial total
            )
            
            // Get all dirty items for this entity type
            val dirtyItems = syncQueueDao.getDirtyItemsByType(entityType)
            
            // Verify the count matches
            if (dirtyItems.size != tableDirtyCount) {
                Log.w(TAG, "Count mismatch for $entityType: expected $tableDirtyCount, got ${dirtyItems.size}")
            }
            
            // Process each item in the table
            for ((itemIndex, item) in dirtyItems.withIndex()) {
                // Check if worker was cancelled
                if (isStopped) {
                    Log.d(TAG, "Sync worker was stopped, marking remaining items as still dirty")
                    SyncProgressRepository.updateProgress(
                        lastMessage = "סנכרון בוטל",
                        isRunning = false
                    )
                    return overallSyncedCount
                }
                
                // Try to sync with retries for transient errors
                val success = syncSingleItemWithRetry(item, maxRetries = 3)
                
                // Only increment counters on successful sync
                if (success) {
                    overallSyncedCount++
                    overallProcessedItems++  // Only increment on success
                    
                    // Update progress after each successful item
                    val currentTableItemIndex = itemIndex + 1
                    SyncProgressRepository.updateProgress(
                        currentTableItemIndex = currentTableItemIndex,
                        overallProcessedItems = overallProcessedItems,
                        lastMessage = "עודכן: ${tableDisplayName} #${item.entityId}"
                    )
                    
                    // Debug log for verification
                    if (itemIndex % 10 == 0 || itemIndex == dirtyItems.size - 1) {
                        Log.d(TAG, "Table=${tableDisplayName} idx=$currentTableItemIndex/$tableDirtyCount overall=$overallProcessedItems/$overallTotalItems")
                    }
                } else {
                    // Log failed sync but don't increment counters
                    Log.w(TAG, "Failed to sync item ${item.entityId} from table $tableDisplayName")
                }
            }
            
            Log.d(TAG, "Completed table: $entityType ($tableDisplayName) - processed ${dirtyItems.size} items, synced $overallSyncedCount total so far")
        }
        
        Log.d(TAG, "Full sync completed: $overallSyncedCount items synced out of $overallTotalItems total")
        
        // Ensure final state shows completion with correct values
        // overallPercent is calculated automatically by updateProgress()
        SyncProgressRepository.updateProgress(
            isRunning = false,
            overallProcessedItems = overallProcessedItems,
            overallTotalItems = overallTotalItems,
            lastMessage = "סנכרון הושלם בהצלחה"
        )
        
        return overallSyncedCount
    }
    
    /**
     * Sync a single item with retry logic for transient errors.
     * Returns true if synced successfully, false otherwise.
     */
    private suspend fun syncSingleItemWithRetry(item: SyncQueueEntity, maxRetries: Int = 3): Boolean {
        var attempt = 0
        while (attempt < maxRetries) {
            try {
                val success = syncSingleItem(item)
                if (success) {
                    return true
                }
                // If syncSingleItem returns false, it means the entity was not found
                // This is not a transient error, so don't retry
                return false
            } catch (e: Exception) {
                attempt++
                val isTransient = isTransientError(e)
                
                if (!isTransient || attempt >= maxRetries) {
                    // Fatal error or max retries reached
                    Log.e(TAG, "Failed to sync item id=${item.id} type=${item.entityType} after $attempt attempts", e)
                    syncQueueDao.markFailed(item.id, status = "FAILED", error = e.message ?: "Unknown error")
                    return false
                }
                
                // Transient error - retry with exponential backoff
                val delayMs = (100 * attempt).toLong() // 100ms, 200ms, 300ms
                Log.w(TAG, "Transient error syncing item id=${item.id}, retrying in ${delayMs}ms (attempt $attempt/$maxRetries)", e)
                kotlinx.coroutines.delay(delayMs)
            }
        }
        return false
    }
    
    /**
     * Check if an exception represents a transient error that should be retried.
     */
    private fun isTransientError(e: Exception): Boolean {
        val message = e.message?.lowercase() ?: ""
        return message.contains("network") ||
               message.contains("timeout") ||
               message.contains("unavailable") ||
               message.contains("deadline exceeded") ||
               e is java.net.SocketTimeoutException ||
               e is java.net.UnknownHostException ||
               (e is com.google.firebase.firestore.FirebaseFirestoreException &&
                (e.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.UNAVAILABLE ||
                 e.code == com.google.firebase.firestore.FirebaseFirestoreException.Code.DEADLINE_EXCEEDED))
    }
    
    private suspend fun syncSingleItem(item: SyncQueueEntity): Boolean {
        return try {
            when (item.entityType) {
                "customer" -> syncCustomer(item)
                "supplier" -> syncSupplier(item)
                "agent" -> syncAgent(item)
                "carType" -> syncCarType(item)
                "branch" -> syncBranch(item)
                "reservation" -> syncReservation(item)
                "payment" -> syncPayment(item)
                "commissionRule" -> syncCommissionRule(item)
                "cardStub" -> syncCardStub(item)
                "request" -> syncRequest(item)
                "carSale" -> syncCarSale(item)
                else -> {
                    Log.w(TAG, "Unknown entity type: ${item.entityType}")
                    syncQueueDao.markFailed(item.id, status = "FAILED", error = "Unknown entity type")
                    false
                }
            }
            true
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to sync item id=${item.id} type=${item.entityType}", t)
            syncQueueDao.markFailed(item.id, status = "FAILED", error = t.message ?: "Unknown error")
            false
        }
    }
    
    private suspend fun syncCustomer(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val customer = db.customerDao().getById(item.entityId, currentUid).firstOrNull()
        if (customer == null) {
            Log.w(TAG, "Customer ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to customer.id,
            "firstName" to customer.firstName,
            "lastName" to customer.lastName,
            "phone" to customer.phone,
            "tzId" to customer.tzId,
            "address" to customer.address,
            "email" to customer.email,
            "isCompany" to customer.isCompany,
            "active" to customer.active,
            "createdAt" to customer.createdAt,
            "updatedAt" to customer.updatedAt
        )
        
        val collectionPath = "customers"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=customer, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced customer id=${item.entityId}")
        return true
    }
    
    private suspend fun syncSupplier(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val supplier = db.supplierDao().getById(item.entityId, currentUid).firstOrNull()
        if (supplier == null) {
            Log.w(TAG, "Supplier ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to supplier.id,
            "name" to supplier.name,
            "address" to supplier.address,
            "taxId" to supplier.taxId,
            "phone" to supplier.phone,
            "email" to supplier.email,
            "defaultHold" to supplier.defaultHold,
            "fixedHold" to supplier.fixedHold,
            "commissionDays1to6" to supplier.commissionDays1to6,
            "commissionDays7to23" to supplier.commissionDays7to23,
            "commissionDays24plus" to supplier.commissionDays24plus,
            "activeTemplateId" to supplier.activeTemplateId,
            "importFunctionCode" to supplier.importFunctionCode,
            "importTemplateId" to supplier.importTemplateId,
            "priceListImportFunctionCode" to supplier.priceListImportFunctionCode
        )
        
        val collectionPath = "suppliers"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=supplier, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced supplier id=${item.entityId}")
        return true
    }
    
    private suspend fun syncAgent(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val agent = db.agentDao().getAll(currentUid).firstOrNull()?.find { it.id == item.entityId }
        if (agent == null) {
            Log.w(TAG, "Agent ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to agent.id,
            "name" to agent.name,
            "phone" to agent.phone,
            "email" to agent.email,
            "active" to agent.active
        )
        
        val collectionPath = "agents"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=agent, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced agent id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCarType(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val carType = db.carTypeDao().getAll(currentUid).firstOrNull()?.find { it.id == item.entityId }
        if (carType == null) {
            Log.w(TAG, "CarType ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to carType.id,
            "name" to carType.name
        )
        
        val collectionPath = "carTypes"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=carType, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced carType id=${item.entityId}")
        return true
    }
    
    private suspend fun syncBranch(item: SyncQueueEntity): Boolean {
        // Load branch by its primary key (id), independent of supplier
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val branch = db.branchDao().getById(item.entityId, currentUid)
        if (branch == null) {
            Log.w(TAG, "Branch ${item.entityId} not found locally, skipping")
            // Mark as synced to avoid infinite retries for a missing local row
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        syncBranchToFirestore(branch, item)
        return true
    }
    
    private suspend fun syncBranchToFirestore(branch: Branch, item: SyncQueueEntity) {
        val data = mapOf(
            "id" to branch.id,
            "name" to branch.name,
            "address" to branch.address,
            "city" to branch.city,
            "street" to branch.street,
            "phone" to branch.phone,
            "supplierId" to branch.supplierId
        )
        
        val collectionPath = "branches"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=branch, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced branch id=${item.entityId}")
    }
    
    private suspend fun syncReservation(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val reservation = db.reservationDao().getById(item.entityId, currentUid).firstOrNull()
        if (reservation == null) {
            Log.w(TAG, "Reservation ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to reservation.id,
            "customerId" to reservation.customerId,
            "supplierId" to reservation.supplierId,
            "branchId" to reservation.branchId,
            "carTypeId" to reservation.carTypeId,
            "carTypeName" to reservation.carTypeName,
            "agentId" to reservation.agentId,
            "dateFrom" to reservation.dateFrom,
            "dateTo" to reservation.dateTo,
            "actualReturnDate" to reservation.actualReturnDate,
            "includeVat" to reservation.includeVat,
            "vatPercentAtCreation" to reservation.vatPercentAtCreation,
            "airportMode" to reservation.airportMode,
            "agreedPrice" to reservation.agreedPrice,
            "kmIncluded" to reservation.kmIncluded,
            "requiredHoldAmount" to reservation.requiredHoldAmount,
            "periodTypeDays" to reservation.periodTypeDays,
            "commissionPercentUsed" to reservation.commissionPercentUsed,
            "status" to reservation.status.name,
            "isClosed" to reservation.isClosed,
            "supplierOrderNumber" to reservation.supplierOrderNumber,
            "externalContractNumber" to reservation.externalContractNumber,
            "notes" to reservation.notes,
            "isQuote" to reservation.isQuote,
            "createdAt" to reservation.createdAt,
            "updatedAt" to reservation.updatedAt
        )
        
        val collectionPath = "reservations"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=reservation, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced reservation id=${item.entityId}")
        return true
    }
    
    private suspend fun syncPayment(item: SyncQueueEntity): Boolean {
        // Payments are linked to reservations, need to find which reservation
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val allReservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
        var payment: Payment? = null
        for (reservation in allReservations) {
            val payments = db.paymentDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
            payment = payments.find { it.id == item.entityId }
            if (payment != null) break
        }
        
        if (payment == null) {
            Log.w(TAG, "Payment ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to payment.id,
            "reservationId" to payment.reservationId,
            "amount" to payment.amount,
            "date" to payment.date,
            "method" to payment.method,
            "note" to payment.note
        )
        
        val collectionPath = "payments"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=payment, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced payment id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCommissionRule(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val rules = db.commissionRuleDao().getAll(currentUid).firstOrNull() ?: emptyList()
        val rule = rules.find { it.id == item.entityId }
        if (rule == null) {
            Log.w(TAG, "CommissionRule ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to rule.id,
            "minDays" to rule.minDays,
            "maxDays" to rule.maxDays,
            "percent" to rule.percent
        )
        
        val collectionPath = "commissionRules"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=commissionRule, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced commissionRule id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCardStub(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val allReservations = db.reservationDao().getAll(currentUid).firstOrNull() ?: emptyList()
        var cardStub: CardStub? = null
        for (reservation in allReservations) {
            val stubs = db.cardStubDao().getForReservation(reservation.id, currentUid).firstOrNull() ?: emptyList()
            cardStub = stubs.find { it.id == item.entityId }
            if (cardStub != null) break
        }
        
        if (cardStub == null) {
            Log.w(TAG, "CardStub ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to cardStub.id,
            "reservationId" to cardStub.reservationId,
            "brand" to cardStub.brand,
            "last4" to cardStub.last4,
            "expMonth" to cardStub.expMonth,
            "expYear" to cardStub.expYear,
            "holderFirstName" to cardStub.holderFirstName,
            "holderLastName" to cardStub.holderLastName,
            "holderTz" to cardStub.holderTz
        )
        
        val collectionPath = "cardStubs"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=cardStub, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced cardStub id=${item.entityId}")
        return true
    }
    
    private suspend fun syncRequest(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val requests = db.requestDao().getAll(currentUid).firstOrNull() ?: emptyList()
        val request = requests.find { it.id == item.entityId }
        if (request == null) {
            Log.w(TAG, "Request ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to request.id,
            "isPurchase" to request.isPurchase,
            "isQuote" to request.isQuote,
            "firstName" to request.firstName,
            "lastName" to request.lastName,
            "phone" to request.phone,
            "carTypeName" to request.carTypeName,
            "createdAt" to request.createdAt
        )
        
        val collectionPath = "requests"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=request, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced request id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCarSale(item: SyncQueueEntity): Boolean {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val sales = db.carSaleDao().getAll(currentUid).firstOrNull() ?: emptyList()
        val sale = sales.find { it.id == item.entityId }
        if (sale == null) {
            Log.w(TAG, "CarSale ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = buildMap<String, Any?> {
            put("id", sale.id)
            put("firstName", sale.firstName)
            put("lastName", sale.lastName)
            put("phone", sale.phone)
            put("carTypeName", sale.carTypeName)
            put("saleDate", sale.saleDate)
            put("salePrice", sale.salePrice)
            put("commissionPrice", sale.commissionPrice)
            put("notes", sale.notes)
            put("createdAt", sale.createdAt)
            put("updatedAt", sale.updatedAt)
            // Yard fleet management fields (from migration 33->34)
            sale.brand?.let { put("brand", it) }
            sale.model?.let { put("model", it) }
            sale.year?.let { put("year", it) }
            sale.mileageKm?.let { put("mileageKm", it) }
            sale.publicationStatus?.let { put("publicationStatus", it) }
            sale.imagesJson?.let { put("imagesJson", it) }
            // CarListing V2 fields (from migration 34->35)
            sale.roleContext?.let { put("roleContext", it) }
            sale.saleOwnerType?.let { put("saleOwnerType", it) }
            sale.brandId?.let { put("brandId", it) }
            sale.modelFamilyId?.let { put("modelFamilyId", it) }
            sale.generationId?.let { put("generationId", it) }
            sale.variantId?.let { put("variantId", it) }
            sale.engineId?.let { put("engineId", it) }
            sale.transmissionId?.let { put("transmissionId", it) }
            sale.engineDisplacementCc?.let { put("engineDisplacementCc", it) }
            sale.enginePowerHp?.let { put("enginePowerHp", it) }
            sale.fuelType?.let { put("fuelType", it) }
            sale.gearboxType?.let { put("gearboxType", it) }
            sale.gearCount?.let { put("gearCount", it) }
            sale.handCount?.let { put("handCount", it) }
            sale.bodyType?.let { put("bodyType", it) }
            sale.ac?.let { put("ac", it) }
            sale.ownershipDetails?.let { put("ownershipDetails", it) }
            sale.licensePlatePartial?.let { put("licensePlatePartial", it) }
            sale.vinLastDigits?.let { put("vinLastDigits", it) }
            sale.color?.let { put("color", it) }
        }
        
        val collectionPath = "carSales"
        val documentId = item.entityId.toString()
        val collection = UserCollections.userCollection(firestore, collectionPath)
        val docRef = collection.document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=carSale, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced carSale id=${item.entityId}")
        return true
    }
}

