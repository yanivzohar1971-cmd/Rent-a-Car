package com.rentacar.app.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import com.rentacar.app.data.sync.SyncDirtyMarker
import com.rentacar.app.data.auth.CurrentUserProvider

class ReservationRepository(
    private val reservationDao: ReservationDao,
    private val paymentDao: PaymentDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    fun getAllReservationsForUser(userUid: String): Flow<List<Reservation>> {
        return reservationDao.getAll(userUid)
    }
    fun getOpenReservationsForUser(userUid: String): Flow<List<Reservation>> {
        android.util.Log.d("ReservationRepository", "getOpenReservationsForUser() called, userUid=$userUid")
        return reservationDao.getOpen(userUid).also { flow ->
            android.util.Log.d("ReservationRepository", "getOpenReservationsForUser() returning flow for uid=$userUid (filtered by isClosed=0)")
        }
    }
    fun getReservationForUser(id: Long, userUid: String): Flow<Reservation?> {
        return reservationDao.getById(id, userUid)
    }
    fun getByCustomerForUser(customerId: Long, userUid: String): Flow<List<Reservation>> {
        return reservationDao.getByCustomer(customerId, userUid)
    }
    fun getBySupplierForUser(supplierId: Long, userUid: String): Flow<List<Reservation>> {
        return reservationDao.getBySupplier(supplierId, userUid)
    }
    fun getByAgentForUser(agentId: Long, userUid: String): Flow<List<Reservation>> {
        return reservationDao.getByAgent(agentId, userUid)
    }
    fun getByBranchForUser(branchId: Long, userUid: String): Flow<List<Reservation>> {
        return reservationDao.getByBranch(branchId, userUid)
    }
    suspend fun upsert(reservation: Reservation): Long {
        val uid = getCurrentUid()
        val reservationWithUid = if (reservation.userUid == null) reservation.copy(userUid = uid) else reservation
        val id = reservationDao.upsert(reservationWithUid)
        syncDirtyMarker?.markReservationDirty(id)
        return id
    }
    suspend fun update(reservation: Reservation) {
        android.util.Log.d("ReservationRepository", "Updating reservation in database: ${reservation.id}")
        val uid = getCurrentUid()
        val reservationWithUid = if (reservation.userUid == null) reservation.copy(userUid = uid) else reservation
        reservationDao.update(reservationWithUid)
        syncDirtyMarker?.markReservationDirty(reservation.id)
        android.util.Log.d("ReservationRepository", "Database update completed: ${reservation.id}")
    }

    fun getPaymentsForUser(reservationId: Long, userUid: String): Flow<List<Payment>> {
        return paymentDao.getForReservation(reservationId, userUid)
    }
    suspend fun addPayment(payment: Payment): Long {
        val uid = getCurrentUid()
        val paymentWithUid = if (payment.userUid == null) payment.copy(userUid = uid) else payment
        val id = paymentDao.upsert(paymentWithUid)
        syncDirtyMarker?.markPaymentDirty(id)
        return id
    }
}

class CatalogRepository(
    private val supplierDao: SupplierDao,
    private val branchDao: BranchDao,
    private val carTypeDao: CarTypeDao,
    private val agentDao: AgentDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    fun suppliersForUser(userUid: String): Flow<List<Supplier>> {
        android.util.Log.d("CatalogRepository", "suppliersForUser() called, userUid=$userUid")
        return supplierDao.getAll(userUid).also { flow ->
            android.util.Log.d("CatalogRepository", "suppliersForUser() returning flow for uid=$userUid")
        }
    }
    fun branchesBySupplierForUser(supplierId: Long, userUid: String): Flow<List<Branch>> {
        return branchDao.getBySupplier(supplierId, userUid)
    }
    fun carTypesForUser(userUid: String): Flow<List<CarType>> {
        return carTypeDao.getAll(userUid)
    }
    fun agentsForUser(userUid: String): Flow<List<Agent>> {
        return agentDao.getAll(userUid)
    }

    suspend fun upsertSupplier(supplier: Supplier): Long {
        val uid = getCurrentUid()
        val supplierWithUid = if (supplier.userUid == null) supplier.copy(userUid = uid) else supplier
        val id = supplierDao.upsert(supplierWithUid, uid)
        syncDirtyMarker?.markSupplierDirty(id)
        return id
    }
    suspend fun upsertBranch(branch: Branch): Long {
        val uid = getCurrentUid()
        val branchWithUid = if (branch.userUid == null) branch.copy(userUid = uid) else branch
        val id = branchDao.upsert(branchWithUid, uid)
        syncDirtyMarker?.markBranchDirty(id)
        return id
    }
    suspend fun findBranchBySupplierAndName(supplierId: Long, name: String): Branch? {
        val uid = getCurrentUid()
        return branchDao.findBySupplierAndName(supplierId, name, uid)
    }
    suspend fun deleteBranch(id: Long): Int {
        val uid = getCurrentUid()
        return branchDao.delete(id, uid)
    }
    suspend fun deleteAllBranches(): Int {
        val uid = getCurrentUid()
        return branchDao.deleteAll(uid)
    }
    suspend fun upsertAgent(agent: Agent): Long {
        val uid = getCurrentUid()
        val agentWithUid = if (agent.userUid == null) agent.copy(userUid = uid) else agent
        val id = agentDao.upsert(agentWithUid)
        syncDirtyMarker?.markAgentDirty(id)
        return id
    }
    suspend fun deleteAgent(id: Long): Int {
        val uid = getCurrentUid()
        return agentDao.delete(id, uid)
    }
    
    suspend fun upsertCarType(carType: CarType): Long {
        val uid = getCurrentUid()
        val carTypeWithUid = if (carType.userUid == null) carType.copy(userUid = uid) else carType
        val id = carTypeDao.upsert(carTypeWithUid)
        syncDirtyMarker?.markCarTypeDirty(id)
        return id
    }
}

