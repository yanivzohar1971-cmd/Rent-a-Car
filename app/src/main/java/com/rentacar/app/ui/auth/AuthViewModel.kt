package com.rentacar.app.ui.auth

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.auth.AuthRepository
import com.rentacar.app.data.auth.UserProfile
import com.rentacar.app.data.auth.AuthProvider
import com.rentacar.app.data.auth.PrimaryRole
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AuthMode {
    LOGIN, SIGNUP
}

// Sealed class for navigation/auth state (Loading/LoggedOut/LoggedIn)
sealed class AuthNavigationState {
    object Loading : AuthNavigationState()
    object LoggedOut : AuthNavigationState()
    data class LoggedIn(val uid: String) : AuthNavigationState()
}

// Existing data class for UI state (kept for backward compatibility)
data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val currentUser: UserProfile? = null,
    val errorMessage: String? = null,
    val mode: AuthMode = AuthMode.LOGIN,
    val hasCheckedExistingUser: Boolean = false
)

class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "AuthViewModel"
    }
    
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()
    
    // New: Navigation state for startup UX (starts as Loading, then LoggedOut or LoggedIn)
    private val _authNavigationState = MutableStateFlow<AuthNavigationState>(AuthNavigationState.Loading)
    val authNavigationState: StateFlow<AuthNavigationState> = _authNavigationState.asStateFlow()
    
    init {
        // Check FirebaseAuth synchronously on init to avoid Login flash
        val currentUser = AuthProvider.auth.currentUser
        _authNavigationState.value = if (currentUser != null) {
            AuthNavigationState.LoggedIn(currentUser.uid)
        } else {
            AuthNavigationState.LoggedOut
        }
        
        // Also check existing user asynchronously (for UserProfile details)
        checkExistingUser()
        
        // Listen to auth state changes to keep navigation state in sync
        AuthProvider.auth.addAuthStateListener { auth ->
            val user = auth.currentUser
            _authNavigationState.value = if (user != null) {
                AuthNavigationState.LoggedIn(user.uid)
            } else {
                AuthNavigationState.LoggedOut
            }
        }
    }
    
    fun switchMode(mode: AuthMode) {
        _uiState.update { it.copy(mode = mode, errorMessage = null) }
    }
    
    fun login(email: String, password: String) {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.signIn(email, password)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = true,
                        currentUser = profile,
                        errorMessage = null,
                        hasCheckedExistingUser = true
                    )
                }
                _authNavigationState.value = AuthNavigationState.LoggedIn(profile.uid)
                Log.d(TAG, "Login successful: uid=${profile.uid}")
            } catch (e: Exception) {
                Log.e(TAG, "Login failed", e)
                val errorMsg = when {
                    e.message?.contains("password", ignoreCase = true) == true -> "סיסמה שגויה"
                    e.message?.contains("user", ignoreCase = true) == true -> "משתמש לא קיים"
                    e.message?.contains("email", ignoreCase = true) == true -> "כתובת אימייל לא תקינה"
                    else -> "שגיאה בהתחברות: ${e.message ?: "נסה שוב"}"
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = false,
                        errorMessage = errorMsg,
                        hasCheckedExistingUser = true
                    )
                }
            }
        }
    }
    
    fun signup(
        email: String,
        password: String,
        displayName: String?,
        phoneNumber: String?,
        primaryRole: PrimaryRole
    ) {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.signUp(
                    email = email,
                    password = password,
                    displayName = displayName,
                    phoneNumber = phoneNumber,
                    primaryRole = primaryRole
                )
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = true,
                        currentUser = profile,
                        errorMessage = null,
                        hasCheckedExistingUser = true
                    )
                }
                _authNavigationState.value = AuthNavigationState.LoggedIn(profile.uid)
                Log.d(TAG, "Signup successful: uid=${profile.uid}")
            } catch (e: Exception) {
                Log.e(TAG, "Signup failed", e)
                val errorMsg = when {
                    e.message?.contains("already in use", ignoreCase = true) == true -> "כתובת האימייל כבר בשימוש"
                    e.message?.contains("password", ignoreCase = true) == true -> "הסיסמה חייבת להכיל לפחות 6 תווים"
                    e.message?.contains("email", ignoreCase = true) == true -> "כתובת אימייל לא תקינה"
                    else -> "שגיאה בהרשמה: ${e.message ?: "נסה שוב"}"
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = false,
                        errorMessage = errorMsg,
                        hasCheckedExistingUser = true
                    )
                }
            }
        }
    }
    
    fun refreshEmailVerification() {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.refreshEmailVerification()
                if (profile != null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            currentUser = profile,
                            errorMessage = null,
                            hasCheckedExistingUser = true
                        )
                    }
                    Log.d(TAG, "Email verification refreshed: uid=${profile.uid}, verified=${profile.emailVerified}")
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נמצא משתמש מחובר",
                            hasCheckedExistingUser = true
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh email verification", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה ברענון סטטוס האימות: ${e.message ?: "נסה שוב"}",
                        hasCheckedExistingUser = true
                    )
                }
            }
        }
    }
    
    /**
     * Refreshes the current user profile from Firestore.
     * Useful after manual role updates in Firebase Console to get the latest profile data.
     * This will update the currentUser in the UI state with the latest data from Firestore.
     */
    fun refreshUserProfile() {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.refreshUserProfile()
                if (profile != null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            currentUser = profile,
                            errorMessage = null,
                            hasCheckedExistingUser = true
                        )
                    }
                    Log.d(TAG, "User profile refreshed: uid=${profile.uid}")
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נמצא משתמש מחובר",
                            hasCheckedExistingUser = true
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh user profile", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה ברענון פרופיל המשתמש: ${e.message ?: "נסה שוב"}",
                        hasCheckedExistingUser = true
                    )
                }
            }
        }
    }
    
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
    
    fun checkExistingUser() {
        viewModelScope.launch {
            try {
                val profile = authRepository.getCurrentUserProfile()
                if (profile != null) {
                    _uiState.update {
                        it.copy(
                            isLoggedIn = true,
                            currentUser = profile
                        )
                    }
                    Log.d(TAG, "Existing user found: uid=${profile.uid}")
                } else {
                    Log.d(TAG, "No existing user found")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error checking existing user", e)
            }
        }
    }
    
    fun signInWithGoogle(idToken: String) {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.signInWithGoogle(idToken)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = true,
                        currentUser = profile,
                        errorMessage = null,
                        hasCheckedExistingUser = true
                    )
                }
                _authNavigationState.value = AuthNavigationState.LoggedIn(profile.uid)
                Log.d(TAG, "Google sign-in successful: uid=${profile.uid}")
            } catch (e: Exception) {
                Log.e(TAG, "Google sign-in failed", e)
                val errorMsg = when {
                    e.message?.contains("network", ignoreCase = true) == true -> "שגיאת רשת. בדוק את החיבור לאינטרנט"
                    e.message?.contains("cancelled", ignoreCase = true) == true -> "התחברות בוטלה"
                    else -> "שגיאה בהתחברות עם Google: ${e.message ?: "נסה שוב"}"
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = false,
                        errorMessage = errorMsg,
                        hasCheckedExistingUser = true
                    )
                }
            }
        }
    }
    
    fun logout() {
        viewModelScope.launch {
            try {
                authRepository.signOut()
                _uiState.update {
                    it.copy(
                        isLoggedIn = false,
                        currentUser = null,
                        errorMessage = null
                    )
                }
                _authNavigationState.value = AuthNavigationState.LoggedOut
                Log.d(TAG, "User logged out successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error during logout", e)
                // Even if signOut fails, clear local state
                _uiState.update {
                    it.copy(
                        isLoggedIn = false,
                        currentUser = null,
                        errorMessage = null
                    )
                }
                _authNavigationState.value = AuthNavigationState.LoggedOut
            }
        }
    }
    
    /**
     * Sets the primary role for the current user (legacy user migration).
     * This is called from SelectRoleScreen for users who don't have a role set.
     */
    fun setPrimaryRole(primaryRole: PrimaryRole, onComplete: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                val updatedProfile = authRepository.setPrimaryRole(primaryRole)
                if (updatedProfile != null) {
                    _uiState.update {
                        it.copy(
                            currentUser = updatedProfile
                        )
                    }
                    Log.d(TAG, "Primary role set: ${primaryRole.value}")
                    onComplete(true)
                } else {
                    Log.e(TAG, "Failed to set primary role")
                    onComplete(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error setting primary role", e)
                onComplete(false)
            }
        }
    }
    
    /**
     * Checks if the current user needs to select a role (legacy user).
     */
    fun needsRoleSelection(): Boolean {
        val profile = _uiState.value.currentUser
        return profile != null && (profile.primaryRole.isNullOrBlank())
    }
}

