package com.rentacar.app.agentapi.commands

import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.BranchDao
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleCommissionPayment
import com.rentacar.app.data.CarSaleCommissionPaymentDao
import com.rentacar.app.data.CarSaleDao
import com.rentacar.app.data.CarTypeDao
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerDao
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.Request
import com.rentacar.app.data.RequestRepository
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationDao
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierDao
import com.rentacar.app.data.SupplierRepository
import com.rentacar.app.data.sync.SyncDirtyMarker
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * AGENT-111: the narrow, synchronous data boundary used by [AgentDevRoomWriteCommitter].
 *
 * Every method is scoped by an explicit `userUid` taken from the prepared command (never from
 * request parameters). JVM tests use a fake; the AgentDev build uses [RepositoryAgentDevWritePorts].
 */
interface AgentDevWritePorts {
    fun insertCustomer(customer: Customer): Long
    fun supplierNameExists(name: String, userUid: String): Boolean
    fun insertSupplier(supplier: Supplier): Long
    fun insertRequest(request: Request): Long

    fun customerExists(id: Long, userUid: String): Boolean
    fun supplierExists(id: Long, userUid: String): Boolean
    fun branchBelongsToSupplier(branchId: Long, supplierId: Long, userUid: String): Boolean
    fun carTypeExists(id: Long, userUid: String): Boolean
    fun insertReservation(reservation: Reservation): Long
    fun findReservation(id: Long, userUid: String): Reservation?
    fun updateReservation(reservation: Reservation)

    fun findCarSale(id: Long, userUid: String): CarSale?
    fun commissionPaymentsForSale(carSaleId: Long, userUid: String): List<CarSaleCommissionPayment>
    fun insertCommissionPayment(payment: CarSaleCommissionPayment): Long
}

/**
 * Android implementation over the existing repositories/DAOs. It blocks (`runBlocking`) because
 * [RoomWriteCommitter.commit] is synchronous; it is only ever reached from the AgentDev build.
 *
 * Repositories fill `userUid` from `CurrentUserProvider`; each write here first asserts the command's
 * user equals [currentUid] so a command can never land under a different owner.
 */
class RepositoryAgentDevWritePorts(
    private val customers: CustomerRepository,
    private val suppliers: SupplierRepository,
    private val requests: RequestRepository,
    private val reservations: ReservationRepository,
    private val customerDao: CustomerDao,
    private val supplierDao: SupplierDao,
    private val branchDao: BranchDao,
    private val carTypeDao: CarTypeDao,
    private val reservationDao: ReservationDao,
    private val carSaleDao: CarSaleDao,
    private val commissionPaymentDao: CarSaleCommissionPaymentDao,
    private val syncDirtyMarker: SyncDirtyMarker?,
    private val currentUid: () -> String
) : AgentDevWritePorts {

    private fun requireOwner(userUid: String) {
        check(userUid == currentUid()) { "Command user does not match the signed-in AgentDev user" }
    }

    override fun insertCustomer(customer: Customer): Long {
        requireOwner(customer.userUid.orEmpty())
        return runBlocking { customers.upsert(customer) }
    }

    override fun supplierNameExists(name: String, userUid: String): Boolean =
        runBlocking { supplierDao.getIdByName(name, userUid) != null }

    override fun insertSupplier(supplier: Supplier): Long {
        requireOwner(supplier.userUid.orEmpty())
        return runBlocking { suppliers.upsert(supplier) }
    }

    override fun insertRequest(request: Request): Long {
        requireOwner(request.userUid.orEmpty())
        return runBlocking { requests.upsert(request) }
    }

    override fun customerExists(id: Long, userUid: String): Boolean =
        runBlocking { customerDao.getById(id, userUid).first() != null }

    override fun supplierExists(id: Long, userUid: String): Boolean =
        runBlocking { supplierDao.getById(id, userUid).first() != null }

    override fun branchBelongsToSupplier(branchId: Long, supplierId: Long, userUid: String): Boolean =
        runBlocking { branchDao.getById(branchId, userUid)?.supplierId == supplierId }

    override fun carTypeExists(id: Long, userUid: String): Boolean =
        runBlocking { carTypeDao.getAll(userUid).first().any { it.id == id } }

    override fun insertReservation(reservation: Reservation): Long {
        requireOwner(reservation.userUid.orEmpty())
        return runBlocking { reservations.upsert(reservation) }
    }

    override fun findReservation(id: Long, userUid: String): Reservation? =
        runBlocking { reservationDao.getById(id, userUid).first() }

    override fun updateReservation(reservation: Reservation) {
        requireOwner(reservation.userUid.orEmpty())
        runBlocking { reservations.update(reservation) }
    }

    override fun findCarSale(id: Long, userUid: String): CarSale? =
        runBlocking { carSaleDao.getById(id, userUid) }

    override fun commissionPaymentsForSale(carSaleId: Long, userUid: String): List<CarSaleCommissionPayment> =
        runBlocking { commissionPaymentDao.getForSaleOnce(carSaleId, userUid) }

    override fun insertCommissionPayment(payment: CarSaleCommissionPayment): Long {
        requireOwner(payment.userUid)
        return runBlocking {
            val id = commissionPaymentDao.insert(payment)
            syncDirtyMarker?.markCarSaleCommissionPaymentDirty(id)
            id
        }
    }

    companion object {
        fun create(db: AppDatabase, syncDirtyMarker: SyncDirtyMarker?, currentUid: () -> String) =
            RepositoryAgentDevWritePorts(
                customers = CustomerRepository(db.customerDao(), syncDirtyMarker),
                suppliers = SupplierRepository(db.supplierDao(), syncDirtyMarker),
                requests = RequestRepository(db.requestDao(), syncDirtyMarker),
                reservations = ReservationRepository(db.reservationDao(), db.paymentDao(), syncDirtyMarker),
                customerDao = db.customerDao(),
                supplierDao = db.supplierDao(),
                branchDao = db.branchDao(),
                carTypeDao = db.carTypeDao(),
                reservationDao = db.reservationDao(),
                carSaleDao = db.carSaleDao(),
                commissionPaymentDao = db.carSaleCommissionPaymentDao(),
                syncDirtyMarker = syncDirtyMarker,
                currentUid = currentUid
            )
    }
}
