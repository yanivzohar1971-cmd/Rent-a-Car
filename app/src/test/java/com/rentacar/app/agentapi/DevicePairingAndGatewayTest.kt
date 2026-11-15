package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.ConnectivityState
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.GatewayErrorCodes
import com.rentacar.app.agentapi.transport.InMemoryDeviceTokenStore
import com.rentacar.app.agentapi.transport.TokenFailure
import com.rentacar.app.agentapi.transport.TokenValidation
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DevicePairingAndGatewayTest {
    private val fx = GatewayTestFixture()

    private fun listRequest(
        id: String = "req-1",
        params: Map<String, Any?> = emptyMap(),
        idempotencyKey: String? = null,
        expiresAt: Long? = null,
        operation: String = "supplier.list"
    ) = AgentGatewayRequest(
        operation = operation,
        parameters = params,
        requestId = id,
        idempotencyKey = idempotencyKey,
        expiresAtEpochMs = expiresAt
    )

    @Suppress("UNCHECKED_CAST")
    private fun names(data: Any?): List<String> =
        ((data as Map<String, Any?>)["items"] as List<Any?>).map {
            val dto = it
            dto!!::class.java.getMethod("getName").invoke(dto) as String
        }

    // ---- pair -> execute ----

    @Test
    fun pairThenSupplierListSucceedsForBoundUserOnly() {
        val paired = fx.pair(USER_A)
        val response = fx.gateway.execute(paired.presentedToken, listRequest())
        assertTrue(response.error?.message, response.success)
        assertEquals("supplier.list", response.operation)
        assertEquals(listOf("Alpha Supplier"), names(response.data))
        assertFalse(response.replayed)
    }

    @Test
    fun secondUserTokenSeesOnlyOwnData() {
        val paired = fx.pair(USER_B, deviceId = "device-b")
        val response = fx.gateway.execute(paired.presentedToken, listRequest())
        assertEquals(listOf("Beta Supplier"), names(response.data))
    }

    @Test
    fun presentedTokenContainsNoUserData() {
        val paired = fx.pair(USER_A)
        assertFalse(paired.presentedToken.contains(USER_A))
        assertTrue(paired.presentedToken.startsWith("rac1."))
    }

    // ---- invalid tokens ----

    @Test
    fun missingMalformedAndUnknownTokensFail() {
        listOf(null, "", "garbage", "rac1.only-two", "rac1.unknown.sig").forEach { token ->
            val response = fx.gateway.execute(token, listRequest(id = "r-$token"))
            assertFalse("token=$token", response.success)
            assertEquals(GatewayErrorCodes.UNAUTHORIZED, response.error?.code)
            assertNull(response.data)
        }
    }

    @Test
    fun tamperedSignatureFails() {
        val paired = fx.pair()
        val tampered = paired.presentedToken.dropLast(2) + "xx"
        val response = fx.gateway.execute(tampered, listRequest())
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.UNAUTHORIZED, response.error?.code)
    }

    @Test
    fun tokenSignedWithDifferentSecretFails() {
        val other = GatewayTestFixture(secret = "another-secret-0123456789abcdef")
        val foreign = other.pair(USER_A)
        // Same store contents but verified with this fixture's secret.
        fx.store.put(foreign.token)
        val response = fx.gateway.execute(foreign.presentedToken, listRequest())
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.UNAUTHORIZED, response.error?.code)
    }

    @Test
    fun tamperingWithStoredSessionInvalidatesToken() {
        val paired = fx.pair(USER_A)
        val forgedSession = fx.session(USER_B)
        fx.store.put(paired.token.copy(session = forgedSession)) // signature no longer matches
        val validation = fx.pairing.validate(paired.presentedToken)
        assertTrue(validation is TokenValidation.Invalid)
        assertEquals(TokenFailure.SIGNATURE_MISMATCH, (validation as TokenValidation.Invalid).failure)
        val response = fx.gateway.execute(paired.presentedToken, listRequest())
        assertFalse(response.success)
    }

    @Test
    fun revokedTokenFails() {
        val paired = fx.pair()
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("ok-1")).success)
        assertTrue(fx.pairing.revoke(paired.token.tokenId))
        val response = fx.gateway.execute(paired.presentedToken, listRequest("ok-2"))
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.TOKEN_REVOKED, response.error?.code)
        assertFalse(fx.pairing.revoke("does-not-exist"))
    }

    @Test
    fun expiredTokenFails() {
        val paired = fx.pair(ttlMs = 1_000)
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("a")).success)
        fx.now += 1_000
        val response = fx.gateway.execute(paired.presentedToken, listRequest("b"))
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.TOKEN_EXPIRED, response.error?.code)
    }

    @Test
    fun pairingRejectsInvalidTtl() {
        val device = DeviceIdentity("d", "d")
        val session = fx.session(USER_A)
        listOf(0L, -5L, DevicePairingService.MAX_TTL_MS + 1).forEach {
            try {
                fx.pairing.pair(device, session, it)
                fail("ttl $it should be rejected")
            } catch (_: IllegalArgumentException) {
            }
        }
    }

    @Test
    fun signerRejectsShortSecret() {
        try {
            DeviceTokenSigner("short")
            fail("short secret must be rejected")
        } catch (_: IllegalArgumentException) {
        }
    }

    // ---- identity binding ----

    @Test
    fun boundSessionOnlyComesFromTrustedBinder() {
        assertNull(BoundSessionIdentity.fromTrustedBinder { null })
        assertNull(BoundSessionIdentity.fromTrustedBinder { VerifiedSessionClaims("   ") })
        val session = BoundSessionIdentity.fromTrustedBinder { VerifiedSessionClaims("u1", setOf("x")) }!!
        assertEquals("u1", session.userUid)
        assertTrue("AUTHENTICATED" in session.permissions)
        assertTrue("X" in session.permissions)
        // No public constructor exists.
        assertTrue(BoundSessionIdentity::class.java.constructors.none { !it.isSynthetic })
    }

    @Test
    fun clientCannotSupplyDifferentUserUidInParameters() {
        val paired = fx.pair(USER_A)
        listOf("userUid", "UserUid", "uid", "permissions", "deviceId", "auth").forEach { key ->
            val response = fx.gateway.execute(
                paired.presentedToken,
                listRequest(id = "forbidden-$key", params = mapOf(key to USER_B))
            )
            assertFalse(key, response.success)
            assertEquals(key, GatewayErrorCodes.FORBIDDEN_FIELD, response.error?.code)
            assertNull(response.data)
        }
    }

    @Test
    fun nestedIdentityKeysAreAlsoRejected() {
        val paired = fx.pair(USER_A)
        val response = fx.gateway.execute(
            paired.presentedToken,
            listRequest(params = mapOf("filter" to mapOf("userUid" to USER_B)))
        )
        assertEquals(GatewayErrorCodes.FORBIDDEN_FIELD, response.error?.code)
    }

    @Test
    fun gatewayRequestTypeHasNoIdentityFields() {
        val fields = AgentGatewayRequest::class.java.declaredFields.map { it.name.lowercase() }
        assertTrue(fields.none { it.contains("uid") || it.contains("permission") || it.contains("role") })
    }

    @Test
    fun gatewayBuildsAuthOnlyFromBoundSession() {
        // supplier.get on a record owned by another user never leaks through user A's token.
        val paired = fx.pair(USER_A)
        val response = fx.gateway.execute(
            paired.presentedToken,
            listRequest(operation = "supplier.get", params = mapOf("id" to 2))
        )
        assertFalse(response.success)
        assertEquals("NOT_FOUND", response.error?.code)
    }

    // ---- request TTL ----

    @Test
    fun expiredGatewayRequestIsRejected() {
        val paired = fx.pair()
        val stale = fx.gateway.execute(paired.presentedToken, listRequest("late", expiresAt = fx.now - 1))
        assertFalse(stale.success)
        assertEquals(GatewayErrorCodes.REQUEST_EXPIRED, stale.error?.code)

        val live = fx.gateway.execute(paired.presentedToken, listRequest("on-time", expiresAt = fx.now + 5_000))
        assertTrue(live.success)
    }

    @Test
    fun expiredRequestDoesNotConsumeItsRequestId() {
        val paired = fx.pair()
        assertFalse(fx.gateway.execute(paired.presentedToken, listRequest("same", expiresAt = fx.now - 1)).success)
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("same")).success)
    }

    // ---- replay / idempotency ----

    @Test
    fun reusedRequestIdIsRejectedAsReplay() {
        val paired = fx.pair()
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("dup")).success)
        val replay = fx.gateway.execute(paired.presentedToken, listRequest("dup"))
        assertFalse(replay.success)
        assertEquals(GatewayErrorCodes.REPLAY_DETECTED, replay.error?.code)
    }

    @Test
    fun sameIdempotencyKeyAndRequestReturnsCachedResponse() {
        val paired = fx.pair()
        val first = fx.gateway.execute(paired.presentedToken, listRequest("r1", idempotencyKey = "idem-1"))
        // Data changes underneath; the cached answer must still be returned.
        fx.port.seed(com.rentacar.app.data.Supplier(id = 3, name = "Gamma", userUid = GatewayTestFixture.USER_A))
        val second = fx.gateway.execute(paired.presentedToken, listRequest("r2", idempotencyKey = "idem-1"))
        assertTrue(second.success)
        assertTrue(second.replayed)
        assertEquals(names(first.data), names(second.data))
        assertEquals("r1", second.requestId)
    }

    @Test
    fun idempotencyKeyReusedWithDifferentRequestIsRejected() {
        val paired = fx.pair()
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("a", idempotencyKey = "k")).success)
        val response = fx.gateway.execute(
            paired.presentedToken,
            listRequest("b", params = mapOf("query" to "Alpha"), idempotencyKey = "k")
        )
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.REPLAY_DETECTED, response.error?.code)
    }

    @Test
    fun replayWindowExpires() {
        val paired = fx.pair()
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("w")).success)
        fx.now += 60_001
        assertTrue(fx.gateway.execute(paired.presentedToken, listRequest("w")).success)
    }

    @Test
    fun replayScopeIsPerDeviceAndUser() {
        val a = fx.pair(USER_A, "dev-a")
        val b = fx.pair(USER_B, "dev-b")
        assertTrue(fx.gateway.execute(a.presentedToken, listRequest("shared-id")).success)
        assertTrue(fx.gateway.execute(b.presentedToken, listRequest("shared-id")).success)
    }

    // ---- misc gateway behavior ----

    @Test
    fun writeOperationsRemainDisabledThroughGateway() {
        val paired = fx.pair()
        val write = fx.api.registry.writes().first()
        val response = fx.gateway.execute(paired.presentedToken, listRequest("w1", operation = write.operationId))
        assertFalse(response.success)
        assertEquals("WRITE_DISABLED", response.error?.code)
    }

    @Test
    fun blankRequestIdAndOperationAreInvalid() {
        val paired = fx.pair()
        assertEquals(
            GatewayErrorCodes.INVALID_REQUEST,
            fx.gateway.execute(paired.presentedToken, listRequest(id = " ")).error?.code
        )
        assertEquals(
            GatewayErrorCodes.INVALID_REQUEST,
            fx.gateway.execute(paired.presentedToken, listRequest(operation = "")).error?.code
        )
    }

    @Test
    fun toolsListRequiresValidTokenAndIsReadOnly() {
        assertFalse(fx.gateway.listTools(null).success)
        val paired = fx.pair()
        val tools = fx.gateway.listTools(paired.presentedToken)
        assertTrue(tools.success)
        assertEquals(setOf("supplier.list", "supplier.get"), tools.tools.map { it.name }.toSet())
        val writes = fx.api.registry.writes().map { it.operationId }.toSet()
        assertTrue(tools.tools.none { it.name in writes })
    }

    @Test
    fun authenticatedRequestsRecordPresence() {
        val paired = fx.pair(deviceId = "presence-dev")
        assertEquals(ConnectivityState.UNAVAILABLE, fx.presence.presence("presence-dev").state)
        fx.gateway.execute(paired.presentedToken, listRequest("p1"))
        assertEquals(ConnectivityState.ONLINE, fx.presence.presence("presence-dev").state)
        fx.now += 30_001
        assertEquals(ConnectivityState.OFFLINE, fx.presence.presence("presence-dev").state)
    }

    @Test
    fun presenceTrackerStates() {
        val tracker = com.rentacar.app.agentapi.transport.DevicePresenceTracker(fx.clock, 10_000)
        assertEquals(ConnectivityState.UNAVAILABLE, tracker.presence("x").state)
        tracker.heartbeat("x", ConnectivityState.BACKGROUND)
        assertEquals(ConnectivityState.BACKGROUND, tracker.presence("x").state)
        assertFalse(tracker.isReachable("x"))
        tracker.heartbeat("x")
        assertTrue(tracker.isReachable("x"))
        tracker.markOffline("x")
        assertEquals(ConnectivityState.OFFLINE, tracker.presence("x").state)
        assertNotNull(tracker.presence("x").lastSeenEpochMs)
    }

    @Test
    fun tokenIdsAreUniqueAndStoreSupportsMultipleDevices() {
        val store = InMemoryDeviceTokenStore()
        val svc = DevicePairingService(store, DeviceTokenSigner(GatewayTestFixture.TEST_SECRET), fx.clock)
        val one = svc.pair(DeviceIdentity("d1", "One"), fx.session(USER_A), 1_000)
        val two = svc.pair(DeviceIdentity("d2", "Two"), fx.session(USER_A), 1_000)
        assertNotEquals(one.token.tokenId, two.token.tokenId)
        assertEquals(2, store.size())
    }

    @Test
    fun gatewayWrapperDoesNotMutateFixtureStore() {
        val before = fx.port.snapshot()
        val paired = fx.pair()
        fx.gateway.execute(paired.presentedToken, listRequest())
        assertEquals(before, fx.port.snapshot())
        assertEquals(0, fx.port.mutationCount)
    }

    companion object {
        private const val USER_A = GatewayTestFixture.USER_A
        private const val USER_B = GatewayTestFixture.USER_B
    }

    @Suppress("unused")
    private fun unusedImportKeepers(g: AuthenticatedAgentGateway) = g
}
