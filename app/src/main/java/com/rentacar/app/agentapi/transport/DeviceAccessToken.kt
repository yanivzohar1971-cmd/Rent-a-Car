package com.rentacar.app.agentapi.transport

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Server-side record of an issued device token.
 *
 * The string presented by the device is `rac1.<tokenId>.<signature>` (see
 * [DeviceTokenSigner.presentedToken]); it contains no user data. The record binds the
 * device to a [BoundSessionIdentity] and is covered by an HMAC so any tampering with
 * the stored fields invalidates the token.
 */
data class DeviceAccessToken(
    val tokenId: String,
    val deviceId: String,
    val session: BoundSessionIdentity,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val signature: String,
    val revoked: Boolean = false
) {
    fun isExpired(nowEpochMs: Long): Boolean = nowEpochMs >= expiresAtEpochMs
}

/**
 * HMAC-SHA256 signer for [DeviceAccessToken]. The secret is supplied at construction by
 * trusted server-side wiring (tests use a test secret). It is never serialized.
 */
class DeviceTokenSigner(secret: ByteArray) {
    private val key: SecretKeySpec

    init {
        require(secret.size >= MIN_SECRET_BYTES) { "Token secret must be at least $MIN_SECRET_BYTES bytes" }
        key = SecretKeySpec(secret.copyOf(), HMAC_ALGORITHM)
    }

    constructor(secret: String) : this(secret.toByteArray(StandardCharsets.UTF_8))

    /** Signature over immutable token fields. `revoked` is store state and is not signed. */
    fun sign(
        tokenId: String,
        deviceId: String,
        session: BoundSessionIdentity,
        issuedAtEpochMs: Long,
        expiresAtEpochMs: Long
    ): String {
        val canonical = listOf(
            tokenId,
            deviceId,
            session.userUid,
            session.permissions.sorted().joinToString(","),
            issuedAtEpochMs.toString(),
            expiresAtEpochMs.toString()
        ).joinToString("\n")
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hmac(canonical))
    }

    fun issue(
        tokenId: String,
        deviceId: String,
        session: BoundSessionIdentity,
        issuedAtEpochMs: Long,
        expiresAtEpochMs: Long
    ): DeviceAccessToken = DeviceAccessToken(
        tokenId = tokenId,
        deviceId = deviceId,
        session = session,
        issuedAtEpochMs = issuedAtEpochMs,
        expiresAtEpochMs = expiresAtEpochMs,
        signature = sign(tokenId, deviceId, session, issuedAtEpochMs, expiresAtEpochMs)
    )

    /** True when the record's stored signature matches a fresh HMAC of its fields. */
    fun isRecordSignatureValid(token: DeviceAccessToken): Boolean = constantTimeEquals(
        token.signature,
        sign(token.tokenId, token.deviceId, token.session, token.issuedAtEpochMs, token.expiresAtEpochMs)
    )

    /** Opaque wire form handed to the device exactly once at pairing time. */
    fun presentedToken(token: DeviceAccessToken): String =
        "$PREFIX.${token.tokenId}.${token.signature}"

    /** True when [presentedSignature] matches the HMAC of [token]'s fields. */
    fun isPresentedSignatureValid(token: DeviceAccessToken, presentedSignature: String): Boolean =
        isRecordSignatureValid(token) && constantTimeEquals(presentedSignature, token.signature)

    private fun hmac(text: String): ByteArray {
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(key)
        return mac.doFinal(text.toByteArray(StandardCharsets.UTF_8))
    }

    companion object {
        const val PREFIX: String = "rac1"
        const val MIN_SECRET_BYTES: Int = 16
        private const val HMAC_ALGORITHM = "HmacSHA256"

        /** Returns (tokenId, signature) or null when the presented string is malformed. */
        fun parsePresented(presented: String?): Pair<String, String>? {
            val parts = presented?.trim()?.split('.') ?: return null
            if (parts.size != 3 || parts[0] != PREFIX) return null
            if (parts[1].isEmpty() || parts[2].isEmpty()) return null
            return parts[1] to parts[2]
        }

        fun constantTimeEquals(a: String, b: String): Boolean = MessageDigest.isEqual(
            a.toByteArray(StandardCharsets.UTF_8),
            b.toByteArray(StandardCharsets.UTF_8)
        )
    }
}
