package com.rentacar.app.agentapi.transport

/** Public, non-secret description of a device that holds a [DeviceAccessToken]. */
data class DeviceIdentity(
    val deviceId: String,
    val displayName: String
) {
    init {
        require(deviceId.isNotBlank()) { "deviceId is required" }
        require(deviceId.length <= 128) { "deviceId too long" }
    }
}
