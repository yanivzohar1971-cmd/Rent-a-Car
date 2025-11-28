package com.rentacar.app.ui.admin

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import com.rentacar.app.data.auth.AdminRepository
import com.rentacar.app.data.auth.AuthRepository
import com.rentacar.app.data.auth.PrimaryRole
import com.rentacar.app.data.auth.UserProfile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

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
                // Note: This requires Firestore query - for now, we'll use Cloud Function
                // or implement direct Firestore query if rules allow
                // For MVP, we'll fetch via search or implement a dedicated function
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        pendingRequests = emptyList() // TODO: Implement Firestore query
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
     * Note: This requires Firestore query implementation.
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
                // TODO: Implement Firestore query for user search
                // For now, return empty list
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        searchResults = emptyList()
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

