package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import com.google.firebase.firestore.FirebaseFirestore
import com.rentacar.app.data.auth.AdminRepository
import com.rentacar.app.data.auth.AuthRepository
import com.rentacar.app.data.auth.PrimaryRole
import com.rentacar.app.data.auth.UserProfile
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val pendingRequests: List<UserProfile> = emptyList(),
    val searchResults: List<UserProfile> = emptyList(),
    val searchQuery: String = ""
)

class AdminViewModel(
    private val adminRepository: AdminRepository,
    private val authRepository: AuthRepository,
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val functions: FirebaseFunctions = Firebase.functions
) : ViewModel() {
    
    companion object {
        private const val TAG = "AdminViewModel"
    }
    
    private val _uiState = MutableStateFlow(AdminUiState())
    val uiState: StateFlow<AdminUiState> = _uiState.asStateFlow()
    
    /**
     * Checks if the current user is an admin.
     */
    suspend fun isCurrentUserAdmin(): Boolean {
        val uid = authRepository.getCurrentUserId() ?: return false
        return adminRepository.isAdmin(uid)
    }
    
    /**
     * Loads pending role requests (users with roleStatus == "PENDING").
     */
    fun loadPendingRequests() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                // Query Firestore for users with roleStatus == "PENDING"
                val snapshot = firestore.collection("users")
                    .whereEqualTo("roleStatus", "PENDING")
                    .get()
                    .await()
                
                val requests = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(UserProfile::class.java)
                }
                
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        pendingRequests = requests
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading pending requests", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בטעינת בקשות ממתינות: ${e.message}"
                    )
                }
            }
        }
    }
    
    /**
     * Sets a user's primary role via Cloud Function.
     */
    fun setUserRole(targetUid: String, primaryRole: PrimaryRole, reason: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val data = hashMapOf(
                    "targetUid" to targetUid,
                    "primaryRole" to primaryRole.value,
                    "reason" to (reason ?: "")
                )
                
                val result = functions.getHttpsCallable("setUserRole")
                    .call(data)
                    .await()
                
                Log.d(TAG, "Role set successfully: $result")
                _uiState.update { it.copy(isLoading = false) }
                
                // Reload pending requests
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e(TAG, "Error setting user role", e)
                val errorMsg = when {
                    e.message?.contains("permission-denied", ignoreCase = true) == true -> 
                        "אין הרשאה לבצע פעולה זו"
                    e.message?.contains("not-found", ignoreCase = true) == true -> 
                        "משתמש לא נמצא"
                    else -> "שגיאה בהגדרת תפקיד: ${e.message ?: "נסה שוב"}"
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = errorMsg
                    )
                }
            }
        }
    }
    
    /**
     * Resolves a role request (approve or reject) via Cloud Function.
     */
    fun resolveRoleRequest(targetUid: String, action: String, reason: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val data = hashMapOf(
                    "targetUid" to targetUid,
                    "action" to action, // "APPROVE" or "REJECT"
                    "reason" to (reason ?: "")
                )
                
                val result = functions.getHttpsCallable("resolveRoleRequest")
                    .call(data)
                    .await()
                
                Log.d(TAG, "Role request resolved: $result")
                _uiState.update { it.copy(isLoading = false) }
                
                // Reload pending requests
                loadPendingRequests()
            } catch (e: Exception) {
                Log.e(TAG, "Error resolving role request", e)
                val errorMsg = when {
                    e.message?.contains("permission-denied", ignoreCase = true) == true -> 
                        "אין הרשאה לבצע פעולה זו"
                    e.message?.contains("not-found", ignoreCase = true) == true -> 
                        "משתמש לא נמצא"
                    else -> "שגיאה בפתרון בקשה: ${e.message ?: "נסה שוב"}"
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = errorMsg
                    )
                }
            }
        }
    }
    
    /**
     * Searches for users by email, phone, or UID.
     * Uses Firestore queries to find matching users.
     */
    fun searchUsers(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        
        if (query.isBlank()) {
            _uiState.update { it.copy(searchResults = emptyList()) }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val normalizedQuery = query.trim().lowercase()
                val results = mutableListOf<UserProfile>()
                
                // Try to find by UID first (exact match)
                try {
                    val uidDoc = firestore.collection("users")
                        .document(normalizedQuery)
                        .get()
                        .await()
                    if (uidDoc.exists()) {
                        uidDoc.toObject(UserProfile::class.java)?.let { results.add(it) }
                    }
                } catch (e: Exception) {
                    // UID search failed, continue with other searches
                }
                
                // Search by email (case-insensitive, starts with)
                try {
                    val emailSnapshot = firestore.collection("users")
                        .whereGreaterThanOrEqualTo("email", normalizedQuery)
                        .whereLessThanOrEqualTo("email", normalizedQuery + "\uf8ff")
                        .limit(10)
                        .get()
                        .await()
                    emailSnapshot.documents.forEach { doc ->
                        doc.toObject(UserProfile::class.java)?.let { profile ->
                            if (profile.email.lowercase().contains(normalizedQuery) && 
                                !results.any { it.uid == profile.uid }) {
                                results.add(profile)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Email search failed", e)
                }
                
                // Search by phone (if available)
                if (normalizedQuery.length >= 3) {
                    try {
                        val phoneSnapshot = firestore.collection("users")
                            .whereGreaterThanOrEqualTo("phoneNumber", normalizedQuery)
                            .whereLessThanOrEqualTo("phoneNumber", normalizedQuery + "\uf8ff")
                            .limit(10)
                            .get()
                            .await()
                        phoneSnapshot.documents.forEach { doc ->
                            doc.toObject(UserProfile::class.java)?.let { profile ->
                                if (profile.phoneNumber?.lowercase()?.contains(normalizedQuery) == true &&
                                    !results.any { it.uid == profile.uid }) {
                                    results.add(profile)
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Phone search failed", e)
                    }
                }
                
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        searchResults = results
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error searching users", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה בחיפוש משתמשים: ${e.message}"
                    )
                }
            }
        }
    }
    
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}

