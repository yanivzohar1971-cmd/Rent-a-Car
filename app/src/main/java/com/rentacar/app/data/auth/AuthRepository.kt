package com.rentacar.app.data.auth

import android.util.Log
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.rentacar.app.data.auth.AuthProvider
import com.rentacar.app.data.auth.PrimaryRole

interface AuthRepository {
    suspend fun signUp(
        email: String,
        password: String,
        displayName: String?,
        phoneNumber: String? = null,
        primaryRole: PrimaryRole
    ): UserProfile
    suspend fun signIn(email: String, password: String): UserProfile
    suspend fun signInWithGoogle(idToken: String): UserProfile
    suspend fun getCurrentUserProfile(): UserProfile?
    fun getCurrentUserId(): String?
    suspend fun signOut()
    // NEW:
    suspend fun refreshEmailVerification(): UserProfile?
    /**
     * Refreshes the current user profile from Firestore.
     * Useful after manual role updates in Firebase Console to get the latest profile data.
     */
    suspend fun refreshUserProfile(): UserProfile?
    
    /**
     * Sets the primary role for the current user (legacy user migration).
     * This is called when a legacy user selects their role for the first time.
     */
    suspend fun setPrimaryRole(primaryRole: PrimaryRole): UserProfile?
}

class FirebaseAuthRepository(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) : AuthRepository {
    
    companion object {
        private const val TAG = "AuthRepository"
    }
    
    /**
     * Ensures backward compatibility for existing users who don't have the new capability fields.
     * Checks if the Firestore document has the new fields, and if not, applies defaults.
     * For existing agents (role == "AGENT"), maps to isAgent = true and status = "ACTIVE".
     * Also migrates legacy users to primaryRole system.
     */
    private fun ensureBackwardCompatibility(profile: UserProfile, docSnapshot: com.google.firebase.firestore.DocumentSnapshot): UserProfile {
        // Check if primaryRole exists
        val hasPrimaryRole = docSnapshot.contains("primaryRole") && !docSnapshot.getString("primaryRole").isNullOrBlank()
        
        // NOTE: Do NOT auto-derive primaryRole for legacy users
        // They must explicitly select via SelectRoleScreen to ensure proper role assignment
        
        // Check if the document has the new fields by checking if they exist in the snapshot
        val hasNewFields = docSnapshot.contains("isPrivateUser") || 
                          docSnapshot.contains("canBuy") || 
                          docSnapshot.contains("canSell") || 
                          docSnapshot.contains("isAgent") || 
                          docSnapshot.contains("isYard") || 
                          (docSnapshot.contains("status") && docSnapshot.getString("status") != "ACTIVE")
        
        return if (!hasNewFields && !hasPrimaryRole) {
            // This is an existing user without new fields - apply backward compatibility logic
            // BUT: Keep primaryRole as null to force SelectRoleScreen
            val isExistingAgent = profile.role == "AGENT"
            profile.copy(
                isPrivateUser = false, // Old users are not private users by default
                canBuy = false,
                canSell = false,
                isAgent = isExistingAgent, // Map existing AGENT role to isAgent
                isYard = false,
                status = "ACTIVE", // Existing users are active
                primaryRole = null, // Force selection screen - do NOT auto-derive
                roleStatus = "NONE"
            )
        } else {
            // New user or already has new fields - use as-is, but ensure isPrivateUser is calculated correctly
            // Keep primaryRole as-is (don't force default - let SelectRoleScreen handle it if missing)
            profile.copy(
                isPrivateUser = profile.canBuy || profile.canSell,
                primaryRole = profile.primaryRole // Keep existing or null
            )
        }
    }
    
