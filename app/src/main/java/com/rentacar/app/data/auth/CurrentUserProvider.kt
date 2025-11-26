package com.rentacar.app.data.auth

import com.rentacar.app.data.auth.AuthProvider
import com.google.firebase.auth.FirebaseAuth

/**
 * Provides the current Firebase user UID for scoping Room queries.
 * 
 * Returns null if no user is logged in, which should be handled gracefully
 * by the calling code (e.g., return empty results or show login screen).
 */
object CurrentUserProvider {
    /**
     * Gets the current Firebase user UID.
     * @return The UID of the currently logged-in user, or null if not logged in
     */
    fun getCurrentUid(): String? {
        return AuthProvider.auth.currentUser?.uid
    }
    
    /**
     * Gets the current Firebase user UID, throwing an exception if not logged in.
     * Use this when you're certain a user should be logged in.
     * @throws IllegalStateException if no user is logged in
     */
    fun requireCurrentUid(): String {
        return getCurrentUid() ?: throw IllegalStateException("No user is currently logged in")
    }
}

