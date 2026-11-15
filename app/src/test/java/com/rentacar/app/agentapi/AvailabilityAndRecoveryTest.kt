package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.ConnectivityState
import com.rentacar.app.agentapi.transport.ExecutionCertainty
import com.rentacar.app.agentapi.transport.GatewayErrorCodes
import com.rentacar.app.agentapi.transport.RecoveryDecision
import com.rentacar.app.agentapi.transport.RequestRecoveryPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-106: presence-gated execution and recovery rules. */
class AvailabilityAndRecoveryTest {
    private val fx = GatewayTestFixture()
    private val strict = AuthenticatedAgentGateway(
        fx.pairing, fx.api, fx.replayGuard, fx.presence, fx.clock, requireReachable = true
    )

    private fun request(id: String, expiresAt: Long? = null) =
        AgentGatewayRequest(operation = "supplier.list", requestId = id, expiresAtEpochMs = expiresAt)

    // ---- DEVICE_UNAVAILABLE ----

    @Test
    fun neverSeenDeviceIsUnavailableWhenReachabilityRequired() {
        val paired = fx.pair(deviceId = "ghost")
        val response = strict.execute(paired.presentedToken, request("r1"))
        assertFalse(response.success)
        assertEquals(GatewayErrorCodes.DEVICE_UNAVAILABLE, response.error?.code)
        assertTrue(response.error!!.retryable)
        assertEquals(ConnectivityState.UNAVAILABLE.name, response.error!!.details["deviceState"])
        // A rejected request must not mark the device online.
        assertEquals(ConnectivityState.UNAVAILABLE, fx.presence.presence("ghost").state)
    }

    @Test
    fun onlineDeviceExecutesWhenReachabilityRequired() {
        val paired = fx.pair(deviceId = "live")
        fx.presence.heartbeat("live")
        val response = strict.execute(paired.presentedToken, request("r1"))
        assertTrue(response.error?.message, response.success)
    }

    @Test
    fun staleOrOfflineDeviceIsUnavailable() {
        val paired = fx.pair(deviceId = "stale")
        fx.presence.heartbeat("stale")
        fx.now += 31_000 // fixture staleAfterMs = 30_000
        val stale = strict.execute(paired.presentedToken, request("r1"))
        assertEquals(GatewayErrorCodes.DEVICE_UNAVAILABLE, stale.error?.code)

        fx.presence.heartbeat("stale")
        fx.presence.markOffline("stale")
        val offline = strict.execute(paired.presentedToken, request("r2"))
        assertEquals(GatewayErrorCodes.DEVICE_UNAVAILABLE, offline.error?.code)
    }

    @Test
    fun listToolsKeepsPresenceAliveSoExecuteCanProceed() {
        val paired = fx.pair(deviceId = "tools")
        assertEquals(GatewayErrorCodes.DEVICE_UNAVAILABLE, strict.execute(paired.presentedToken, request("r1")).error?.code)
        assertTrue(strict.listTools(paired.presentedToken).success)
        assertTrue(strict.execute(paired.presentedToken, request("r2")).success)
    }

    @Test
    fun reachabilityIsNotRequiredByDefaultAndNeedsATracker() {
        val paired = fx.pair(deviceId = "default")
        assertTrue(fx.gateway.execute(paired.presentedToken, request("r1")).success)

        val noTracker = AuthenticatedAgentGateway(
            fx.pairing, fx.api, fx.replayGuard, presenceTracker = null, clock = fx.clock, requireReachable = true
        )
        assertTrue(noTracker.execute(paired.presentedToken, request("r2")).success)
    }

    @Test
    fun invalidTokenIsStillUnauthorizedBeforeAvailabilityCheck() {
        val response = strict.execute("rac1.bad.bad", request("r1"))
        assertEquals(GatewayErrorCodes.UNAUTHORIZED, response.error?.code)
    }

    // ---- expired request stays rejected ----

    @Test
    fun expiredRequestStaysRejectedOnRetryWithSameId() {
        val paired = fx.pair(deviceId = "exp")
        fx.presence.heartbeat("exp")
        val first = strict.execute(paired.presentedToken, request("same", expiresAt = fx.now - 1))
        assertEquals(GatewayErrorCodes.REQUEST_EXPIRED, first.error?.code)
        val retry = strict.execute(paired.presentedToken, request("same", expiresAt = fx.now - 1))
        assertEquals(GatewayErrorCodes.REQUEST_EXPIRED, retry.error?.code)
    }

    // ---- RequestRecoveryPolicy ----

    @Test
    fun recoveryDecisionTable() {
        val now = 1_000L
        fun d(idem: Boolean, exp: Long?, c: ExecutionCertainty) = RequestRecoveryPolicy.decide(idem, exp, now, c)

        // expired always wins, even for idempotent reads
        assertEquals(RecoveryDecision.REJECT_EXPIRED, d(true, now - 1, ExecutionCertainty.UNKNOWN))
        assertEquals(RecoveryDecision.REJECT_EXPIRED, d(false, now - 1, ExecutionCertainty.CONFIRMED))
        // exactly at the deadline is still live (gateway rejects only when now > deadline)
        assertEquals(RecoveryDecision.REPLAY_ALLOWED, d(true, now, ExecutionCertainty.UNKNOWN))
        // confirmed never replays
        assertEquals(RecoveryDecision.ALREADY_CONFIRMED, d(true, null, ExecutionCertainty.CONFIRMED))
        assertEquals(RecoveryDecision.ALREADY_CONFIRMED, d(false, null, ExecutionCertainty.CONFIRMED))
        // non-idempotent + unknown outcome is never auto-replayed
        assertEquals(RecoveryDecision.REQUIRES_MANUAL_RECONCILIATION, d(false, null, ExecutionCertainty.UNKNOWN))
        // idempotent + unknown + live may replay
        assertEquals(RecoveryDecision.REPLAY_ALLOWED, d(true, now + 10, ExecutionCertainty.UNKNOWN))
    }

    @Test
    fun mayAutoReplayOnlyForLiveIdempotentUnknownRequests() {
        assertTrue(RequestRecoveryPolicy.mayAutoReplay(true, null, 1, ExecutionCertainty.UNKNOWN))
        assertFalse(RequestRecoveryPolicy.mayAutoReplay(false, null, 1, ExecutionCertainty.UNKNOWN))
        assertFalse(RequestRecoveryPolicy.mayAutoReplay(true, 0, 1, ExecutionCertainty.UNKNOWN))
        assertFalse(RequestRecoveryPolicy.mayAutoReplay(true, null, 1, ExecutionCertainty.CONFIRMED))
    }
}
