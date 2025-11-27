package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Agent
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AgentsViewModel(private val catalog: CatalogRepository) : ViewModel() {
    
    companion object {
        private const val TAG = "AgentsViewModel"
    }
    
    init {
        val currentUid = CurrentUserProvider.getCurrentUid()
        Log.d(TAG, "AgentsViewModel initialized with currentUid=$currentUid")
        if (currentUid == null) {
            Log.w(TAG, "WARNING: AgentsViewModel initialized with null currentUid - data will be empty")
        }
    }
    
    private val currentUid: String = com.rentacar.app.data.auth.CurrentUserProvider.requireCurrentUid()
    
    init {
        Log.d(TAG, "AgentsViewModel initialized with currentUid=$currentUid")
    }
    
    val list: StateFlow<List<Agent>> = catalog.agentsForUser(currentUid).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun save(agent: Agent, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val id = catalog.upsertAgent(agent)
            onDone(id)
        }
    }

    fun delete(id: Long, onDone: (Boolean) -> Unit = {}) {
        viewModelScope.launch { onDone(catalog.deleteAgent(id) > 0) }
    }
}


