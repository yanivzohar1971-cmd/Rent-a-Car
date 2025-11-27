package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Request
import com.rentacar.app.data.RequestRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class RequestsViewModel(
    private val repo: RequestRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "RequestsViewModel"
    }
    
    init {
        val currentUid = CurrentUserProvider.getCurrentUid()
        Log.d(TAG, "RequestsViewModel initialized with currentUid=$currentUid")
        if (currentUid == null) {
            Log.w(TAG, "WARNING: RequestsViewModel initialized with null currentUid - data will be empty")
        }
    }
    
    private val currentUid: String = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
    
    init {
        Log.d(TAG, "RequestsViewModel initialized with currentUid=$currentUid")
    }
    
    val list: StateFlow<List<Request>> = repo.listForUser(currentUid).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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


