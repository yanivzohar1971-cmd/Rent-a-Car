package com.rentacar.app.agentapi.transport

import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * AGENT-104: source of the HMAC-SHA256 device-token signing key.
 *
 * Callers never see key material: they ask the provider to compute the MAC. This lets a
 * hardware/Keystore-backed implementation keep the key non-exportable.
 */
interface DeviceSigningKeyProvider {
    /** Stable identifier of the key (alias); never secret. */
    val keyId: String

    /** HMAC-SHA256 of [data] under the provider's key. */
    fun hmacSha256(data: ByteArray): ByteArray
}

/** Volatile in-memory key (tests / development). The key does not survive process restart. */
class InMemoryDeviceSigningKeyProvider(
    secret: ByteArray = randomSecret(),
    override val keyId: String = "in-memory"
) : DeviceSigningKeyProvider {
    private val key: SecretKeySpec

    init {
        require(secret.size >= DeviceTokenSigner.MIN_SECRET_BYTES) {
            "Signing key must be at least ${DeviceTokenSigner.MIN_SECRET_BYTES} bytes"
        }
        key = SecretKeySpec(secret.copyOf(), HMAC_ALGORITHM)
    }

    override fun hmacSha256(data: ByteArray): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(key)
        return mac.doFinal(data)
    }

    companion object {
        private const val HMAC_ALGORITHM = "HmacSHA256"
        private val random = SecureRandom()

        fun randomSecret(size: Int = 32): ByteArray = ByteArray(size).also { random.nextBytes(it) }
    }
}
