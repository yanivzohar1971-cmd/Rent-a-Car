package com.rentacar.app.agentapi.commands

import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import java.nio.charset.StandardCharsets
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Short-lived proof that a specific prepared command (identified by [commandHash]) was
 * previewed. It is bound to the command id, hash, user and expiry via HMAC-SHA256, so it
 * cannot be forged, replayed on a different command, or reused by a different user
 * without the server-side secret.
 */
data class CommandConfirmationToken(
    val commandId: String,
    val commandHash: String,
    val expiresAtEpochMs: Long,
    val signature: String
) {
    /** Wire form: `cct1.<commandId>.<commandHash>.<expiresAtEpochMs>.<signature>`. */
    fun encode(): String = "$PREFIX.$commandId.$commandHash.$expiresAtEpochMs.$signature"

    companion object {
        const val PREFIX: String = "cct1"

        fun parse(presented: String?): CommandConfirmationToken? {
            val parts = presented?.trim()?.split('.') ?: return null
            if (parts.size != 5 || parts[0] != PREFIX) return null
            val expires = parts[3].toLongOrNull() ?: return null
            if (parts[1].isEmpty() || parts[2].isEmpty() || parts[4].isEmpty()) return null
            return CommandConfirmationToken(parts[1], parts[2], expires, parts[4])
        }
    }
}

sealed class ConfirmationCheck {
    object Valid : ConfirmationCheck()
    data class Invalid(val reason: String) : ConfirmationCheck()
}

class CommandConfirmationTokenService(
    secret: ByteArray,
    private val clock: () -> Long = System::currentTimeMillis
) {
    private val key: SecretKeySpec

    init {
        require(secret.size >= DeviceTokenSigner.MIN_SECRET_BYTES) {
            "Confirmation secret must be at least ${DeviceTokenSigner.MIN_SECRET_BYTES} bytes"
        }
        key = SecretKeySpec(secret.copyOf(), "HmacSHA256")
    }

    fun issue(command: PreparedCommand, ttlMs: Long): CommandConfirmationToken {
        require(ttlMs > 0) { "ttlMs must be positive" }
        val expires = minOf(clock() + ttlMs, command.expiresAtEpochMs)
        return CommandConfirmationToken(
            commandId = command.commandId,
            commandHash = command.commandHash,
            expiresAtEpochMs = expires,
            signature = sign(command.commandId, command.commandHash, command.userUid, expires)
        )
    }

    fun verify(presented: String?, command: PreparedCommand): ConfirmationCheck {
        val token = CommandConfirmationToken.parse(presented)
            ?: return ConfirmationCheck.Invalid("Malformed confirmation token")
        if (token.commandId != command.commandId || token.commandHash != command.commandHash) {
            return ConfirmationCheck.Invalid("Confirmation token does not match this command")
        }
        val expected = sign(command.commandId, command.commandHash, command.userUid, token.expiresAtEpochMs)
        if (!DeviceTokenSigner.constantTimeEquals(token.signature, expected)) {
            return ConfirmationCheck.Invalid("Invalid confirmation token signature")
        }
        if (clock() >= token.expiresAtEpochMs) {
            return ConfirmationCheck.Invalid("Confirmation token expired")
        }
        return ConfirmationCheck.Valid
    }

    private fun sign(commandId: String, commandHash: String, userUid: String, expires: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key)
        val canonical = listOf(commandId, commandHash, userUid, expires.toString()).joinToString("\n")
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(mac.doFinal(canonical.toByteArray(StandardCharsets.UTF_8)))
    }
}
