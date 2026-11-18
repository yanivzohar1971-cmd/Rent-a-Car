package com.rentacar.app.agentapi.relay

import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AGENT-138: end-to-end confidentiality between a paired Claude MCP client and the phone.
 * Must stay byte-compatible with tools/relay/e2e.mjs.
 *
 * A 32-byte channel key is generated on the phone at pairing and delivered to the client inside the
 * pairing offer (itself sealed under the one-time code). Every request/response body is then
 * AES-256-GCM encrypted under that key; the relay only sees routing metadata (deviceId, clientId,
 * msgId, sizes, timing).
 *
 *   AAD(request)  = "rac-e2e-v1|c2d|<deviceId>|<clientId>|<msgId>"
 *   AAD(response) = "rac-e2e-v1|d2c|<deviceId>|<clientId>|<msgId>"   (binds the reply to the request)
 *   wire          = { v:1, clientId, msgId, ivB64, ctB64 }  ct = ciphertext || 128-bit tag
 */
object RelayE2E {
    const val VERSION = 1
    private val random = SecureRandom()
    private val b64 = Base64.getEncoder()
    private val b64d = Base64.getDecoder()

    fun newChannelKey(): ByteArray = ByteArray(32).also { random.nextBytes(it) }

    fun aad(direction: String, deviceId: String, clientId: String, msgId: String): ByteArray =
        "rac-e2e-v$VERSION|$direction|$deviceId|$clientId|$msgId".toByteArray(StandardCharsets.UTF_8)

    /** Returns (ivB64, ctB64). */
    fun seal(key: ByteArray, aad: ByteArray, plaintext: String, iv: ByteArray = ByteArray(12).also { random.nextBytes(it) }): Pair<String, String> {
        require(key.size == 32) { "channel key must be 32 bytes" }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad)
        return b64.encodeToString(iv) to b64.encodeToString(c.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8)))
    }

    /** Throws on wrong key, wrong AAD (device/client/msg/direction) or tampering. */
    fun open(key: ByteArray, aad: ByteArray, ivB64: String, ctB64: String): String {
        require(key.size == 32) { "channel key must be 32 bytes" }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b64d.decode(ivB64)))
        c.updateAAD(aad)
        return String(c.doFinal(b64d.decode(ctB64)), StandardCharsets.UTF_8)
    }
}

/**
 * Bounded replay cache for E2E message ids (phone side). Entries expire after [ttlMs]; when full the
 * oldest entries are evicted, and requests are additionally bounded by their own expiry window so an
 * evicted id cannot be replayed after its expiry.
 */
class E2EReplayCache(private val maxEntries: Int = 10_000, private val ttlMs: Long = 10 * 60 * 1000) {
    private val seen = LinkedHashMap<String, Long>()

    /** Returns true the first time [msgId] is seen within the TTL; false for a replay. */
    @Synchronized
    fun firstSeen(msgId: String, nowMs: Long): Boolean {
        val it = seen.entries.iterator()
        while (it.hasNext()) {
            val e = it.next()
            if (nowMs - e.value > ttlMs) it.remove() else break
        }
        if (seen.containsKey(msgId)) return false
        seen[msgId] = nowMs
        while (seen.size > maxEntries) seen.remove(seen.keys.first())
        return true
    }
}
