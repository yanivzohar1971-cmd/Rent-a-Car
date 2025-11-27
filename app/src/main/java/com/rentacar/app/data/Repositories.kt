package com.rentacar.app.data

import kotlinx.coroutines.flow.Flow
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
    private val carSaleDao: CarSaleDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    fun listForUser(userUid: String): Flow<List<CarSale>> {
        return carSaleDao.getAll(userUid)
    }
    suspend fun upsert(sale: CarSale): Long {
        val uid = getCurrentUid()
        val saleWithUid = if (sale.userUid == null) sale.copy(userUid = uid) else sale
        val id = carSaleDao.upsert(saleWithUid)
        syncDirtyMarker?.markCarSaleDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int {
        val uid = getCurrentUid()
        return carSaleDao.delete(id, uid)
    }
}

