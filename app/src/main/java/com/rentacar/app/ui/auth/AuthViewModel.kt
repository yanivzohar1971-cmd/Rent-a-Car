package com.rentacar.app.ui.auth

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.data.auth.AuthRepository
import com.rentacar.app.data.auth.UserProfile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AuthMode {
    LOGIN, SIGNUP
}

data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val currentUser: UserProfile? = null,
    val errorMessage: String? = null,
    val mode: AuthMode = AuthMode.LOGIN
)

class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {
    
    companion object {
        private const val TAG = "AuthViewModel"
    }
    
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()
    
    init {
        checkExistingUser()
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
                        errorMessage = null
                    )
                }
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
                        errorMessage = errorMsg
                    )
                }
            }
        }
    }
    
    fun signup(email: String, password: String, displayName: String?, phoneNumber: String?) {
        if (_uiState.value.isLoading) return
        
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        
        viewModelScope.launch {
            try {
                val profile = authRepository.signUp(email, password, displayName, phoneNumber)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoggedIn = true,
                        currentUser = profile,
                        errorMessage = null
                    )
                }
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
                        errorMessage = errorMsg
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
                            errorMessage = null
                        )
                    }
                    Log.d(TAG, "Email verification refreshed: uid=${profile.uid}, verified=${profile.emailVerified}")
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "לא נמצא משתמש מחובר"
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh email verification", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "שגיאה ברענון סטטוס האימות: ${e.message ?: "נסה שוב"}"
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
}