    override suspend fun signUp(
        email: String,
        password: String,
        displayName: String?,
        phoneNumber: String?,
        primaryRole: PrimaryRole
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
            
            // Determine if role requires approval (AGENT or YARD)
            val isPrivilegedRole = PrimaryRole.isPrivileged(primaryRole)
            val actualPrimaryRole: String
            val requestedRole: String?
            val roleStatus: String
            
            if (isPrivilegedRole) {
                // For privileged roles, set as request pending approval
                actualPrimaryRole = PrimaryRole.BUYER.value // Default to BUYER until approved
                requestedRole = primaryRole.value
                roleStatus = "PENDING"
            } else {
                // For non-privileged roles, set immediately
                actualPrimaryRole = primaryRole.value
                requestedRole = null
                roleStatus = "NONE"
            }
            
            // Map primaryRole to legacy fields for backward compatibility
            val isAgent = primaryRole == PrimaryRole.AGENT
            val isYard = primaryRole == PrimaryRole.YARD
            val canBuy = primaryRole == PrimaryRole.BUYER
            val canSell = primaryRole == PrimaryRole.SELLER
            val isPrivateUser = canBuy || canSell
            val status = if (isPrivilegedRole) "PENDING_APPROVAL" else "ACTIVE"
            
            // Build UserProfile (use normalized email)
            val profile = UserProfile(
                uid = user.uid,
                email = normalizedEmail,
                displayName = displayName,
                phoneNumber = phoneNumber,
                createdAt = System.currentTimeMillis(),
                lastLoginAt = System.currentTimeMillis(),
                role = if (isAgent) "AGENT" else "USER", // Legacy field - kept for backward compatibility
                emailVerified = user.isEmailVerified, // usually false immediately after signup
                isPrivateUser = isPrivateUser,
                canBuy = canBuy,
                canSell = canSell,
                isAgent = isAgent,
                isYard = isYard,
                status = status,
                primaryRole = actualPrimaryRole,
                requestedRole = requestedRole,
                roleStatus = roleStatus
            )
            
            // Write to Firestore /users/{uid} with merge to be future-proof
            firestore.collection("users")
                .document(user.uid)
                .set(profile, com.google.firebase.firestore.SetOptions.merge())
                .await()
            
            Log.d(TAG, "User profile created in Firestore: uid=${user.uid}, primaryRole=${actualPrimaryRole}, requestedRole=${requestedRole}")
            
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
                val updated = existing?.copy(
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = user.isEmailVerified
                ) ?: UserProfile(
                    uid = user.uid,
                    email = normalizedEmail,
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = user.isEmailVerified
                )
                // Ensure backward compatibility: if new fields are missing, set defaults
                ensureBackwardCompatibility(updated, docSnapshot)
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
    
    override suspend fun signInWithGoogle(idToken: String): UserProfile = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Signing in with Google")
            
            // Create Firebase credential from Google ID token
            val credential = GoogleAuthProvider.getCredential(idToken, null)
            
            // Sign in with Firebase Auth
            val result = auth.signInWithCredential(credential).await()
            val user = result.user ?: throw Exception("Failed to sign in with Google")
            
            Log.d(TAG, "User signed in with Google: uid=${user.uid}, email=${user.email}")
            
            // Get user info from Google account
            val email = user.email ?: ""
            val displayName = user.displayName
            val photoUrl = user.photoUrl?.toString()
            
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
                // Profile exists, update lastLoginAt and emailVerified (Google accounts are always verified)
                val existing = docSnapshot.toObject(UserProfile::class.java)
                val updated = existing?.copy(
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = true, // Google accounts are always verified
                    displayName = displayName ?: existing.displayName,
                    email = email.ifEmpty { existing.email }
                ) ?: UserProfile(
                    uid = user.uid,
                    email = email,
                    displayName = displayName,
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = true,
                    role = "AGENT"
                )
                // Ensure backward compatibility: if new fields are missing, set defaults
                ensureBackwardCompatibility(updated, docSnapshot)
            } else {
                // Profile doesn't exist, create new one with Google account info
                Log.d(TAG, "User profile not found, creating new profile from Google account")
                UserProfile(
                    uid = user.uid,
                    email = email,
                    displayName = displayName,
                    createdAt = System.currentTimeMillis(),
                    lastLoginAt = System.currentTimeMillis(),
                    emailVerified = true, // Google accounts are always verified
                    role = "AGENT"
                )
            }
            
            // Update profile in Firestore
            firestore.collection("users")
                .document(user.uid)
                .set(profile, com.google.firebase.firestore.SetOptions.merge())
                .await()
            
            Log.d(TAG, "User profile created/updated: uid=${user.uid}")
            
