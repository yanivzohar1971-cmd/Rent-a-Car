package com.rentacar.app.agentapi.transport

import java.util.concurrent.ConcurrentHashMap

enum class ConnectivityState {
    ONLINE,
    OFFLINE,
    BACKGROUND,
    UNAVAILABLE
}

data class DevicePresence(
    val deviceId: String,
    val state: ConnectivityState,
    val lastSeenEpochMs: Long?
)

/**
 * In-memory presence tracker. A device that was ONLINE/BACKGROUND but silent for
 * longer than [staleAfterMs] is reported OFFLINE; a never-seen device is UNAVAILABLE.
 */
class DevicePresenceTracker(
    private val clock: () -> Long = System::currentTimeMillis,
    private val staleAfterMs: Long = DEFAULT_STALE_AFTER_MS
) {
    private data class Entry(val state: ConnectivityState, val lastSeenEpochMs: Long)

    private val entries = ConcurrentHashMap<String, Entry>()

    fun heartbeat(deviceId: String, state: ConnectivityState = ConnectivityState.ONLINE) {
        entries[deviceId] = Entry(state, clock())
    }

    fun markOffline(deviceId: String) {
        val last = entries[deviceId]?.lastSeenEpochMs ?: clock()
        entries[deviceId] = Entry(ConnectivityState.OFFLINE, last)
    }

    fun presence(deviceId: String): DevicePresence {
        val entry = entries[deviceId]
            ?: return DevicePresence(deviceId, ConnectivityState.UNAVAILABLE, null)
        val live = entry.state == ConnectivityState.ONLINE || entry.state == ConnectivityState.BACKGROUND
        val effective = if (live && clock() - entry.lastSeenEpochMs > staleAfterMs) {
            ConnectivityState.OFFLINE
        } else {
            entry.state
        }
        return DevicePresence(deviceId, effective, entry.lastSeenEpochMs)
    }

    fun isReachable(deviceId: String): Boolean = presence(deviceId).state == ConnectivityState.ONLINE

    companion object {
        const val DEFAULT_STALE_AFTER_MS: Long = 60_000
    }
}
