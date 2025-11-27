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
import kotlinx.coroutines.flow.flowOf
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
    
    val list: StateFlow<List<Request>> = currentUidFlow.flatMapLatest { currentUid ->
        if (currentUid != null) {
            repo.listForUser(currentUid)
        } else {
            // No user logged in yet - emit empty list to avoid crash
            flowOf(emptyList())
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun save(request: Request, onDone: (Long) -> Unit = {}) {
        viewModelScope.launch {
            val uid = getCurrentUidOrNull()
            if (uid == null) {
                Log.w(TAG, "No user logged in, ignoring save request")
                return@launch
            }
            val id = repo.upsert(request)
            onDone(id)
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
        }
    }
}


