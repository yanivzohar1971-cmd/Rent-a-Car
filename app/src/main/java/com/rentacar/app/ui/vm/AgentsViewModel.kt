package com.rentacar.app.ui.vm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Agent
import com.rentacar.app.data.CatalogRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AgentsViewModel(private val catalog: CatalogRepository) : ViewModel() {
    val list: StateFlow<List<Agent>> = catalog.agents().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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


