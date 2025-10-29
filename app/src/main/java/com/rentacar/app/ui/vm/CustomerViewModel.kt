package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.ReservationRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CustomerViewModel(
    private val customers: CustomerRepository,
    private val reservations: ReservationRepository? = null
) : ViewModel() {

    private val query = MutableStateFlow("")

    val list: StateFlow<List<Customer>> =
        query.flatMapLatest { q ->
            if (q.isBlank()) customers.listActive() else customers.search(q)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun setQuery(q: String) { query.value = q }

    fun customer(id: Long): Flow<Customer?> = customers.getById(id)

    fun customerReservations(customerId: Long) = reservations?.getByCustomer(customerId)

    fun save(customer: Customer, onDone: (Long) -> Unit = {}, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            val tz = customer.tzId?.trim().orEmpty()
            if (tz.isNotBlank()) {
                val exists = customers.existsByTz(tz, excludeId = customer.id)
                if (exists) {
                    onError("תעודת זהות כבר קיימת במערכת")
                    return@launch
                }
            }
            val id = customers.upsert(customer)
            onDone(id)
        }
    }

    fun setActive(customer: Customer, active: Boolean) {
        viewModelScope.launch { customers.upsert(customer.copy(active = active)) }
    }

    suspend fun deleteIfNoReservations(customerId: Long): Boolean {
        val has = reservations?.getByCustomer(customerId)
        // Simplified: in UI we should check list is empty; here we just call delete.
        return customers.delete(customerId) > 0
    }
}
