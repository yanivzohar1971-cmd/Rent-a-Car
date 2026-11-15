package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.gateway.LoopbackGatewayRouter
import com.rentacar.app.agentapi.transport.ExecutionCertainty
import com.rentacar.app.agentapi.transport.RecoveryDecision
import com.rentacar.app.agentapi.transport.RequestRecoveryPolicy
import com.rentacar.app.agentapi.transport.remote.DisabledRemoteProductionEndpoint
import com.rentacar.app.agentapi.transport.remote.LoopbackAdbDevTransport
import com.rentacar.app.agentapi.transport.remote.OutboundRelayTransport
import com.rentacar.app.agentapi.transport.remote.RemoteTransportRequest
import com.rentacar.app.agentapi.transport.remote.RemoteTransportResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-105: remote transport semantics. A transport never fabricates a success. */
class RemoteTransportTest {
    private val fx = GatewayTestFixture()
    private val router = LoopbackGatewayRouter(fx.gateway, fx.pairing)

    private fun req(
        id: String = "r1",
        method: String = "GET",
        path: String = "/v1/health",
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        idempotent: Boolean = true
    ) = RemoteTransportRequest(id, method, path, headers, body, idempotent)

    // ---- LoopbackAdbDevTransport ----

    @Test
    fun loopbackDeliversHealthResponse() {
        val result = LoopbackAdbDevTransport(router).send(req())
        assertTrue(result is RemoteTransportResult.Delivered)
        assertTrue((result as RemoteTransportResult.Delivered).responseJson.contains("\"status\""))
    }

    @Test
    fun loopbackDeliversExecuteWithValidToken() {
        val paired = fx.pair()
        val body = """{"operation":"supplier.list","requestId":"x1"}"""
        val result = LoopbackAdbDevTransport(router).send(
            req(
                id = "x1", method = "POST", path = "/v1/execute",
                headers = mapOf("Authorization" to "Bearer ${paired.presentedToken}"), body = body
            )
        )
        assertTrue(result is RemoteTransportResult.Delivered)
        assertTrue((result as RemoteTransportResult.Delivered).responseJson.contains("Alpha Supplier"))
    }

    @Test
    fun loopbackMapsBadTokenToUnauthorized() {
        val result = LoopbackAdbDevTransport(router).send(
            req(
                method = "POST", path = "/v1/execute",
                headers = mapOf("Authorization" to "Bearer rac1.nope.nope"),
                body = """{"operation":"supplier.list","requestId":"x2"}"""
            )
        )
        assertEquals(RemoteTransportResult.Unauthorized, result)
    }

    @Test
    fun loopbackMapsExpiredRequestToTimeout() {
        val paired = fx.pair()
        val result = LoopbackAdbDevTransport(router).send(
            req(
                method = "POST", path = "/v1/execute",
                headers = mapOf("Authorization" to "Bearer ${paired.presentedToken}"),
                body = """{"operation":"supplier.list","requestId":"x3","expiresAtEpochMs":${fx.now - 1}}"""
            )
        )
        assertEquals(RemoteTransportResult.Timeout, result)
    }

    @Test
    fun loopbackReportsDeviceUnavailableWhenDisconnectedWithoutCallingRouter() {
        val transport = LoopbackAdbDevTransport(router) { false }
        assertFalse(transport.isConnected)
        assertEquals(RemoteTransportResult.DeviceUnavailable, transport.send(req()))
    }

    @Test
    fun loopbackUnknownPathIsDeliveredAsTheDevicesFailureBody() {
        // A 404 is the device's own answer: it is delivered verbatim and carries success=false.
        val result = LoopbackAdbDevTransport(router).send(req(path = "/nope"))
        assertTrue(result is RemoteTransportResult.Delivered)
        assertTrue((result as RemoteTransportResult.Delivered).responseJson.contains("\"success\":false"))
    }

    // ---- OutboundRelayTransport ----

    @Test
    fun relayQueuesWhileOfflineAndReturnsDeviceUnavailable() {
        val relay = OutboundRelayTransport()
        assertFalse(relay.isConnected)
        assertEquals(RemoteTransportResult.DeviceUnavailable, relay.send(req("a")))
        assertEquals(RemoteTransportResult.DeviceUnavailable, relay.send(req("b")))
        assertEquals(listOf("a", "b"), relay.pendingRequestIds())
        relay.clearPending()
        assertEquals(0, relay.pendingCount())
    }

    @Test
    fun relayQueueIsBoundedAndOverflowIsAnErrorNotSuccess() {
        val relay = OutboundRelayTransport(maxQueueSize = 1)
        assertEquals(RemoteTransportResult.DeviceUnavailable, relay.send(req("a")))
        val overflow = relay.send(req("b"))
        assertTrue(overflow is RemoteTransportResult.TransportError)
        assertEquals(1, relay.pendingCount())
    }

    @Test
    fun relayNeverFabricatesDeliveryEvenIfDeviceClaimsOnline() {
        val relay = OutboundRelayTransport(deviceOnline = { true })
        val result = relay.send(req("a"))
        assertTrue(result is RemoteTransportResult.TransportError)
        assertEquals(0, relay.pendingCount())
    }

    // ---- DisabledRemoteProductionEndpoint ----

    @Test
    fun disabledProductionEndpointAlwaysErrors() {
        assertFalse(DisabledRemoteProductionEndpoint.isConnected)
        val result = DisabledRemoteProductionEndpoint.send(req())
        assertEquals(RemoteTransportResult.TransportError("production remote endpoint disabled"), result)
    }

    // ---- Request hygiene + recovery semantics ----

    @Test
    fun requestToStringDoesNotLeakAuthorizationHeader() {
        val text = req(headers = mapOf("Authorization" to "Bearer secret-token")).toString()
        assertFalse(text.contains("secret-token"))
    }

    @Test
    fun onlyDeliveredIsConfirmedEveryOtherResultIsUnknown() {
        assertEquals(ExecutionCertainty.CONFIRMED, RequestRecoveryPolicy.certaintyOf(RemoteTransportResult.Delivered("{}")))
        listOf(
            RemoteTransportResult.DeviceUnavailable,
            RemoteTransportResult.Timeout,
            RemoteTransportResult.Unauthorized,
            RemoteTransportResult.TransportError("x")
        ).forEach { assertEquals(it.toString(), ExecutionCertainty.UNKNOWN, RequestRecoveryPolicy.certaintyOf(it)) }
    }

    @Test
    fun timeoutOfNonIdempotentRequestIsNeverAutoReplayed() {
        val certainty = RequestRecoveryPolicy.certaintyOf(RemoteTransportResult.Timeout)
        assertEquals(
            RecoveryDecision.REQUIRES_MANUAL_RECONCILIATION,
            RequestRecoveryPolicy.decide(idempotent = false, expiresAtEpochMs = null, nowEpochMs = 1, certainty = certainty)
        )
        assertEquals(
            RecoveryDecision.REPLAY_ALLOWED,
            RequestRecoveryPolicy.decide(idempotent = true, expiresAtEpochMs = null, nowEpochMs = 1, certainty = certainty)
        )
    }
}
