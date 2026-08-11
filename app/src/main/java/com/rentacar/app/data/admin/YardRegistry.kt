package com.rentacar.app.data.admin

import androidx.annotation.Keep
import com.google.firebase.firestore.IgnoreExtraProperties

/**
 * Yard registry entry in global yards/{yardUid} collection
 * Server-written canonical record (not user-scoped)
 */
@Keep
@IgnoreExtraProperties
data class YardRegistry(
    val yardUid: String = "",
    val displayName: String = "",
    val phone: String = "",
    val city: String = "",
    val createdAt: com.google.firebase.Timestamp? = null,
    val status: YardStatus = YardStatus.PENDING,
    val statusReason: String? = null,
    val verifiedAt: com.google.firebase.Timestamp? = null,
    val verifiedBy: String? = null,
    val importProfile: ImportProfile? = null,
    val kyc: KycInfo? = null,
    val updatedAt: com.google.firebase.Timestamp? = null
)

enum class YardStatus {
    PENDING,
    APPROVED,
    REJECTED,
    NEEDS_INFO;
    
    companion object {
        fun fromString(value: String?): YardStatus {
            return when (value?.uppercase()) {
                "PENDING" -> PENDING
                "APPROVED" -> APPROVED
                "REJECTED" -> REJECTED
                "NEEDS_INFO" -> NEEDS_INFO
                else -> PENDING
            }
        }
    }
}

@Keep
@IgnoreExtraProperties
data class ImportProfile(
    val importerId: String = "",
    val importerVersion: Int = 1,
    val config: Map<String, Any> = emptyMap(),
    val assignedAt: com.google.firebase.Timestamp? = null,
    val assignedBy: String? = null
)

@Keep
@IgnoreExtraProperties
data class KycInfo(
    val companyId: String? = null,
    val licenseDocUrl: String? = null,
    val notes: String? = null
)

