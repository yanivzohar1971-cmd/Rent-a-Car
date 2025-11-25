package com.rentacar.app.data.auth

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.rentacar.app.data.auth.AuthProvider

interface AuthRepository {
    suspend fun signUp(
        email: String,
        password: String,
        displayName: String?,
        phoneNumber: String? = null
    ): UserProfile
    suspend fun signIn(email: String, password: String): UserProfile
    suspend fun getCurrentUserProfile(): UserProfile?
    fun getCurrentUserId(): String?
    suspend fun signOut()
    // NEW:
    suspend fun refreshEmailVerification(): UserProfile?
}

class FirebaseAuthRepository(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : AuthRepository {
    
    companion object {
        private const val TAG = "AuthRepository"
    }
    
    override suspend fun signUp(
        email: String,
        password: String,
        displayName: String?,
        phoneNumber: String?
    ): UserProfile = withContext(Dispatchers.IO) {
        try {
            // Normalize email: trim and lowercase
            val normalizedEmail = AuthProvider.normalizeEmail(email)
            val normalizedPassword = password.trim()
            
            // Log Firebase app info to verify we're using the correct project
            AuthProvider.logFirebaseAppInfo("REGISTER")
            Log.d(TAG, "Signing up user with email: '$normalizedEmail' (original: '$email', length=${email.length})")
            
            // NOTE: If you see FirebaseException [CONFIGURATION_NOT_FOUND] here, see docs/firebase-auth-config.md for setup steps.
            // Create user in Firebase Auth using normalized email
            val result = auth.createUserWithEmailAndPassword(normalizedEmail, normalizedPassword).await()
            val user = result.user ?: throw Exception("Failed to create user")
            
            Log.d(TAG, "User created in Firebase Auth: uid=${user.uid}")
            
            // Send email verification
            try {
                user.sendEmailVerification().await()
                Log.d(TAG, "Email verification sent to: $normalizedEmail")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send email verification (signup continues)", e)
                // Do NOT fail signup if verification email fails
            }
            
            // Build UserProfile (use normalized email)
            val profile = UserProfile(
                uid = user.uid,
                email = normalizedEmail,
                displayName = displayName,
                phoneNumber = phoneNumber,
                createdAt = System.currentTimeMillis(),
                lastLoginAt = System.currentTimeMillis(),
                role = "AGENT",
                emailVerified = user.isEmailVerified // usually false immediately after signup
            )
            
            // Write to Firestore /users/{uid} with merge to be future-proof
            firestore.collection("users")
                .document(user.uid)
                .set(profile, com.google.firebase.firestore.SetOptions.merge())
                .await()
            
            Log.d(TAG, "User profile created in Firestore: uid=${user.uid}")
            
            profile
        } catch (e: Exception) {
            Log.e(TAG, "Error during sign up", e)
            throw e
        }
    }
    
    override suspend fun signIn(email: String, password: String): UserProfile = withContext(Dispatchers.IO) {
        try {
            // Normalize email: trim and lowercase (same as signup)
            val normalizedEmail = AuthProvider.normalizeEmail(email)
            val normalizedPassword = password.trim()
            
            // Log Firebase app info to verify we're using the correct project
            AuthProvider.logFirebaseAppInfo("LOGIN")
            Log.d(TAG, "Signing in user with email: '$normalizedEmail' (original: '$email', length=${email.length})")
            
            // Sign in with Firebase Auth using normalized email
            val result = auth.signInWithEmailAndPassword(normalizedEmail, normalizedPassword).await()
            val user = result.user ?: throw Exception("Failed to sign in")
            
            Log.d(TAG, "User signed in: uid=${user.uid}")
            
            // Reload user to get latest emailVerified status
            user.reload().await()
            
            // Check if profile exists in Firestore
            val docSnapshot = try {
                firestore.collection("users")
                    .document(user.uid)
                    .get()
                    .await()
            } catch (e: Exception) {
                Log.w(TAG, "Error fetching user profile, will create new one", e)
                null
            }
            
            val profile = if (docSnapshot != null && docSnapshot.exists()) {
                // Profile exists, update lastLoginAt and emailVerified
                val existing = docSnapshot.toObject(UserProfile::class.java)
                existing?.copy(
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = user.isEmailVerified
                ) ?: UserProfile(
                    uid = user.uid,
                    email = normalizedEmail,
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = user.isEmailVerified
                )
            } else {
                // Profile doesn't exist, create minimal one
                Log.d(TAG, "User profile not found, creating minimal profile")
                UserProfile(
                    uid = user.uid,
                    email = normalizedEmail,
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = user.isEmailVerified
                )
            }
            
            // Update profile in Firestore
            firestore.collection("users")
                .document(user.uid)
                .set(profile, com.google.firebase.firestore.SetOptions.merge())
                .await()
            
            Log.d(TAG, "User profile updated: uid=${user.uid}")
            
            profile
        } catch (e: Exception) {
            Log.e(TAG, "Error during sign in", e)
            throw e
        }
    }
    
    override suspend fun getCurrentUserProfile(): UserProfile? = withContext(Dispatchers.IO) {
        try {
            val user = auth.currentUser ?: return@withContext null
            
            val docSnapshot = firestore.collection("users")
                .document(user.uid)
                .get()
                .await()
            
            if (docSnapshot.exists()) {
                try {
                    docSnapshot.toObject(UserProfile::class.java)
                } catch (e: Exception) {
                    Log.e(TAG, "Error deserializing UserProfile from Firestore", e)
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching current user profile", e)
            null
        }
    }
    
    override fun getCurrentUserId(): String? {
        return auth.currentUser?.uid
    }
    
    override suspend fun signOut() {
        withContext(Dispatchers.IO) {
            try {
                auth.signOut()
                Log.d(TAG, "User signed out")
            } catch (e: Exception) {
                Log.e(TAG, "Error during sign out", e)
                throw e
            }
        }
    }
    
    override suspend fun refreshEmailVerification(): UserProfile? = withContext(Dispatchers.IO) {
        try {
            val user = auth.currentUser ?: return@withContext null
            
            // Reload user to get latest emailVerified status
            user.reload().await()
            val emailVerified = user.isEmailVerified
            
            // Fetch existing profile (if any)
            val docSnapshot = firestore.collection("users")
                .document(user.uid)
                .get()
                .await()
            
            val profile = if (docSnapshot.exists()) {
                val existing = docSnapshot.toObject(UserProfile::class.java)
                existing?.copy(emailVerified = emailVerified)
                    ?: UserProfile(
                        uid = user.uid,
                        email = user.email.orEmpty(),
                        createdAt = System.currentTimeMillis(),
                        lastLoginAt = System.currentTimeMillis(),
                        emailVerified = emailVerified
                    )
            } else {
                UserProfile(
                    uid = user.uid,
                    email = user.email.orEmpty(),
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = emailVerified
                )
            }
            
            // Save updated profile
            firestore.collection("users")
                .document(user.uid)
                .set(profile, com.google.firebase.firestore.SetOptions.merge())
                .await()
            
            profile
        } catch (e: Exception) {
            Log.e(TAG, "Error refreshing email verification", e)
            throw e
        }
    }
}

