package com.rentacar.app.agentdev

import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.gateway.LoopbackGatewayRouter
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DevicePresenceTracker
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.InMemoryDeviceTokenStore
import com.rentacar.app.agentapi.transport.InMemoryReplayGuard
import com.rentacar.app.agentapi.transport.PairingResult
import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims

/**
 * AGENT-101 (AgentDev only). Pure wiring of gateway + pairing + router for the fixed dev identity.
 *
 * Identity is bound exclusively through a [TrustedSessionBinder] that always returns
 * [devUid]; no request body can change it. No Android or Firebase types are used here so the
 * wiring can be exercised from JVM unit tests with a fixture-backed [RentCarAgentAPI].
 */
class AgentDevGatewayRuntime(
    api: RentCarAgentAPI,
    val devUid: String,
    pairingSecret: String,
    clock: () -> Long = System::currentTimeMillis
) {
    val trustedSessionBinder: TrustedSessionBinder = TrustedSessionBinder { VerifiedSessionClaims(devUid) }
    val tokenStore = InMemoryDeviceTokenStore()
    val pairingService = DevicePairingService(tokenStore, DeviceTokenSigner(pairingSecret), clock)
    val gateway = AuthenticatedAgentGateway(
        pairingService,
        api,
        InMemoryReplayGuard(clock = clock),
        DevicePresenceTracker(clock),
        clock
    )
    val router = LoopbackGatewayRouter(gateway, pairingService, trustedSessionBinder, pairingSecret)

    /** Issues a device token bound to the dev session (never to a request-supplied uid). */
    fun autoPair(deviceId: String = DEFAULT_DEVICE_ID, ttlMs: Long = DEFAULT_TOKEN_TTL_MS): PairingResult {
        val session = checkNotNull(BoundSessionIdentity.fromTrustedBinder(trustedSessionBinder)) {
            "AgentDev trusted session binder returned no session"
        }
        return pairingService.pair(DeviceIdentity(deviceId, DEFAULT_DISPLAY_NAME), session, ttlMs)
    }

    companion object {
        const val DEFAULT_DEVICE_ID = "agentdev-emulator"
        const val DEFAULT_DISPLAY_NAME = "AgentDev Emulator"
        const val DEFAULT_TOKEN_TTL_MS: Long = 7L * 24 * 60 * 60 * 1000
    }
}
