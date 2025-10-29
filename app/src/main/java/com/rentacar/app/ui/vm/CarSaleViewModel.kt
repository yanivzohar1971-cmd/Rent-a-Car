package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CarSaleViewModel(private val repo: CarSaleRepository) : ViewModel() {
    val list: StateFlow<List<CarSale>> = repo.list().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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


