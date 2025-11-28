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
    val role: String = "AGENT", // Legacy field - kept for backward compatibility
    val emailVerified: Boolean = false,
    // License placeholders (inspired by HealthExpert, but simplified for now)
    val licenseType: String? = null,       // e.g., "STANDARD", "PRO", etc.
    val licenseActive: Boolean = false,
    val licenseExpiresAt: Long? = null,
    // New multi-role capability flags (platform phase) - kept for backward compatibility
    val isPrivateUser: Boolean = false,     // true if canBuy || canSell
    val canBuy: Boolean = false,            // true if user wants to search for cars to buy
    val canSell: Boolean = false,           // true if user wants to post cars for sale
    val isAgent: Boolean = false,           // true if user is an agent
    val isYard: Boolean = false,            // true if user is a yard/dealer
    val status: String = "ACTIVE",          // "ACTIVE" | "PENDING_APPROVAL" | "SUSPENDED"
    // New single-role system
    val primaryRole: String? = null,        // "BUYER" | "SELLER" | "AGENT" | "YARD" - single primary role
    val requestedRole: String? = null,       // Same enum - role user requested (for approval flow)
    val roleStatus: String = "NONE",         // "NONE" | "PENDING" | "APPROVED" | "REJECTED"
    val roleUpdatedAt: Long? = null,         // Timestamp when role was last updated
    val roleUpdatedByUid: String? = null,    // UID of admin who updated the role
    val roleUpdateReason: String? = null     // Optional reason for role change
)

