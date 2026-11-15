package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.AgentDevWritePorts
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleCommissionPayment
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Request
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.Supplier

/** In-memory fake of the AgentDev data boundary (JVM-fast; no Room/Android). */
class FakeAgentDevWritePorts : AgentDevWritePorts {
    private var nextId = 1L
    val customers = mutableListOf<Customer>()
    val suppliers = mutableListOf<Supplier>()
    val requests = mutableListOf<Request>()
    val reservations = mutableListOf<Reservation>()
    val carSales = mutableListOf<CarSale>()
    val commissionPayments = mutableListOf<CarSaleCommissionPayment>()

    /** (branchId to supplierId) */
    val branches = mutableListOf<Pair<Long, Long>>()
    val carTypeIds = mutableListOf<Long>()

    var failNextInsertWith: RuntimeException? = null
    var writeCalls = 0
        private set

    val totalRows: Int
        get() = customers.size + suppliers.size + requests.size + reservations.size + commissionPayments.size

    private fun id() = nextId++
    private fun write() {
        writeCalls++
        failNextInsertWith?.let { failNextInsertWith = null; throw it }
    }

    fun seedCustomer(uid: String): Long = id().also { customers += Customer(id = it, firstName = "A", lastName = "B", phone = "1", userUid = uid) }
    fun seedSupplier(uid: String, name: String = "Seed Supplier"): Long = id().also { suppliers += Supplier(id = it, name = name, userUid = uid) }
    fun seedBranch(supplierId: Long): Long = id().also { branches += it to supplierId }
    fun seedCarType(): Long = id().also { carTypeIds += it }
    fun seedCarSale(uid: String, commissionPrice: Double): Long =
        id().also {
            carSales += CarSale(
                id = it, firstName = "S", lastName = "T", phone = "2", carTypeName = "SUV",
                saleDate = 1L, salePrice = 100_000.0, commissionPrice = commissionPrice, userUid = uid
            )
        }

    override fun insertCustomer(customer: Customer): Long { write(); return id().also { customers += customer.copy(id = it) } }
    override fun supplierNameExists(name: String, userUid: String) = suppliers.any { it.name == name && it.userUid == userUid }
    override fun insertSupplier(supplier: Supplier): Long { write(); return id().also { suppliers += supplier.copy(id = it) } }
    override fun insertRequest(request: Request): Long { write(); return id().also { requests += request.copy(id = it) } }

    override fun customerExists(id: Long, userUid: String) = customers.any { it.id == id && it.userUid == userUid }
    override fun supplierExists(id: Long, userUid: String) = suppliers.any { it.id == id && it.userUid == userUid }
    override fun branchBelongsToSupplier(branchId: Long, supplierId: Long, userUid: String) = (branchId to supplierId) in branches
    override fun carTypeExists(id: Long, userUid: String) = id in carTypeIds
    override fun insertReservation(reservation: Reservation): Long { write(); return id().also { reservations += reservation.copy(id = it) } }
    override fun findReservation(id: Long, userUid: String) = reservations.firstOrNull { it.id == id && it.userUid == userUid }
    override fun updateReservation(reservation: Reservation) {
        write()
        val i = reservations.indexOfFirst { it.id == reservation.id }
        check(i >= 0)
        reservations[i] = reservation
    }

    override fun findCarSale(id: Long, userUid: String) = carSales.firstOrNull { it.id == id && it.userUid == userUid }
    override fun commissionPaymentsForSale(carSaleId: Long, userUid: String) =
        commissionPayments.filter { it.carSaleId == carSaleId && it.userUid == userUid }
    override fun insertCommissionPayment(payment: CarSaleCommissionPayment): Long {
        write()
        return id().also { commissionPayments += payment.copy(id = it) }
    }
}
