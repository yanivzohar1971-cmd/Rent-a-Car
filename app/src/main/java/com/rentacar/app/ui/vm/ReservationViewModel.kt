package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.ReservationStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ReservationViewModel(
    private val reservations: ReservationRepository,
    private val catalog: CatalogRepository,
    private val customers: CustomerRepository,
    private val requests: com.rentacar.app.data.RequestRepository? = null
) : ViewModel() {

    val reservationList: StateFlow<List<Reservation>> =
        reservations.getOpenReservations()
            .map { list ->
                android.util.Log.d("ReservationViewModel", "Open reservations flow updated: ${list.size} items")
                val now = System.currentTimeMillis()
                val filtered = list.filter { it.dateFrom >= now && it.status != ReservationStatus.Cancelled }
                android.util.Log.d("ReservationViewModel", "Filtered reservations: ${filtered.size} items")
                filtered
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val suppliers = catalog.suppliers().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val carTypes = catalog.carTypes().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val customerList = customers.listActive().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val allReservations = reservations.getAllReservations().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val agents = catalog.agents().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun branchesBySupplier(supplierId: Long) = catalog.branchesBySupplier(supplierId)

    fun reservation(id: Long): Flow<Reservation?> = reservations.getReservation(id)

    fun payments(reservationId: Long) = reservations.getPayments(reservationId)
    fun reservationsByCustomer(customerId: Long) = reservations.getByCustomer(customerId)
    fun reservationsBySupplier(supplierId: Long) = reservations.getBySupplier(supplierId)
    fun reservationsByAgent(agentId: Long) = reservations.getByAgent(agentId)
    fun reservationsByBranch(branchId: Long) = reservations.getByBranch(branchId)

    fun customer(id: Long) = customers.getById(id)

    fun createReservation(reservation: Reservation, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = reservations.upsert(reservation)
            onDone(id)
        }
    }

    fun createCustomerAndReservation(
        firstName: String,
        lastName: String,
        phone: String,
        tzId: String? = null,
        address: String? = null,
        email: String? = null,
        isCompany: Boolean = false,
        reservationBuilder: (customerId: Long) -> Reservation,
        onDone: (Long) -> Unit = {}
    ) {
        viewModelScope.launch {
            val customerId = customers.upsert(
                Customer(
                    firstName = firstName,
                    lastName = lastName,
                    phone = phone,
                    tzId = tzId?.ifBlank { null },
                    address = address?.ifBlank { null },
                    email = email?.ifBlank { null },
                    isCompany = isCompany
                )
            )
            val reservation = reservationBuilder(customerId)
            val id = reservations.upsert(reservation)
            onDone(id)
        }
    }

    fun updateReservationStatus(reservation: Reservation, status: ReservationStatus) {
        viewModelScope.launch {
            reservations.update(reservation.copy(status = status, updatedAt = System.currentTimeMillis()))
        }
    }

    fun updateSupplierOrderNumber(reservation: Reservation, orderNumber: String?) {
        viewModelScope.launch {
            reservations.update(reservation.copy(supplierOrderNumber = orderNumber?.ifBlank { null }, updatedAt = System.currentTimeMillis()))
        }
    }

    fun addPayment(reservationId: Long, amount: Double, method: String, note: String? = null) {
        viewModelScope.launch {
            reservations.addPayment(Payment(reservationId = reservationId, amount = amount, date = System.currentTimeMillis(), method = method, note = note))
        }
    }

    fun deleteRequest(id: Long) {
        viewModelScope.launch {
            requests?.delete(id)
        }
    }

    fun addSupplier(name: String, phone: String? = null, address: String? = null, taxId: String? = null, email: String? = null, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertSupplier(com.rentacar.app.data.Supplier(name = name, phone = phone?.ifBlank { null }, address = address?.ifBlank { null }, taxId = taxId?.ifBlank { null }, email = email?.ifBlank { null }))
            onDone(id)
        }
    }

    fun addBranch(supplierId: Long, name: String, address: String? = null, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertBranch(com.rentacar.app.data.Branch(name = name, address = address?.ifBlank { null }, supplierId = supplierId))
            onDone(id)
        }
    }

    fun updateBranch(branch: com.rentacar.app.data.Branch, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertBranch(branch)
            onDone(id)
        }
    }

    fun updateReservation(reservation: Reservation, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            android.util.Log.d("ReservationViewModel", "Updating reservation: ${reservation.id}")
            reservations.update(reservation)
            android.util.Log.d("ReservationViewModel", "Reservation updated successfully: ${reservation.id}")
            onDone()
        }
    }
}
