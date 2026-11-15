package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.DeviceAccessToken
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DeviceSigningKeyProvider
import com.rentacar.app.agentapi.transport.DeviceTokenRecordCodec
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.EncryptedPrefsDeviceTokenStore
import com.rentacar.app.agentapi.transport.InMemoryDeviceSigningKeyProvider
import com.rentacar.app.agentapi.transport.InMemoryDeviceTokenStore
import com.rentacar.app.agentapi.transport.PersistentDeviceTokenStore
import com.rentacar.app.agentapi.transport.SecureStringStore
import com.rentacar.app.agentapi.transport.TokenFailure
import com.rentacar.app.agentapi.transport.TokenValidation
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** AGENT-104: signing key provider + persistent token store (JVM-only; Keystore is not exercised). */
class DeviceKeyAndTokenStoreTest {
    private val fx = GatewayTestFixture()

    /** Fake "disk": serialize/deserialize the whole map the way encrypted prefs persist it. */
    private class FakeEncryptedStore(initial: Map<String, String> = emptyMap()) : SecureStringStore {
        private val map = LinkedHashMap(initial)
        override fun get(key: String) = map[key]
        override fun put(key: String, value: String) { map[key] = value }
        override fun remove(key: String) { map.remove(key) }
        override fun keys(): Set<String> = map.keys.toSet()
        override fun clear() = map.clear()

        fun serialize(): String = map.entries.joinToString("\n") {
            java.util.Base64.getEncoder().encodeToString(it.key.toByteArray()) + ":" +
                java.util.Base64.getEncoder().encodeToString(it.value.toByteArray())
        }

        companion object {
            fun deserialize(blob: String): FakeEncryptedStore = FakeEncryptedStore(
                blob.lines().filter { it.isNotEmpty() }.associate { line ->
                    val (k, v) = line.split(':')
                    String(java.util.Base64.getDecoder().decode(k)) to String(java.util.Base64.getDecoder().decode(v))
                }
            )
        }
    }

    // ---- DeviceSigningKeyProvider ----

    @Test
    fun inMemoryProviderIsDeterministicPerKeyAndDiffersAcrossKeys() {
        val secret = ByteArray(32) { it.toByte() }
        val a = InMemoryDeviceSigningKeyProvider(secret)
        val b = InMemoryDeviceSigningKeyProvider(secret.copyOf())
        val other = InMemoryDeviceSigningKeyProvider()
        val data = "payload".toByteArray()
        assertArrayEquals(a.hmacSha256(data), b.hmacSha256(data))
        assertFalse(a.hmacSha256(data).contentEquals(other.hmacSha256(data)))
        assertEquals(32, a.hmacSha256(data).size)
    }

    @Test
    fun inMemoryProviderRejectsShortKeys() {
        try {
            InMemoryDeviceSigningKeyProvider(ByteArray(4))
            fail("expected IllegalArgumentException")
        } catch (_: IllegalArgumentException) {
            // expected
        }
    }

    @Test
    fun providerBackedSignerMatchesSecretBackedSigner() {
        val secret = GatewayTestFixture.TEST_SECRET.toByteArray()
        val bySecret = DeviceTokenSigner(secret)
        val byProvider = DeviceTokenSigner(InMemoryDeviceSigningKeyProvider(secret))
        val session = fx.session("user-a")
        assertEquals(
            bySecret.sign("t", "d", session, 1, 2),
            byProvider.sign("t", "d", session, 1, 2)
        )
    }

    @Test
    fun tokensIssuedWithAProviderValidateOnlyWithTheSameKey() {
        val provider: DeviceSigningKeyProvider = InMemoryDeviceSigningKeyProvider()
        val store = InMemoryDeviceTokenStore()
        val svc = DevicePairingService(store, DeviceTokenSigner(provider), fx.clock)
        val paired = svc.pair(DeviceIdentity("d1", "Phone"), fx.session("user-a"), 60_000)
        assertTrue(svc.validate(paired.presentedToken) is TokenValidation.Valid)

        val wrongKey = DevicePairingService(store, DeviceTokenSigner(InMemoryDeviceSigningKeyProvider()), fx.clock)
        val invalid = wrongKey.validate(paired.presentedToken) as TokenValidation.Invalid
        assertEquals(TokenFailure.SIGNATURE_MISMATCH, invalid.failure)
    }

    // ---- InMemory store contract ----

    @Test
    fun inMemoryStoreSatisfiesDeviceTokenStoreContract() {
        val store = InMemoryDeviceTokenStore()
        val token = fx.signer.issue("t1", "d1", fx.session("user-a"), 10, 20)
        assertNull(store.get("t1"))
        store.put(token)
        assertEquals(token, store.get("t1"))
        assertTrue(store.revoke("t1"))
        assertTrue(store.get("t1")!!.revoked)
        assertFalse(store.revoke("missing"))
    }

