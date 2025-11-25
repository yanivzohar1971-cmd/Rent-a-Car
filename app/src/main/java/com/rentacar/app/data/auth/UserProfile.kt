package com.rentacar.app.data.auth

import androidx.annotation.Keep
import com.google.firebase.firestore.IgnoreExtraProperties

/**
 * User profile stored in Firestore under /users/{uid}
 * Contains user account information and license placeholders
 * 
 * All fields have default values to enable Firestore deserialization via no-arg constructor.
 */
@Keep
@IgnoreExtraProperties
data class UserProfile(
    val uid: String = "",
    val email: String = "",
    val displayName: String? = null,
    val phoneNumber: String? = null,
    val createdAt: Long = 0L,
    val lastLoginAt: Long = 0L,
    val role: String = "AGENT",
    val emailVerified: Boolean = false,
    // License placeholders (inspired by HealthExpert, but simplified for now)
    val licenseType: String? = null,       // e.g., "STANDARD", "PRO", etc.
    val licenseActive: Boolean = false,
    val licenseExpiresAt: Long? = null
)

