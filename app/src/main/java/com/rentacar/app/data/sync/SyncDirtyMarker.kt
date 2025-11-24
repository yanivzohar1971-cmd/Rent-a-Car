package com.rentacar.app.data.sync

import android.util.Log

class SyncDirtyMarker(
    private val syncQueueDao: SyncQueueDao
) {
    companion object {
        private const val TAG = "sync_dirty"
    }
    
    suspend fun markCustomerDirty(customerId: Long) = mark("customer", customerId)
    suspend fun markSupplierDirty(supplierId: Long) = mark("supplier", supplierId)
    suspend fun markAgentDirty(agentId: Long) = mark("agent", agentId)
    suspend fun markCarTypeDirty(carTypeId: Long) = mark("carType", carTypeId)
    suspend fun markBranchDirty(branchId: Long) = mark("branch", branchId)
    suspend fun markReservationDirty(reservationId: Long) = mark("reservation", reservationId)
    suspend fun markPaymentDirty(paymentId: Long) = mark("payment", paymentId)
    suspend fun markCommissionRuleDirty(ruleId: Long) = mark("commissionRule", ruleId)
    suspend fun markCardStubDirty(cardStubId: Long) = mark("cardStub", cardStubId)
    suspend fun markRequestDirty(requestId: Long) = mark("request", requestId)
    suspend fun markCarSaleDirty(carSaleId: Long) = mark("carSale", carSaleId)
    
    private suspend fun mark(entityType: String, entityId: Long) {
        try {
            syncQueueDao.markDirty(entityType, entityId, System.currentTimeMillis())
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to mark dirty: type=$entityType id=$entityId", t)
        }
    }
}

