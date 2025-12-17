package com.rentacar.app.data.yard

import androidx.annotation.Keep
import com.google.firebase.firestore.IgnoreExtraProperties

/**
 * Yard profile data model stored in Firestore under /users/{uid}/yardProfile/profile
 * Contains all key details of a yard/lot (address, phones, legal details, etc.)
 * 
 * All fields have default values to enable Firestore deserialization via no-arg constructor.
 */
@Keep
@IgnoreExtraProperties
data class YardProfile(
    val id: String = "profile", // Fixed ID for singleton document
    val displayName: String = "", // שם המגרש (required)
    val legalName: String? = null, // שם חוקי / תאגידי (optional)
    val registrationNumber: String? = null, // ח.פ. / Company ID (optional)
    val phone: String = "", // טלפון ראשי (required)
    val secondaryPhone: String? = null, // טלפון נוסף (optional)
    val email: String? = null, // אימייל (optional)
    val website: String? = null, // אתר אינטרנט (optional)
    val contactPersonName: String? = null, // איש קשר (optional)
    val city: String = "", // עיר (required)
    val street: String = "", // רחוב (required)
    val houseNumber: String? = null, // מספר בית (optional)
    val zipCode: String? = null, // מיקוד (optional)
    val openingHours: String? = null, // טקסט חופשי לשעות פתיחה (optional, multiline)
    val usageValidUntil: Long? = null, // תוקף שימוש במיליס / timestamp (optional)
    val createdAt: Long? = null,
    val updatedAt: Long? = null,
    val isActive: Boolean = true // default true
) {
    companion object {
        /**
         * Create an empty/default YardProfile instance
         */
        fun empty(): YardProfile = YardProfile()
    }
}

