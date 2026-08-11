package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleCommissionPaymentDraft
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import com.rentacar.app.data.CarSaleRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.ExperimentalCoroutinesApi
import com.google.firebase.auth.FirebaseAuth
import com.rentacar.app.data.auth.AuthProvider
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class CarSaleViewModel(private val repo: CarSaleRepository) : ViewModel() {
    
    companion object {
        private const val TAG = "CarSaleViewModel"
    }
    
    // FIXED: Use nullable UID to avoid crash when no user is logged in yet
    private fun getCurrentUidOrNull(): String? = CurrentUserProvider.getCurrentUid()
    
    // FIXED: Observe FirebaseAuth state changes to react to logout/login
    // Emits String? (null when no user logged in) to avoid crash on fresh install
    private val currentUidFlow = callbackFlow<String?> {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            val uid = auth.currentUser?.uid
            trySend(uid) // Emit null if no user, emit UID if user exists
        }
        AuthProvider.auth.addAuthStateListener(listener)
        // Emit initial value (may be null on fresh install)
        val initialUid = getCurrentUidOrNull()
        trySend(initialUid)
        awaitClose {
            AuthProvider.auth.removeAuthStateListener(listener)
        }
    }.distinctUntilChanged()
    
    val list: StateFlow<List<CarSale>> = currentUidFlow.flatMapLatest { currentUid ->
        if (currentUid != null) {
            repo.listForUser(currentUid)
        } else {
            // No user logged in yet - emit empty list to avoid crash
            flowOf(emptyList())
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** carSaleId -> total paid from payment rows; missing key means 0. Reactive / no N+1. */
    val paidTotalsBySaleId: StateFlow<Map<Long, Double>> = currentUidFlow.flatMapLatest { currentUid ->
        if (currentUid != null) {
            repo.paidTotalsBySale(currentUid)
        } else {
            flowOf(emptyMap())
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    private val _commissionPayments = MutableStateFlow<List<CarSaleCommissionPaymentDraft>>(emptyList())
    val commissionPayments: StateFlow<List<CarSaleCommissionPaymentDraft>> = _commissionPayments.asStateFlow()

    private var paymentsLoadedForSaleId: Long? = null

    /**
     * Chronological display order: paymentDate ASC, then id ASC, then draftKey.
     * Applied to both persisted and unsaved draft rows.
     */
    private fun List<CarSaleCommissionPaymentDraft>.sortedChronologically(): List<CarSaleCommissionPaymentDraft> =
        sortedWith(compareBy({ it.paymentDate }, { it.id }, { it.draftKey }))

    private fun setCommissionPayments(payments: List<CarSaleCommissionPaymentDraft>) {
        _commissionPayments.value = payments.sortedChronologically()
    }

    fun clearCommissionPayments() {
        _commissionPayments.value = emptyList()
        paymentsLoadedForSaleId = null
    }

    fun loadCommissionPayments(saleId: Long) {
        if (saleId <= 0L) {
            clearCommissionPayments()
            return
        }
        if (paymentsLoadedForSaleId == saleId) return
        viewModelScope.launch {
            val uid = getCurrentUidOrNull()
            if (uid == null) {
                Log.w(TAG, "No user logged in, ignoring loadCommissionPayments")
                return@launch
            }
            val loaded = repo.getPaymentsForSaleOnce(saleId).map { CarSaleCommissionPaymentDraft.fromEntity(it) }
            setCommissionPayments(loaded)
            paymentsLoadedForSaleId = saleId
        }
    }

    fun activeCommissionPayments(): List<CarSaleCommissionPaymentDraft> =
        _commissionPayments.value.filter { !it.markedForDeletion }.sortedChronologically()

    fun commissionTotals(commissionPrice: Double): CarSaleCommissionPaymentLogic.Totals {
        return CarSaleCommissionPaymentLogic.totals(
            commissionPrice,
            activeCommissionPayments().map { it.amount }
        )
    }

    fun addCommissionPaymentValidated(
        amount: Double?,
        paymentDate: Long?,
        commissionPrice: Double
    ): CarSaleCommissionPaymentLogic.ValidationResult {
        val alreadyPaid = CarSaleCommissionPaymentLogic.totalPaid(activeCommissionPayments().map { it.amount })
        when (
            val amountCheck = CarSaleCommissionPaymentLogic.validatePaymentAmount(
                amount,
                commissionPrice,
                alreadyPaid
            )
        ) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error -> return amountCheck
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        when (val dateCheck = CarSaleCommissionPaymentLogic.validatePaymentDate(paymentDate)) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error -> return dateCheck
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        setCommissionPayments(
            _commissionPayments.value + CarSaleCommissionPaymentDraft.newDraft(amount!!, paymentDate!!)
        )
        return CarSaleCommissionPaymentLogic.ValidationResult.Ok
    }

    fun updateCommissionPaymentValidated(
        draftKey: String,
        amount: Double?,
        paymentDate: Long?,
        commissionPrice: Double
    ): CarSaleCommissionPaymentLogic.ValidationResult {
        val othersPaid = CarSaleCommissionPaymentLogic.totalPaid(
            activeCommissionPayments().filter { it.draftKey != draftKey }.map { it.amount }
        )
        when (
            val amountCheck = CarSaleCommissionPaymentLogic.validatePaymentAmount(
                amount,
                commissionPrice,
                othersPaid
            )
        ) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error -> return amountCheck
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        when (val dateCheck = CarSaleCommissionPaymentLogic.validatePaymentDate(paymentDate)) {
            is CarSaleCommissionPaymentLogic.ValidationResult.Error -> return dateCheck
            CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
        }
        val now = System.currentTimeMillis()
        setCommissionPayments(
            _commissionPayments.value.map { draft ->
                if (draft.draftKey == draftKey && !draft.markedForDeletion) {
                    draft.copy(amount = amount!!, paymentDate = paymentDate!!, updatedAt = now)
                } else draft
            }
        )
        return CarSaleCommissionPaymentLogic.ValidationResult.Ok
    }

    fun markCommissionPaymentDeleted(draftKey: String) {
        setCommissionPayments(
            _commissionPayments.value.map { draft ->
                if (draft.draftKey != draftKey) draft
                else if (draft.id > 0L) draft.copy(markedForDeletion = true)
                else draft
            }.filterNot { it.draftKey == draftKey && it.id == 0L }
        )
    }

    fun save(sale: CarSale, onDone: (Long) -> Unit = {}) {
        saveWithCommissionPayments(sale, onDone = onDone, onError = {})
    }

    fun saveWithCommissionPayments(
        sale: CarSale,
        onDone: (Long) -> Unit = {},
        onError: (String) -> Unit = {}
    ) {
        viewModelScope.launch {
            val uid = getCurrentUidOrNull()
            if (uid == null) {
                Log.w(TAG, "No user logged in, ignoring save request")
                onError("יש להתחבר למערכת")
                return@launch
            }
            val drafts = _commissionPayments.value
            val paid = CarSaleCommissionPaymentLogic.totalPaid(
                drafts.filter { !it.markedForDeletion }.map { it.amount }
            )
            when (
                val commissionCheck = CarSaleCommissionPaymentLogic.validateCommissionAgainstPaid(
                    sale.commissionPrice,
                    paid
                )
            ) {
                is CarSaleCommissionPaymentLogic.ValidationResult.Error -> {
                    onError(commissionCheck.messageHe)
                    return@launch
                }
                CarSaleCommissionPaymentLogic.ValidationResult.Ok -> Unit
            }
            try {
                val id = repo.saveSaleWithCommissionPayments(sale, drafts)
                paymentsLoadedForSaleId = id
                // Refresh drafts with persisted IDs where possible
                val reloaded = repo.getPaymentsForSaleOnce(id).map { CarSaleCommissionPaymentDraft.fromEntity(it) }
                setCommissionPayments(reloaded)
                onDone(id)
            } catch (e: IllegalArgumentException) {
                onError(e.message ?: "שגיאה בשמירה")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save sale with commission payments", e)
                onError("שגיאה בשמירת המכירה")
            }
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch {
            val uid = getCurrentUidOrNull()
            if (uid == null) {
                Log.w(TAG, "No user logged in, ignoring delete request")
                return@launch
            }
            repo.delete(id)
            if (paymentsLoadedForSaleId == id) {
                clearCommissionPayments()
            }
        }
    }
}
