package com.rentacar.app.ui.vm

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.Request
import com.rentacar.app.data.RequestRepository
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
class RequestsViewModel(
    private val repo: RequestRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "RequestsViewModel"
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
        Log.d(TAG, "RequestsViewModel initialized with currentUid=$currentUid")
    }
    
    val list: StateFlow<List<Request>> = currentUidFlow.flatMapLatest { currentUid ->
        repo.listForUser(currentUid)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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


