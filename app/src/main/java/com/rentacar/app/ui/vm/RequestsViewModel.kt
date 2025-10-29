package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Request
import com.rentacar.app.data.RequestRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RequestsViewModel(
    private val repo: RequestRepository
) : ViewModel() {
    val list: StateFlow<List<Request>> = repo.list().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun save(request: Request, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = repo.upsert(request)
            onDone(id)
        }
    }

    fun delete(id: Long) {
        viewModelScope.launch { repo.delete(id) }
    }
}


