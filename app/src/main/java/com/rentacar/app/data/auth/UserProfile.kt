package com.rentacar.app.data.auth

/**
 * User profile stored in Firestore under /users/{uid}
 * Contains user account information and license placeholders
 */
data class UserProfile(
    val uid: String,
    val email: String,
    val displayName: String? = null,
    val phoneNumber: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val lastLoginAt: Long = System.currentTimeMillis(),
    // NEW FIELDS:
    val role: String = "AGENT",
    val emailVerified: Boolean = false,
    // License placeholders (inspired by HealthExpert, but simplified for now)
    val licenseType: String? = null,       // e.g., "STANDARD", "PRO", etc.
    val licenseActive: Boolean = false,
    val licenseExpiresAt: Long? = null
)

