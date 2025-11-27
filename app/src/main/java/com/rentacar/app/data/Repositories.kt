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
    
    fun getAllReservations(): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getAll(uid)
    }
    fun getOpenReservations(): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getOpen(uid)
    }
    fun getReservation(id: Long): Flow<Reservation?> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(null)
        return reservationDao.getById(id, uid)
    }
    fun getByCustomer(customerId: Long): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getByCustomer(customerId, uid)
    }
    fun getBySupplier(supplierId: Long): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getBySupplier(supplierId, uid)
    }
    fun getByAgent(agentId: Long): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getByAgent(agentId, uid)
    }
    fun getByBranch(branchId: Long): Flow<List<Reservation>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return reservationDao.getByBranch(branchId, uid)
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

    fun getPayments(reservationId: Long): Flow<List<Payment>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return paymentDao.getForReservation(reservationId, uid)
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
    
    fun suppliers(): Flow<List<Supplier>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return supplierDao.getAll(uid)
    }
    fun branchesBySupplier(supplierId: Long): Flow<List<Branch>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return branchDao.getBySupplier(supplierId, uid)
    }
    fun carTypes(): Flow<List<CarType>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return carTypeDao.getAll(uid)
    }
    fun agents(): Flow<List<Agent>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return agentDao.getAll(uid)
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
    
    fun list(): Flow<List<Supplier>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return supplierDao.getAll(uid)
    }
    fun getById(id: Long): Flow<Supplier?> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(null)
        return supplierDao.getById(id, uid)
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
    fun getById(id: Long): Flow<Customer?> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(null)
        return customerDao.getById(id, uid)
    }
    fun listActive(): Flow<List<Customer>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return customerDao.listActive(uid)
    }
    fun search(query: String): Flow<List<Customer>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return customerDao.search("%$query%", uid)
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
    
    fun list(): Flow<List<Request>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return requestDao.getAll(uid)
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
    
    fun list(): Flow<List<CarSale>> {
        val uid = CurrentUserProvider.getCurrentUid() ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        return carSaleDao.getAll(uid)
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

