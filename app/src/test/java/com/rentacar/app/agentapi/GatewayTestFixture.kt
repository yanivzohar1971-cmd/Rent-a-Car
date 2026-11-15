package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DevicePresenceTracker
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.InMemoryDeviceTokenStore
import com.rentacar.app.agentapi.transport.InMemoryReplayGuard
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims
import com.rentacar.app.data.Supplier

/** Shared JVM fixture: fixture-backed API + pairing + gateway with a controllable clock. */
internal class GatewayTestFixture(
    secret: String = TEST_SECRET,
    replayTtlMs: Long = 60_000
) {
    var now: Long = 1_000_000L
    val clock: () -> Long = { now }

    val port = InMemorySupplierReadPort().also {
        it.seed(
            Supplier(id = 1, name = "Alpha Supplier", userUid = USER_A),
            Supplier(id = 2, name = "Beta Supplier", userUid = USER_B)
        )
    }
    val api: RentCarAgentAPI = RentCarAgentAPI.forAndroidLocalSupplierReads(port)
    val store = InMemoryDeviceTokenStore()
    val signer = DeviceTokenSigner(secret)
    val pairing = DevicePairingService(store, signer, clock)
    val presence = DevicePresenceTracker(clock, staleAfterMs = 30_000)
    val replayGuard = InMemoryReplayGuard(ttlMs = replayTtlMs, clock = clock)
    val gateway = AuthenticatedAgentGateway(pairing, api, replayGuard, presence, clock)

    fun session(uid: String, vararg permissions: String): BoundSessionIdentity =
        BoundSessionIdentity.fromTrustedBinder { VerifiedSessionClaims(uid, permissions.toSet()) }!!

    fun pair(uid: String = USER_A, deviceId: String = "device-1", ttlMs: Long = 3_600_000) =
        pairing.pair(DeviceIdentity(deviceId, "Test Phone"), session(uid), ttlMs)

    companion object {
        const val TEST_SECRET = "unit-test-secret-0123456789abcdef"
        const val USER_A = "user-a"
        const val USER_B = "user-b"
    }
}
