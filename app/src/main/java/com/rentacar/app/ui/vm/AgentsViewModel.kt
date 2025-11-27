package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Agent
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.ExperimentalCoroutinesApi
import com.google.firebase.auth.FirebaseAuth
import com.rentacar.app.data.auth.AuthProvider
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class AgentsViewModel(private val catalog: CatalogRepository) : ViewModel() {
    
    companion object {
        private const val TAG = "AgentsViewModel"
    }
    
    // FIXED: Observe FirebaseAuth state changes to react to logout/login
    private fun getCurrentUid(): String = CurrentUserProvider.requireCurrentUid()
    
    private val currentUidFlow = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { auth ->
            val uid = auth.currentUser?.uid
            if (uid != null) {
                trySend(uid)
            }
        }
        AuthProvider.auth.addAuthStateListener(listener)
        val initialUid = getCurrentUid()
        trySend(initialUid)
        awaitClose {
            AuthProvider.auth.removeAuthStateListener(listener)
        }
    }.distinctUntilChanged()
    
    init {
        val currentUid = getCurrentUid()
        Log.d(TAG, "AgentsViewModel initialized with currentUid=$currentUid")
    }
    
    val list: StateFlow<List<Agent>> = currentUidFlow.flatMapLatest { currentUid ->
        catalog.agentsForUser(currentUid)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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


