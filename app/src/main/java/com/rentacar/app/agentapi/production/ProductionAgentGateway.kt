package com.rentacar.app.agentapi.production

import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.transport.AgentGatewayError
import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import com.rentacar.app.agentapi.transport.AgentGatewayResponse
import com.rentacar.app.agentapi.transport.AgentGatewayToolsResponse
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.SessionBindingPolicy
import com.rentacar.app.agentapi.transport.TokenValidation
import com.rentacar.app.agentapi.transport.TrustedSessionBinder

/**
 * AGENT-125: owner opt-in for Agent access in the NORMAL app. Disabled by default; nothing in the
 * production APK reads business data for an agent unless [enabled] is true.
 */
interface AgentAccessSettings {
    val enabled: Boolean
}

/** Test / composition helper. Defaults to disabled. */
class InMemoryAgentAccessSettings(override var enabled: Boolean = false) : AgentAccessSettings

/** Production-only error codes added on top of [com.rentacar.app.agentapi.transport.GatewayErrorCodes]. */
object ProductionAgentErrorCodes {
    const val AGENT_ACCESS_DISABLED = "AGENT_ACCESS_DISABLED"
    const val NOT_SIGNED_IN = "NOT_SIGNED_IN"
    const val SESSION_MISMATCH = "SESSION_MISMATCH"
    const val WRITE_NOT_ALLOWED = "WRITE_NOT_ALLOWED"
    const val UNKNOWN_OPERATION = "UNKNOWN_OPERATION"
}

/**
 * AGENT-125/126: production-compatible, read-only wrapper around [AuthenticatedAgentGateway].
 *
 * Every call re-checks, in order:
 *  1. owner opt-in ([AgentAccessSettings.enabled]) — re-read per call, so disabling takes effect
 *     immediately;
 *  2. a LIVE authenticated app session from the [TrustedSessionBinder] (e.g. Firebase) — a device
 *     token alone is not enough once the user signs out;
 *  3. the device token's bound uid equals the live uid — on mismatch (account switch) the token is
 *     revoked and nothing executes;
 *  4. the operation is registered as READ — writes are refused before reaching any executor.
 * Only then does the inner gateway run its own checks (token signature/expiry/revocation, replay,
 * forbidden identity fields, request expiry).
 *
 * Construction is refused in AgentDev builds and while access is disabled, so the normal app keeps
 * its exact previous behaviour unless the owner opts in. It has no socket code and creates no
 * database: it uses the caller's [RentCarAgentAPI] (existing repositories, existing Room DB).
 */
class ProductionAgentGateway private constructor(
    private val settings: AgentAccessSettings,
    private val binder: TrustedSessionBinder,
    private val pairingService: DevicePairingService,
    private val api: RentCarAgentAPI,
    private val inner: AuthenticatedAgentGateway
) {
    fun listTools(presentedToken: String?): AgentGatewayToolsResponse {
        preflight(presentedToken)?.let { return AgentGatewayToolsResponse(success = false, error = it) }
        val response = inner.listTools(presentedToken)
        if (!response.success) return response
        return response.copy(tools = response.tools.filter { isRead(it.operationId) })
    }

    fun execute(presentedToken: String?, request: AgentGatewayRequest): AgentGatewayResponse {
        preflight(presentedToken)?.let { return failure(request, it) }
        val definition = api.registry.get(request.operation)
            ?: return failure(request, AgentGatewayError(ProductionAgentErrorCodes.UNKNOWN_OPERATION, "Unknown operation"))
        if (definition.readOrWrite != AgentReadOrWrite.READ) {
            return failure(
                request,
                AgentGatewayError(ProductionAgentErrorCodes.WRITE_NOT_ALLOWED, "Agent access is read-only")
            )
        }
        return inner.execute(presentedToken, request)
    }

    /** Returns an error when the call must not proceed; null when it may. */
    private fun preflight(presentedToken: String?): AgentGatewayError? {
        if (!settings.enabled) {
            return AgentGatewayError(ProductionAgentErrorCodes.AGENT_ACCESS_DISABLED, "Agent access is disabled on this device")
        }
        val live = BoundSessionIdentity.fromTrustedBinder(binder)
            ?: return AgentGatewayError(ProductionAgentErrorCodes.NOT_SIGNED_IN, "No signed-in Rent a Car user")
        val validation = pairingService.validate(presentedToken)
        if (validation is TokenValidation.Valid && validation.session.session.userUid != live.userUid) {
            pairingService.revoke(validation.session.tokenId)
            return AgentGatewayError(
                ProductionAgentErrorCodes.SESSION_MISMATCH,
                "Device token belongs to a different account; it has been revoked"
            )
        }
        // Invalid tokens fall through: the inner gateway reports UNAUTHORIZED/EXPIRED/REVOKED uniformly.
        return null
    }

    private fun isRead(operationId: String) = api.registry.get(operationId)?.readOrWrite == AgentReadOrWrite.READ

    private fun failure(request: AgentGatewayRequest, error: AgentGatewayError) = AgentGatewayResponse(
        success = false,
        operation = request.operation.ifBlank { null },
        requestId = request.requestId.ifBlank { null },
        correlationId = request.correlationId,
        error = error
    )

    companion object {
        /**
         * Returns null (no gateway at all) unless: not an AgentDev build, owner opted in, and a real
         * signed-in session exists that is not the reserved AgentDev identity.
         */
        fun createOrNull(
            settings: AgentAccessSettings,
            binder: TrustedSessionBinder,
            pairingService: DevicePairingService,
            api: RentCarAgentAPI,
            inner: AuthenticatedAgentGateway,
            agentDevMode: Boolean
        ): ProductionAgentGateway? {
            if (agentDevMode || !settings.enabled) return null
            val live = BoundSessionIdentity.fromTrustedBinder(binder) ?: return null
            if (!SessionBindingPolicy.isAgentDevUidAllowed(agentDevMode, live.userUid)) return null
            return ProductionAgentGateway(settings, binder, pairingService, api, inner)
        }
    }
}