    // ---- EncryptedPrefsDeviceTokenStore with a fake encrypted backend ----

    @Test
    fun encryptedStoreRoundTripsTokensAcrossSerialization() {
        val backend = FakeEncryptedStore()
        val store: PersistentDeviceTokenStore = EncryptedPrefsDeviceTokenStore(backend)
        val token = fx.signer.issue("t1", "d1", fx.session("user-a", "ADMIN"), 100, 200)
        store.put(token)
        assertEquals(1, store.size())

        val restored = EncryptedPrefsDeviceTokenStore(FakeEncryptedStore.deserialize(backend.serialize()))
        val loaded = restored.get("t1")
        assertNotNull(loaded)
        assertEquals(token, loaded)
        assertTrue(fx.signer.isRecordSignatureValid(loaded!!))
    }

    @Test
    fun encryptedStoreRevocationSurvivesRestart() {
        val backend = FakeEncryptedStore()
        val store = EncryptedPrefsDeviceTokenStore(backend)
        store.put(fx.signer.issue("t1", "d1", fx.session("user-a"), 100, 200))
        assertTrue(store.revoke("t1"))
        assertFalse(store.revoke("unknown"))

        val restored = EncryptedPrefsDeviceTokenStore(FakeEncryptedStore.deserialize(backend.serialize()))
        assertTrue(restored.get("t1")!!.revoked)
    }

    @Test
    fun pairedTokenStillValidatesAfterStoreRestartAndRevocationIsHonored() {
        val backend = FakeEncryptedStore()
        val provider = InMemoryDeviceSigningKeyProvider()
        val first = DevicePairingService(EncryptedPrefsDeviceTokenStore(backend), DeviceTokenSigner(provider), fx.clock)
        val paired = first.pair(DeviceIdentity("d1", "Phone"), fx.session("user-a"), 60_000)

        val restartedStore = EncryptedPrefsDeviceTokenStore(FakeEncryptedStore.deserialize(backend.serialize()))
        val second = DevicePairingService(restartedStore, DeviceTokenSigner(provider), fx.clock)
        val valid = second.validate(paired.presentedToken) as TokenValidation.Valid
        assertEquals("user-a", valid.session.session.userUid)

        second.revoke(paired.token.tokenId)
        val afterRevoke = second.validate(paired.presentedToken) as TokenValidation.Invalid
        assertEquals(TokenFailure.REVOKED, afterRevoke.failure)
    }

    @Test
    fun tamperedStoredRecordIsRejectedBySignature() {
        val backend = FakeEncryptedStore()
        val store = EncryptedPrefsDeviceTokenStore(backend)
        val svc = DevicePairingService(store, fx.signer, fx.clock)
        val paired = svc.pair(DeviceIdentity("d1", "Phone"), fx.session("user-a"), 60_000)

        // Attacker rewrites the stored uid.
        val key = backend.keys().single()
        backend.put(key, backend.get(key)!!.replace("user-a", "user-b"))

        val invalid = svc.validate(paired.presentedToken) as TokenValidation.Invalid
        assertEquals(TokenFailure.SIGNATURE_MISMATCH, invalid.failure)
    }

    @Test
    fun corruptOrUnknownRecordsReadAsAbsent() {
        val backend = FakeEncryptedStore()
        val store = EncryptedPrefsDeviceTokenStore(backend)
        assertNull(store.get("nope"))
        backend.put("device_token_bad", "{not json")
        assertNull(store.get("bad"))
        assertNull(DeviceTokenRecordCodec.decode("{}"))
    }

    @Test
    fun clearRemovesAllTokens() {
        val store = EncryptedPrefsDeviceTokenStore(FakeEncryptedStore())
        store.put(fx.signer.issue("t1", "d1", fx.session("user-a"), 1, 2))
        store.put(fx.signer.issue("t2", "d2", fx.session("user-a"), 1, 2))
        assertEquals(2, store.size())
        store.clear()
        assertEquals(0, store.size())
    }

    @Test
    fun storedFormNeverContainsSigningSecret() {
        val backend = FakeEncryptedStore()
        EncryptedPrefsDeviceTokenStore(backend).put(fx.signer.issue("t1", "d1", fx.session("user-a"), 1, 2))
        assertFalse(backend.serialize().contains(GatewayTestFixture.TEST_SECRET))
        val encoded: DeviceAccessToken = DeviceTokenRecordCodec.decode(DeviceTokenRecordCodec.encode(
            fx.signer.issue("t9", "d9", fx.session("u"), 1, 2)
        ))!!
        assertNotEquals("", encoded.signature)
    }
}
