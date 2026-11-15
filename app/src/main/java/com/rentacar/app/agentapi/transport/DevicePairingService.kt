package com.rentacar.app.agentapi.transport

import java.security.SecureRandom

enum class TokenFailure {
    MALFORMED,
    UNKNOWN_TOKEN,
    SIGNATURE_MISMATCH,
    EXPIRED,
    REVOKED
}

/** Result of pairing: [presentedToken] is shown to the device once; only [token] is stored. */
data class PairingResult(
    val token: DeviceAccessToken,
    val device: DeviceIdentity,
    val presentedToken: String
)

data class ValidatedDeviceSession(
    val tokenId: String,
    val deviceId: String,
    val session: BoundSessionIdentity,
    val expiresAtEpochMs: Long
)

sealed class TokenValidation {
    data class Valid(val session: ValidatedDeviceSession) : TokenValidation()
    data class Invalid(val failure: TokenFailure, val message: String) : TokenValidation()
}

/**
 * Issues, revokes and validates device tokens. Identity always originates from a
 * [BoundSessionIdentity] supplied by trusted code at pairing time.
 */
class DevicePairingService(
    private val store: DeviceTokenStore,
    private val signer: DeviceTokenSigner,
    private val clock: () -> Long = System::currentTimeMillis,
    private val tokenIdFactory: () -> String = { randomTokenId() }
) {
    fun pair(device: DeviceIdentity, session: BoundSessionIdentity, ttlMs: Long): PairingResult {
        require(ttlMs > 0) { "ttlMs must be positive" }
        require(ttlMs <= MAX_TTL_MS) { "ttlMs must be <= $MAX_TTL_MS" }
        val now = clock()
        val token = signer.issue(
            tokenId = tokenIdFactory(),
            deviceId = device.deviceId,
            session = session,
            issuedAtEpochMs = now,
            expiresAtEpochMs = now + ttlMs
        )
        store.put(token)
        return PairingResult(token, device, signer.presentedToken(token))
    }

    fun revoke(tokenId: String): Boolean = store.revoke(tokenId)

    fun validate(presentedToken: String?): TokenValidation {
        val (tokenId, presentedSignature) = DeviceTokenSigner.parsePresented(presentedToken)
            ?: return TokenValidation.Invalid(TokenFailure.MALFORMED, "Malformed device token")
        val token = store.get(tokenId)
            ?: return TokenValidation.Invalid(TokenFailure.UNKNOWN_TOKEN, "Unknown device token")
        if (!signer.isPresentedSignatureValid(token, presentedSignature)) {
            return TokenValidation.Invalid(TokenFailure.SIGNATURE_MISMATCH, "Invalid device token signature")
        }
        if (token.revoked) {
            return TokenValidation.Invalid(TokenFailure.REVOKED, "Device token was revoked")
        }
        if (token.isExpired(clock())) {
            return TokenValidation.Invalid(TokenFailure.EXPIRED, "Device token expired")
        }
        return TokenValidation.Valid(
            ValidatedDeviceSession(
                tokenId = token.tokenId,
                deviceId = token.deviceId,
                session = token.session,
                expiresAtEpochMs = token.expiresAtEpochMs
            )
        )
    }

    companion object {
        const val MAX_TTL_MS: Long = 30L * 24 * 60 * 60 * 1000

        private val random = SecureRandom()

        fun randomTokenId(): String {
            val bytes = ByteArray(16)
            random.nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