class SupplierRepository(
    private val supplierDao: SupplierDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    fun listForUser(userUid: String): Flow<List<Supplier>> {
        android.util.Log.d("SupplierRepository", "listForUser() called, userUid=$userUid")
        return supplierDao.getAll(userUid).also { flow ->
            android.util.Log.d("SupplierRepository", "listForUser() returning flow for uid=$userUid")
        }
    }
    fun getByIdForUser(id: Long, userUid: String): Flow<Supplier?> {
        return supplierDao.getById(id, userUid)
    }
    suspend fun upsert(supplier: Supplier): Long {
        val uid = getCurrentUid()
        val supplierWithUid = if (supplier.userUid == null) supplier.copy(userUid = uid) else supplier
        val id = supplierDao.upsert(supplierWithUid, uid)
        syncDirtyMarker?.markSupplierDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int {
        val uid = getCurrentUid()
        return supplierDao.delete(id, uid)
    }
}

class CustomerRepository(
    private val customerDao: CustomerDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    suspend fun upsert(customer: Customer): Long {
        val uid = getCurrentUid()
        val customerWithUid = if (customer.userUid == null) customer.copy(userUid = uid) else customer
        val id = customerDao.upsert(customerWithUid)
        syncDirtyMarker?.markCustomerDirty(id)
        return id
    }
    suspend fun existsByTz(tz: String, excludeId: Long = 0L): Boolean {
        val uid = getCurrentUid()
        return (customerDao.findByTzExcluding(tz, excludeId, uid) != null)
    }
    fun getByIdForUser(id: Long, userUid: String): Flow<Customer?> {
        return customerDao.getById(id, userUid)
    }
    fun listActiveForUser(userUid: String): Flow<List<Customer>> {
        android.util.Log.d("CustomerRepository", "listActiveForUser() called, userUid=$userUid")
        return customerDao.listActive(userUid).also { flow ->
            android.util.Log.d("CustomerRepository", "listActiveForUser() returning flow for uid=$userUid (filtered by active=1)")
        }
    }
    
    fun listAllForUser(userUid: String): Flow<List<Customer>> {
        android.util.Log.d("CustomerRepository", "listAllForUser() called, userUid=$userUid")
        return customerDao.getAll(userUid).also { flow ->
            android.util.Log.d("CustomerRepository", "listAllForUser() returning flow for uid=$userUid (all customers)")
        }
    }
    fun searchForUser(query: String, userUid: String): Flow<List<Customer>> {
        return customerDao.search("%$query%", userUid)
    }
    suspend fun delete(id: Long): Int {
        val uid = getCurrentUid()
        return customerDao.delete(id, uid)
    }
}


class RequestRepository(
    private val requestDao: RequestDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    fun listForUser(userUid: String): Flow<List<Request>> {
        return requestDao.getAll(userUid)
    }
    suspend fun upsert(request: Request): Long {
        val uid = getCurrentUid()
        val requestWithUid = if (request.userUid == null) request.copy(userUid = uid) else request
        val id = requestDao.upsert(requestWithUid)
        syncDirtyMarker?.markRequestDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int {
        val uid = getCurrentUid()
        return requestDao.delete(id, uid)
    }
}


class CarSaleRepository(
    private val db: AppDatabase,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private val carSaleDao = db.carSaleDao()
    private val commissionPaymentDao = db.carSaleCommissionPaymentDao()

    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()

    fun listForUser(userUid: String): Flow<List<CarSale>> {
        return carSaleDao.getAll(userUid)
    }

    /**
     * Reactive map of carSaleId -> total paid from commission payment rows (no N+1).
     * Sales with no payment rows are absent from the map (treat as 0).
     */
    fun paidTotalsBySale(userUid: String): Flow<Map<Long, Double>> {
        return commissionPaymentDao.observePaidTotalsBySale(userUid).map { rows ->
            rows.associate { it.carSaleId to it.totalPaid }
        }
    }

    fun paymentsForSale(carSaleId: Long, userUid: String): Flow<List<CarSaleCommissionPayment>> {
        return commissionPaymentDao.getForSale(carSaleId, userUid)
    }

    suspend fun getPaymentsForSaleOnce(carSaleId: Long): List<CarSaleCommissionPayment> {
        val uid = getCurrentUid()
        return commissionPaymentDao.getForSaleOnce(carSaleId, uid)
    }

    /**
     * Read-only preview of commission-alignment payments for the current user.
     */
    suspend fun previewCommissionAlignment(): CarSaleCommissionAlignmentLogic.AlignmentPreview {
        val uid = getCurrentUid()
        val sales = carSaleDao.getAll(uid).first()
        val paidMap = commissionPaymentDao.getPaidTotalsBySaleOnce(uid)
            .associate { it.carSaleId to it.totalPaid }
        val inputs = sales.map { sale ->
            CarSaleCommissionAlignmentLogic.SaleAlignmentInput(
                carSaleId = sale.id,
                commissionPrice = sale.commissionPrice,
                totalPaid = paidMap[sale.id] ?: 0.0,
                saleDate = sale.saleDate
            )
        }
        return CarSaleCommissionAlignmentLogic.buildPreview(inputs)
    }

    /**
     * Inserts missing commission-payment rows so each current-user sale becomes fully paid.
     * Idempotent: re-running after alignment inserts nothing.
     * Does not modify existing payments or [CarSale.commissionPrice].
     */
    suspend fun alignCommissionPayments(): CarSaleCommissionAlignmentLogic.AlignmentPreview {
        val uid = getCurrentUid()
        val now = System.currentTimeMillis()
        lateinit var result: CarSaleCommissionAlignmentLogic.AlignmentPreview
        db.withTransaction {
            val sales = carSaleDao.getAll(uid).first()
            val paidMap = commissionPaymentDao.getPaidTotalsBySaleOnce(uid)
                .associate { it.carSaleId to it.totalPaid }
            val inputs = sales.map { sale ->
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(
                    carSaleId = sale.id,
                    commissionPrice = sale.commissionPrice,
                    totalPaid = paidMap[sale.id] ?: 0.0,
                    saleDate = sale.saleDate
                )
            }
            val preview = CarSaleCommissionAlignmentLogic.buildPreview(inputs, now)
            val dirtyIds = mutableListOf<Long>()
            for (plan in preview.plans) {
                val id = commissionPaymentDao.insert(
                    CarSaleCommissionPayment(
                        carSaleId = plan.carSaleId,
                        amount = plan.amount,
                        paymentDate = plan.paymentDate,
                        createdAt = now,
                        updatedAt = now,
                        userUid = uid
                    )
                )
                dirtyIds += id
            }
            result = preview
            dirtyIds.forEach { syncDirtyMarker?.markCarSaleCommissionPaymentDirty(it) }
        }
        return result
    }

    suspend fun upsert(sale: CarSale): Long {
        val uid = getCurrentUid()
        val saleWithUid = if (sale.userUid == null) sale.copy(userUid = uid) else sale
        val upsertResult = carSaleDao.upsert(saleWithUid)
        val persistedSaleId = CarSaleUpsertId.resolvePersistedId(saleWithUid.id, upsertResult)
        require(persistedSaleId > 0L) { "Failed to persist CarSale" }
        syncDirtyMarker?.markCarSaleDirty(persistedSaleId)
        return persistedSaleId
    }

    /**
     * Persist a car sale together with its commission payment drafts.
     * Drafts with [CarSaleCommissionPaymentDraft.id] == 0 are inserted after the parent ID is known.
     * Drafts marked [CarSaleCommissionPaymentDraft.markedForDeletion] are deleted.
     * Existing drafts are updated in place (preserves createdAt).
     */
    suspend fun saveSaleWithCommissionPayments(
        sale: CarSale,
        paymentDrafts: List<CarSaleCommissionPaymentDraft>
    ): Long {
        val uid = getCurrentUid()
        val activePayments = paymentDrafts.filter { !it.markedForDeletion }
        val paidAmounts = activePayments.map { it.amount }

        when (
            val commissionCheck = CarSaleCommissionPaymentLogic.validateCommissionAgainstPaid(
                sale.commissionPrice,
                CarSaleCommissionPaymentLogic.totalPaid(paidAmounts)
            )
        ) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error ->
                throw IllegalArgumentException(commissionCheck.messageHe)
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        when (
            val sumCheck = CarSaleCommissionPaymentLogic.validatePaymentsDoNotExceedCommission(
                sale.commissionPrice,
                paidAmounts
            )
        ) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error ->
                throw IllegalArgumentException(sumCheck.messageHe)
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        for (draft in activePayments) {
            when (
                val amountCheck = CarSaleCommissionPaymentLogic.validatePaymentAmount(
                    draft.amount,
                    sale.commissionPrice,
                    // Per-row remaining check is done via total; individual rows must be > 0
                    alreadyPaidExcludingThis = 0.0
                )
            ) {
                is CarSaleCommissionPaymentLogic.ValidationResult.Error -> {
                    // Re-validate amount > 0 only here; over-remaining covered by sum check
                    if (draft.amount <= 0.0) throw IllegalArgumentException(amountCheck.messageHe)
                }
                CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
            }
            when (val dateCheck = CarSaleCommissionPaymentLogic.validatePaymentDate(draft.paymentDate)) {
                is CarSaleCommissionPaymentLogic.ValidationResult.Error ->
                    throw IllegalArgumentException(dateCheck.messageHe)
                CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
            }
        }

        val saleWithUid = if (sale.userUid == null) sale.copy(userUid = uid) else sale
        val now = System.currentTimeMillis()
        val dirtyPaymentIds = mutableListOf<Long>()

        val saleId = db.withTransaction {
            val upsertResult = carSaleDao.upsert(saleWithUid)
            val persistedSaleId = CarSaleUpsertId.resolvePersistedId(saleWithUid.id, upsertResult)
            require(persistedSaleId > 0L) { "Failed to persist CarSale" }

            for (draft in paymentDrafts.filter { it.markedForDeletion && it.id > 0L }) {
                commissionPaymentDao.delete(draft.id, uid)
            }

            for (draft in activePayments) {
                if (draft.id > 0L) {
                    val existing = commissionPaymentDao.getById(draft.id, uid)
                    val updated = CarSaleCommissionPayment(
                        id = draft.id,
                        carSaleId = persistedSaleId,
                        amount = draft.amount,
                        paymentDate = draft.paymentDate,
                        createdAt = existing?.createdAt ?: draft.createdAt,
                        updatedAt = now,
                        userUid = uid
                    )
                    val changed = existing == null ||
                        existing.amount != draft.amount ||
                        existing.paymentDate != draft.paymentDate ||
                        existing.carSaleId != persistedSaleId
                    if (changed) {
                        commissionPaymentDao.update(updated)
                        dirtyPaymentIds += draft.id
                    }
                } else {
                    val insertedId = commissionPaymentDao.insert(
                        CarSaleCommissionPayment(
                            carSaleId = persistedSaleId,
                            amount = draft.amount,
                            paymentDate = draft.paymentDate,
                            createdAt = draft.createdAt.takeIf { it > 0L } ?: now,
                            updatedAt = now,
                            userUid = uid
                        )
                    )
                    dirtyPaymentIds += insertedId
                }
            }
            persistedSaleId
        }

        syncDirtyMarker?.markCarSaleDirty(saleId)
        dirtyPaymentIds.forEach { syncDirtyMarker?.markCarSaleCommissionPaymentDirty(it) }
        return saleId
    }

    suspend fun delete(id: Long): Int {
        val uid = getCurrentUid()
        // Explicit cleanup for clarity; FK CASCADE also removes payment rows.
        return db.withTransaction {
            commissionPaymentDao.deleteForSale(id, uid)
            carSaleDao.delete(id, uid)
        }
    }
}

/**
 * UI / ViewModel draft for a commission payment before or after persistence.
 */
data class CarSaleCommissionPaymentDraft(
    val draftKey: String,
    val id: Long = 0L,
    val amount: Double,
    val paymentDate: Long,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val markedForDeletion: Boolean = false
) {
    companion object {
        fun fromEntity(entity: CarSaleCommissionPayment): CarSaleCommissionPaymentDraft =
            CarSaleCommissionPaymentDraft(
                draftKey = "db-${entity.id}",
                id = entity.id,
                amount = entity.amount,
                paymentDate = entity.paymentDate,
                createdAt = entity.createdAt,
                updatedAt = entity.updatedAt,
                markedForDeletion = false
            )

        fun newDraft(amount: Double, paymentDate: Long): CarSaleCommissionPaymentDraft {
            val now = System.currentTimeMillis()
            return CarSaleCommissionPaymentDraft(
                draftKey = "new-$now-${kotlin.random.Random.nextInt(100000)}",
                id = 0L,
                amount = amount,
                paymentDate = paymentDate,
                createdAt = now,
                updatedAt = now,
                markedForDeletion = false
            )
        }
    }
}

