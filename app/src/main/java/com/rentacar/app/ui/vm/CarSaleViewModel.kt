package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CarSaleViewModel(private val repo: CarSaleRepository) : ViewModel() {
    
    companion object {
        private const val TAG = "CarSaleViewModel"
    }
    
    init {
        val currentUid = CurrentUserProvider.getCurrentUid()
        Log.d(TAG, "CarSaleViewModel initialized with currentUid=$currentUid")
        if (currentUid == null) {
            Log.w(TAG, "WARNING: CarSaleViewModel initialized with null currentUid - data will be empty")
        }
    }
    
    private val currentUid: String = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
    
    init {
        Log.d(TAG, "CarSaleViewModel initialized with currentUid=$currentUid")
    }
    
    val list: StateFlow<List<CarSale>> = repo.listForUser(currentUid).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun save(sale: CarSale, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = repo.upsert(sale)
            onDone(id)
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch { repo.delete(id) }
    }
}


