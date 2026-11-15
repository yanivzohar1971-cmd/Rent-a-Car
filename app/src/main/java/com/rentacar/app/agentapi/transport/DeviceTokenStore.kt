package com.rentacar.app.agentapi.transport

import java.util.concurrent.ConcurrentHashMap

/** Server-side persistence for issued device tokens. */
interface DeviceTokenStore {
    fun put(token: DeviceAccessToken)
    fun get(tokenId: String): DeviceAccessToken?

    /** Marks the token revoked. Returns false when the token id is unknown. */
    fun revoke(tokenId: String): Boolean
}

/** Volatile in-memory store (development / tests). Tokens do not survive process restart. */
class InMemoryDeviceTokenStore : DeviceTokenStore {
    private val tokens = ConcurrentHashMap<String, DeviceAccessToken>()

    override fun put(token: DeviceAccessToken) {
        tokens[token.tokenId] = token
    }

    override fun get(tokenId: String): DeviceAccessToken? = tokens[tokenId]

    override fun revoke(tokenId: String): Boolean {
        var found = false
        tokens.computeIfPresent(tokenId) { _, existing ->
            found = true
            existing.copy(revoked = true)
        }
        return found
    }

    fun size(): Int = tokens.size
}
