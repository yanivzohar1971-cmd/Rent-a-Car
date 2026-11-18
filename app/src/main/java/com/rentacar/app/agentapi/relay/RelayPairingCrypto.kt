package com.rentacar.app.agentapi.relay

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** Encrypted pairing offer uploaded to the relay. The relay cannot read the token inside. */
data class SealedPairingOffer(
    val codeId: String,
    val deviceId: String,
    val saltB64: String,
    val ivB64: String,
    val ciphertextB64: String,
    val expiresAtEpochMs: Long
)

/**
 * AGENT-127: one-time pairing code crypto. Must stay byte-compatible with tools/relay/pairing.mjs.
 *
 *  code     10 Crockford-base32 chars (~50 bits), shown as XXXXX-XXXXX, single use, 5 min TTL
 *  codeId   hex(SHA-256("rentacar-pair-id:" + code)).take(32)   — relay lookup key
 *  key      PBKDF2-HMAC-SHA256(code, salt16, 210000 iterations, 256 bit)
 *  cipher   AES-256-GCM, iv12, AAD = deviceId, ciphertext||tag (128 bit)
 */
object RelayPairingCrypto {
    const val CODE_LENGTH = 10
    const val PBKDF2_ITERATIONS = 210_000
    const val OFFER_TTL_MS: Long = 5 * 60 * 1000
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private val random = SecureRandom()
    private val b64 = Base64.getEncoder()
    private val b64d = Base64.getDecoder()

    fun newCode(): String = buildString { repeat(CODE_LENGTH) { append(ALPHABET[random.nextInt(ALPHABET.length)]) } }

    fun display(code: String): String = normalize(code).let { "${it.substring(0, 5)}-${it.substring(5)}" }

    fun normalize(code: String): String = code.uppercase().filter { it != '-' && !it.isWhitespace() }
        .replace('O', '0').replace('I', '1').replace('L', '1')

    fun isWellFormed(code: String): Boolean = normalize(code).let { c -> c.length == CODE_LENGTH && c.all { it in ALPHABET } }

    fun codeId(code: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("rentacar-pair-id:${normalize(code)}".toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }.take(32)
    }

    fun seal(
        code: String,
        deviceId: String,
        plaintextJson: String,
        nowEpochMs: Long,
        salt: ByteArray = ByteArray(16).also { random.nextBytes(it) },
        iv: ByteArray = ByteArray(12).also { random.nextBytes(it) }
    ): SealedPairingOffer {
        require(isWellFormed(code)) { "malformed pairing code" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(code, salt), GCMParameterSpec(128, iv))
        cipher.updateAAD(deviceId.toByteArray(StandardCharsets.UTF_8))
        val ct = cipher.doFinal(plaintextJson.toByteArray(StandardCharsets.UTF_8))
        return SealedPairingOffer(
            codeId = codeId(code),
            deviceId = deviceId,
            saltB64 = b64.encodeToString(salt),
            ivB64 = b64.encodeToString(iv),
            ciphertextB64 = b64.encodeToString(ct),
            expiresAtEpochMs = nowEpochMs + OFFER_TTL_MS
        )
    }

    /** Inverse of [seal]; throws on a wrong code or tampered offer (GCM tag check). */
    fun open(code: String, offer: SealedPairingOffer): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(code, b64d.decode(offer.saltB64)), GCMParameterSpec(128, b64d.decode(offer.ivB64)))
        cipher.updateAAD(offer.deviceId.toByteArray(StandardCharsets.UTF_8))
        return String(cipher.doFinal(b64d.decode(offer.ciphertextB64)), StandardCharsets.UTF_8)
    }

    private fun key(code: String, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(normalize(code).toCharArray(), salt, PBKDF2_ITERATIONS, 256)
        val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return SecretKeySpec(bytes, "AES")
    }
}
