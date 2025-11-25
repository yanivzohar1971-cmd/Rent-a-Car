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
    private val firestore by lazy { FirebaseFirestore.getInstance() }
    private val syncQueueDao by lazy { db.syncQueueDao() }
    private val gson = Gson()
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val syncedCount = processSyncQueue()
            val output = workDataOf("syncedCount" to syncedCount)
            Log.d(TAG, "Sync completed: syncedCount=$syncedCount")
            Result.success(output)
        } catch (t: Throwable) {
            Log.e(TAG, "Unexpected error in delta sync", t)
            Result.retry()
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
        
        firestore.collection("customers")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("suppliers")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("agents")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("carTypes")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("branches")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("reservations")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("payments")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("commissionRules")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("cardStubs")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("requests")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
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
        
        firestore.collection("carSales")
            .document(item.entityId.toString())
            .set(data)
            .await()
        
        syncQueueDao.markSynced(item.id, "SUCCESS")
        Log.d(TAG, "Synced carSale id=${item.entityId}")
        return true
    }
}

