package com.rentacar.app.data

import kotlinx.coroutines.flow.Flow
import com.rentacar.app.data.sync.SyncDirtyMarker

class ReservationRepository(
    private val reservationDao: ReservationDao,
    private val paymentDao: PaymentDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    fun getAllReservations(): Flow<List<Reservation>> = reservationDao.getAll()
    fun getOpenReservations(): Flow<List<Reservation>> = reservationDao.getOpen()
    fun getReservation(id: Long): Flow<Reservation?> = reservationDao.getById(id)
    fun getByCustomer(customerId: Long): Flow<List<Reservation>> = reservationDao.getByCustomer(customerId)
    fun getBySupplier(supplierId: Long): Flow<List<Reservation>> = reservationDao.getBySupplier(supplierId)
    fun getByAgent(agentId: Long): Flow<List<Reservation>> = reservationDao.getByAgent(agentId)
    fun getByBranch(branchId: Long): Flow<List<Reservation>> = reservationDao.getByBranch(branchId)
    suspend fun upsert(reservation: Reservation): Long {
        val id = reservationDao.upsert(reservation)
        syncDirtyMarker?.markReservationDirty(id)
        return id
    }
    suspend fun update(reservation: Reservation) {
        android.util.Log.d("ReservationRepository", "Updating reservation in database: ${reservation.id}")
        reservationDao.update(reservation)
        syncDirtyMarker?.markReservationDirty(reservation.id)
        android.util.Log.d("ReservationRepository", "Database update completed: ${reservation.id}")
    }

    fun getPayments(reservationId: Long): Flow<List<Payment>> = paymentDao.getForReservation(reservationId)
    suspend fun addPayment(payment: Payment): Long {
        val id = paymentDao.upsert(payment)
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
    fun suppliers(): Flow<List<Supplier>> = supplierDao.getAll()
    fun branchesBySupplier(supplierId: Long): Flow<List<Branch>> = branchDao.getBySupplier(supplierId)
    fun carTypes(): Flow<List<CarType>> = carTypeDao.getAll()
    fun agents(): Flow<List<Agent>> = agentDao.getAll()

    suspend fun upsertSupplier(supplier: Supplier): Long {
        val id = supplierDao.upsert(supplier)
        syncDirtyMarker?.markSupplierDirty(id)
        return id
    }
    suspend fun upsertBranch(branch: Branch): Long {
        val id = branchDao.upsert(branch)
        syncDirtyMarker?.markBranchDirty(id)
        return id
    }
    suspend fun findBranchBySupplierAndName(supplierId: Long, name: String): Branch? = branchDao.findBySupplierAndName(supplierId, name)
    suspend fun deleteBranch(id: Long): Int = branchDao.delete(id)
    suspend fun deleteAllBranches(): Int = branchDao.deleteAll()
    suspend fun upsertAgent(agent: Agent): Long {
        val id = agentDao.upsert(agent)
        syncDirtyMarker?.markAgentDirty(id)
        return id
    }
    suspend fun deleteAgent(id: Long): Int = agentDao.delete(id)
    
    suspend fun upsertCarType(carType: CarType): Long {
        val id = carTypeDao.upsert(carType)
        syncDirtyMarker?.markCarTypeDirty(id)
        return id
    }
}

class SupplierRepository(
    private val supplierDao: SupplierDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    fun list(): Flow<List<Supplier>> = supplierDao.getAll()
    fun getById(id: Long): Flow<Supplier?> = supplierDao.getById(id)
    suspend fun upsert(supplier: Supplier): Long {
        val id = supplierDao.upsert(supplier)
        syncDirtyMarker?.markSupplierDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int = supplierDao.delete(id)
}

class CustomerRepository(
    private val customerDao: CustomerDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    suspend fun upsert(customer: Customer): Long {
        val id = customerDao.upsert(customer)
        syncDirtyMarker?.markCustomerDirty(id)
        return id
    }
    suspend fun existsByTz(tz: String, excludeId: Long = 0L): Boolean = (customerDao.findByTzExcluding(tz, excludeId) != null)
    fun getById(id: Long): Flow<Customer?> = customerDao.getById(id)
    fun listActive(): Flow<List<Customer>> = customerDao.listActive()
    fun search(query: String): Flow<List<Customer>> = customerDao.search("%$query%")
    suspend fun delete(id: Long): Int = customerDao.delete(id)
}


class RequestRepository(
    private val requestDao: RequestDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    fun list(): Flow<List<Request>> = requestDao.getAll()
    suspend fun upsert(request: Request): Long {
        val id = requestDao.upsert(request)
        syncDirtyMarker?.markRequestDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int = requestDao.delete(id)
}


class CarSaleRepository(
    private val carSaleDao: CarSaleDao,
    private val syncDirtyMarker: SyncDirtyMarker? = null
) {
    fun list(): Flow<List<CarSale>> = carSaleDao.getAll()
    suspend fun upsert(sale: CarSale): Long {
        val id = carSaleDao.upsert(sale)
        syncDirtyMarker?.markCarSaleDirty(id)
        return id
    }
    suspend fun delete(id: Long): Int = carSaleDao.delete(id)
}

