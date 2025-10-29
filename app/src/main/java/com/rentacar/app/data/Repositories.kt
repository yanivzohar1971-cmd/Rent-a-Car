package com.rentacar.app.data

import kotlinx.coroutines.flow.Flow

class ReservationRepository(
    private val reservationDao: ReservationDao,
    private val paymentDao: PaymentDao
) {
    fun getAllReservations(): Flow<List<Reservation>> = reservationDao.getAll()
    fun getOpenReservations(): Flow<List<Reservation>> = reservationDao.getOpen()
    fun getReservation(id: Long): Flow<Reservation?> = reservationDao.getById(id)
    fun getByCustomer(customerId: Long): Flow<List<Reservation>> = reservationDao.getByCustomer(customerId)
    fun getBySupplier(supplierId: Long): Flow<List<Reservation>> = reservationDao.getBySupplier(supplierId)
    fun getByAgent(agentId: Long): Flow<List<Reservation>> = reservationDao.getByAgent(agentId)
    fun getByBranch(branchId: Long): Flow<List<Reservation>> = reservationDao.getByBranch(branchId)
    suspend fun upsert(reservation: Reservation): Long = reservationDao.upsert(reservation)
    suspend fun update(reservation: Reservation) {
        android.util.Log.d("ReservationRepository", "Updating reservation in database: ${reservation.id}")
        reservationDao.update(reservation)
        android.util.Log.d("ReservationRepository", "Database update completed: ${reservation.id}")
    }

    fun getPayments(reservationId: Long): Flow<List<Payment>> = paymentDao.getForReservation(reservationId)
    suspend fun addPayment(payment: Payment): Long = paymentDao.upsert(payment)
}

class CatalogRepository(
    private val supplierDao: SupplierDao,
    private val branchDao: BranchDao,
    private val carTypeDao: CarTypeDao,
    private val agentDao: AgentDao
) {
    fun suppliers(): Flow<List<Supplier>> = supplierDao.getAll()
    fun branchesBySupplier(supplierId: Long): Flow<List<Branch>> = branchDao.getBySupplier(supplierId)
    fun carTypes(): Flow<List<CarType>> = carTypeDao.getAll()
    fun agents(): Flow<List<Agent>> = agentDao.getAll()

    suspend fun upsertSupplier(supplier: Supplier): Long = supplierDao.upsert(supplier)
    suspend fun upsertBranch(branch: Branch): Long = branchDao.upsert(branch)
    suspend fun findBranchBySupplierAndName(supplierId: Long, name: String): Branch? = branchDao.findBySupplierAndName(supplierId, name)
    suspend fun deleteBranch(id: Long): Int = branchDao.delete(id)
    suspend fun deleteAllBranches(): Int = branchDao.deleteAll()
    suspend fun upsertAgent(agent: Agent): Long = agentDao.upsert(agent)
    suspend fun deleteAgent(id: Long): Int = agentDao.delete(id)
}

class SupplierRepository(private val supplierDao: SupplierDao) {
    fun list(): Flow<List<Supplier>> = supplierDao.getAll()
    fun getById(id: Long): Flow<Supplier?> = supplierDao.getById(id)
    suspend fun upsert(supplier: Supplier): Long = supplierDao.upsert(supplier)
    suspend fun delete(id: Long): Int = supplierDao.delete(id)
}

class CustomerRepository(
    private val customerDao: CustomerDao
) {
    suspend fun upsert(customer: Customer): Long = customerDao.upsert(customer)
    suspend fun existsByTz(tz: String, excludeId: Long = 0L): Boolean = (customerDao.findByTzExcluding(tz, excludeId) != null)
    fun getById(id: Long): Flow<Customer?> = customerDao.getById(id)
    fun listActive(): Flow<List<Customer>> = customerDao.listActive()
    fun search(query: String): Flow<List<Customer>> = customerDao.search("%$query%")
    suspend fun delete(id: Long): Int = customerDao.delete(id)
}


class RequestRepository(
    private val requestDao: RequestDao
) {
    fun list(): Flow<List<Request>> = requestDao.getAll()
    suspend fun upsert(request: Request): Long = requestDao.upsert(request)
    suspend fun delete(id: Long): Int = requestDao.delete(id)
}


class CarSaleRepository(
    private val carSaleDao: CarSaleDao
) {
    fun list(): Flow<List<CarSale>> = carSaleDao.getAll()
    suspend fun upsert(sale: CarSale): Long = carSaleDao.upsert(sale)
    suspend fun delete(id: Long): Int = carSaleDao.delete(id)
}

