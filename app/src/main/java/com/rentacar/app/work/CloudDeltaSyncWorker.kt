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
            // Check counts and mark categories for first-time seed if needed
            checkAndMarkForSeed()
            
            // Process sync queue as normal
            val syncedCount = processSyncQueue()
            val output = workDataOf("syncedCount" to syncedCount)
            Log.d(TAG, "Sync completed: syncedCount=$syncedCount")
            Result.success(output)
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected error in delta sync", t)
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
        
        val categories = listOf(
            CategoryInfo("customers", "customer") { db.customerDao().getCount() },
            CategoryInfo("suppliers", "supplier") { db.supplierDao().getCount() },
            CategoryInfo("agents", "agent") { db.agentDao().getCount() },
            CategoryInfo("carTypes", "carType") { db.carTypeDao().getCount() },
            CategoryInfo("branches", "branch") { db.branchDao().getCount() },
            CategoryInfo("reservations", "reservation") { db.reservationDao().getCount() },
            CategoryInfo("payments", "payment") { db.paymentDao().getCount() },
            CategoryInfo("commissionRules", "commissionRule") { db.commissionRuleDao().getCount() },
            CategoryInfo("cardStubs", "cardStub") { db.cardStubDao().getCount() },
            CategoryInfo("requests", "request") { db.requestDao().getCount() },
            CategoryInfo("carSales", "carSale") { db.carSaleDao().getCount() }
        )
        
        for (category in categories) {
            try {
                val counts = countsProvider.getCounts(category.collectionName, category.localCountProvider)
                if (counts != null) {
                    val localCount = counts.localCount
                    val cloudCount = counts.cloudCount
                    
                    if (cloudCount == 0 && localCount > 0) {
                        Log.d(TAG, "category=${category.collectionName} local=$localCount cloud=$cloudCount action=SEED_TO_CLOUD - marking all as dirty")
                        markAllAsDirty(category.entityType, now)
                    } else {
                        Log.d(TAG, "category=${category.collectionName} local=$localCount cloud=$cloudCount action=DELTA_PUSH")
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
            when (entityType) {
                "customer" -> {
                    val customers = db.customerDao().getAll().firstOrNull() ?: emptyList()
                    customers.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${customers.size} customers as dirty")
                }
                "supplier" -> {
                    val suppliers = db.supplierDao().getAll().firstOrNull() ?: emptyList()
                    suppliers.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${suppliers.size} suppliers as dirty")
                }
                "agent" -> {
                    val agents = db.agentDao().getAll().firstOrNull() ?: emptyList()
                    agents.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${agents.size} agents as dirty")
                }
                "carType" -> {
                    val carTypes = db.carTypeDao().getAll().firstOrNull() ?: emptyList()
                    carTypes.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${carTypes.size} carTypes as dirty")
                }
                "branch" -> {
                    // Branches need special handling - get all suppliers first
                    val suppliers = db.supplierDao().getAll().firstOrNull() ?: emptyList()
                    var branchCount = 0
                    suppliers.forEach { supplier ->
                        val branches = db.branchDao().getBySupplier(supplier.id).firstOrNull() ?: emptyList()
                        branches.forEach { branch ->
                            syncQueueDao.markDirty(entityType, branch.id, lastDirtyAt)
                            branchCount++
                        }
                    }
                    Log.d(TAG, "Marked $branchCount branches as dirty")
                }
                "reservation" -> {
                    val reservations = db.reservationDao().getAll().firstOrNull() ?: emptyList()
                    reservations.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${reservations.size} reservations as dirty")
                }
                "payment" -> {
                    // Payments are linked to reservations
                    val reservations = db.reservationDao().getAll().firstOrNull() ?: emptyList()
                    var paymentCount = 0
                    reservations.forEach { reservation ->
                        val payments = db.paymentDao().getForReservation(reservation.id).firstOrNull() ?: emptyList()
                        payments.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                        paymentCount += payments.size
                    }
                    Log.d(TAG, "Marked $paymentCount payments as dirty")
                }
                "commissionRule" -> {
                    val rules = db.commissionRuleDao().getAll().firstOrNull() ?: emptyList()
                    rules.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${rules.size} commissionRules as dirty")
                }
                "cardStub" -> {
                    // CardStubs are linked to reservations
                    val reservations = db.reservationDao().getAll().firstOrNull() ?: emptyList()
                    var stubCount = 0
                    reservations.forEach { reservation ->
                        val stubs = db.cardStubDao().getForReservation(reservation.id).firstOrNull() ?: emptyList()
                        stubs.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                        stubCount += stubs.size
                    }
                    Log.d(TAG, "Marked $stubCount cardStubs as dirty")
                }
                "request" -> {
                    val requests = db.requestDao().getAll().firstOrNull() ?: emptyList()
                    requests.forEach { syncQueueDao.markDirty(entityType, it.id, lastDirtyAt) }
                    Log.d(TAG, "Marked ${requests.size} requests as dirty")
                }
                "carSale" -> {
                    val sales = db.carSaleDao().getAll().firstOrNull() ?: emptyList()
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
    
    private suspend fun processSyncQueue(): Int {
        val dirtyItems = syncQueueDao.getDirtyItems(limit = 100)
        if (dirtyItems.isEmpty()) {
            Log.d(TAG, "No dirty items to sync")
            return 0
        }
        
        Log.d(TAG, "Processing ${dirtyItems.size} dirty items")
        
        var syncedCount = 0
        for (item in dirtyItems) {
            if (syncSingleItem(item)) {
                syncedCount++
            }
        }
        
        return syncedCount
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
        val customer = db.customerDao().getById(item.entityId).firstOrNull()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=customer, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced customer id=${item.entityId}")
        return true
    }
    
    private suspend fun syncSupplier(item: SyncQueueEntity): Boolean {
        val supplier = db.supplierDao().getById(item.entityId).firstOrNull()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=supplier, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced supplier id=${item.entityId}")
        return true
    }
    
    private suspend fun syncAgent(item: SyncQueueEntity): Boolean {
        val agent = db.agentDao().getAll().firstOrNull()?.find { it.id == item.entityId }
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=agent, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced agent id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCarType(item: SyncQueueEntity): Boolean {
        val carType = db.carTypeDao().getAll().firstOrNull()?.find { it.id == item.entityId }
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=carType, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced carType id=${item.entityId}")
        return true
    }
    
    private suspend fun syncBranch(item: SyncQueueEntity): Boolean {
        val branches = db.branchDao().getBySupplier(0L).firstOrNull() ?: emptyList()
        val branch = branches.find { it.id == item.entityId }
        if (branch == null) {
            // Try to find by searching all suppliers
            val allSuppliers = db.supplierDao().getAll().firstOrNull() ?: emptyList()
            val found = allSuppliers.firstOrNull()?.let { supplier ->
                db.branchDao().getBySupplier(supplier.id).firstOrNull()?.find { it.id == item.entityId }
            }
            if (found == null) {
                Log.w(TAG, "Branch ${item.entityId} not found, skipping")
                syncQueueDao.markSynced(item.id, "SUCCESS")
                return false
            }
            syncBranchToFirestore(found, item)
            return true
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=branch, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced branch id=${item.entityId}")
    }
    
    private suspend fun syncReservation(item: SyncQueueEntity): Boolean {
        val reservation = db.reservationDao().getById(item.entityId).firstOrNull()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=reservation, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced reservation id=${item.entityId}")
        return true
    }
    
    private suspend fun syncPayment(item: SyncQueueEntity): Boolean {
        // Payments are linked to reservations, need to find which reservation
        val allReservations = db.reservationDao().getAll().firstOrNull() ?: emptyList()
        var payment: Payment? = null
        for (reservation in allReservations) {
            val payments = db.paymentDao().getForReservation(reservation.id).firstOrNull() ?: emptyList()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=payment, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced payment id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCommissionRule(item: SyncQueueEntity): Boolean {
        val rules = db.commissionRuleDao().getAll().firstOrNull() ?: emptyList()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=commissionRule, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced commissionRule id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCardStub(item: SyncQueueEntity): Boolean {
        val allReservations = db.reservationDao().getAll().firstOrNull() ?: emptyList()
        var cardStub: CardStub? = null
        for (reservation in allReservations) {
            val stubs = db.cardStubDao().getForReservation(reservation.id).firstOrNull() ?: emptyList()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=cardStub, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced cardStub id=${item.entityId}")
        return true
    }
    
    private suspend fun syncRequest(item: SyncQueueEntity): Boolean {
        val requests = db.requestDao().getAll().firstOrNull() ?: emptyList()
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
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=request, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced request id=${item.entityId}")
        return true
    }
    
    private suspend fun syncCarSale(item: SyncQueueEntity): Boolean {
        val sales = db.carSaleDao().getAll().firstOrNull() ?: emptyList()
        val sale = sales.find { it.id == item.entityId }
        if (sale == null) {
            Log.w(TAG, "CarSale ${item.entityId} not found, skipping")
            syncQueueDao.markSynced(item.id, "SUCCESS")
            return false
        }
        
        val data = mapOf(
            "id" to sale.id,
            "firstName" to sale.firstName,
            "lastName" to sale.lastName,
            "phone" to sale.phone,
            "carTypeName" to sale.carTypeName,
            "saleDate" to sale.saleDate,
            "salePrice" to sale.salePrice,
            "commissionPrice" to sale.commissionPrice,
            "notes" to sale.notes,
            "createdAt" to sale.createdAt,
            "updatedAt" to sale.updatedAt
        )
        
        val collectionPath = "carSales"
        val documentId = item.entityId.toString()
        val docRef = firestore.collection(collectionPath).document(documentId)
        Log.d(TAG, "Writing to Firestore path=${docRef.path}, collection=$collectionPath, entityType=carSale, localId=${item.entityId}")
        
        docRef.set(data).await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced carSale id=${item.entityId}")
        return true
    }
}

