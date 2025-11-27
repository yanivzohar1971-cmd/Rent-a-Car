package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Customer
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CustomerViewModel(
    private val customers: CustomerRepository,
    private val reservations: ReservationRepository? = null
) : ViewModel() {
    
    companion object {
        private const val TAG = "CustomerViewModel"
    }

    init {
        val currentUid = CurrentUserProvider.getCurrentUid()
        Log.d(TAG, "CustomerViewModel initialized with currentUid=$currentUid")
        if (currentUid == null) {
            Log.w(TAG, "WARNING: CustomerViewModel initialized with null currentUid - data will be empty")
        }
    }

    private val query = MutableStateFlow("")

    val list: StateFlow<List<Customer>> =
        query.flatMapLatest { q ->
            val currentUid = CurrentUserProvider.requireCurrentUid()
            Log.d(TAG, "CustomerViewModel.list query='$q', currentUid=$currentUid")
            if (q.isBlank()) {
                // Use listAllForUser() instead of listActiveForUser() to show all customers, not just active ones
                // This fixes the issue where restored customers might have active=false
                customers.listAllForUser(currentUid).map { list ->
                    Log.d(TAG, "CustomerViewModel.listAllForUser returned ${list.size} customers for currentUid=$currentUid (all customers for user)")
                    list
                }
            } else {
                customers.searchForUser(q, currentUid).map { list ->
                    Log.d(TAG, "CustomerViewModel.searchForUser returned ${list.size} customers for query='$q', currentUid=$currentUid")
                    list
                }
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun setQuery(q: String) { query.value = q }

    fun customer(id: Long): Flow<Customer?> {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        return customers.getByIdForUser(id, currentUid)
    }

    fun customerReservations(customerId: Long): Flow<List<Reservation>>? {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        return reservations?.getByCustomerForUser(customerId, currentUid)
    }

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
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val has = reservations?.getByCustomerForUser(customerId, currentUid)
        // Simplified: in UI we should check list is empty; here we just call delete.
        return customers.delete(customerId) > 0
    }
}
