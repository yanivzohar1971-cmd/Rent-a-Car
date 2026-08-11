package com.rentacar.app.data.admin

import androidx.annotation.Keep
import com.google.firebase.firestore.IgnoreExtraProperties

/**
 * Analytics event stored in analyticsEvents/{eventId}
 */
@Keep
@IgnoreExtraProperties
data class AnalyticsEvent(
    val type: AnalyticsEventType = AnalyticsEventType.CAR_VIEW,
    val createdAt: com.google.firebase.Timestamp? = null,
    val viewerUid: String? = null,
    val yardUid: String = "",
    val carId: String = "",
    val sessionId: String? = null,
    val device: DeviceInfo? = null
)

enum class AnalyticsEventType {
    CAR_VIEW
}

@Keep
@IgnoreExtraProperties
data class DeviceInfo(
    val platform: String = "ANDROID",
    val appVersion: String? = null
)