            profile
        } catch (e: Exception) {
            Log.e(TAG, "Error during Google sign in", e)
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
                    val profile = docSnapshot.toObject(UserProfile::class.java)
                    // Ensure backward compatibility: if new fields are missing, set defaults
                    profile?.let { ensureBackwardCompatibility(it, docSnapshot) }
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
                val updated = existing?.copy(emailVerified = emailVerified)
                    ?: UserProfile(
                        uid = user.uid,
                        email = user.email.orEmpty(),
                        createdAt = System.currentTimeMillis(),
                        lastLoginAt = System.currentTimeMillis(),
                        emailVerified = emailVerified
                    )
                // Ensure backward compatibility: if new fields are missing, set defaults
                ensureBackwardCompatibility(updated, docSnapshot)
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
    
    override suspend fun refreshUserProfile(): UserProfile? = withContext(Dispatchers.IO) {
        try {
            val user = auth.currentUser ?: return@withContext null
            
            // Fetch latest profile from Firestore (including any manual role updates)
            val docSnapshot = firestore.collection("users")
                .document(user.uid)
                .get()
                .await()
            
            if (docSnapshot.exists()) {
                val profile = docSnapshot.toObject(UserProfile::class.java)
                // Ensure backward compatibility: if new fields are missing, set defaults
                profile?.let { ensureBackwardCompatibility(it, docSnapshot) }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error refreshing user profile", e)
            null
        }
    }
    
    override suspend fun setPrimaryRole(primaryRole: PrimaryRole): UserProfile? = withContext(Dispatchers.IO) {
        try {
            val user = auth.currentUser ?: return@withContext null
            
            // SECURITY: Do not allow self-escalation to privileged roles
            val isPrivilegedRole = PrimaryRole.isPrivileged(primaryRole)
            val actualPrimaryRole: String
            val requestedRole: String?
            val roleStatus: String
            
            if (isPrivilegedRole) {
                // For AGENT/YARD, set as request pending approval
                actualPrimaryRole = PrimaryRole.BUYER.value // Safe default until approved
                requestedRole = primaryRole.value
                roleStatus = "PENDING"
            } else {
                // For BUYER/SELLER, set immediately
                actualPrimaryRole = primaryRole.value
                requestedRole = null
                roleStatus = "NONE"
            }
            
            // Map to legacy fields for backward compatibility
            val isAgent = primaryRole == PrimaryRole.AGENT
            val isYard = primaryRole == PrimaryRole.YARD
            val canBuy = primaryRole == PrimaryRole.BUYER || isPrivilegedRole // Allow buying while pending
            val canSell = primaryRole == PrimaryRole.SELLER
            val isPrivateUser = canBuy || canSell
            val status = if (isPrivilegedRole) "PENDING_APPROVAL" else "ACTIVE"
            
            val updateData = hashMapOf<String, Any>(
                "primaryRole" to actualPrimaryRole,
                "requestedRole" to (requestedRole ?: ""),
                "roleStatus" to roleStatus,
                "isAgent" to isAgent,
                "isYard" to isYard,
                "canBuy" to canBuy,
                "canSell" to canSell,
                "isPrivateUser" to isPrivateUser,
                "status" to status
            )
            
            // Clear requestedRole if not set
            if (requestedRole == null) {
                updateData["requestedRole"] = com.google.firebase.firestore.FieldValue.delete()
            }
            
            // Update legacy role field
            if (isAgent) {
                updateData["role"] = "AGENT"
            } else {
                updateData["role"] = "USER"
            }
            
            // Update Firestore
            firestore.collection("users")
                .document(user.uid)
                .update(updateData)
                .await()
            
            Log.d(TAG, "Primary role set: actual=$actualPrimaryRole, requested=$requestedRole, status=$roleStatus")
            
            // Fetch updated profile
            val docSnapshot = firestore.collection("users")
                .document(user.uid)
                .get()
                .await()
            
            if (docSnapshot.exists()) {
                val profile = docSnapshot.toObject(UserProfile::class.java)
                profile?.let { ensureBackwardCompatibility(it, docSnapshot) }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting primary role", e)
            null
        }
    }
}

