package com.rentacar.app.agentapi.transport

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.mcp.AgentMcpToolDescriptor
import com.rentacar.app.agentapi.mcp.AgentMcpToolRegistry
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import java.security.MessageDigest

data class AgentGatewayToolsResponse(
    val success: Boolean,
    val tools: List<AgentMcpToolDescriptor> = emptyList(),
    val error: AgentGatewayError? = null
)

/**
 * Pure-Kotlin authenticated gateway in front of [RentCarAgentAPI].
 *
 * Trust model:
 *  - callers present only an opaque device token;
 *  - the [AgentAuthContext] is built exclusively from the token's [BoundSessionIdentity];
 *  - request bodies cannot carry or override userUid / permissions / deviceId.
 *
 * The gateway has no socket code; HTTP binding is a separate, development-only concern.
 */
class AuthenticatedAgentGateway(
    private val pairingService: DevicePairingService,
    private val api: RentCarAgentAPI,
    private val replayGuard: ReplayGuard = InMemoryReplayGuard(),
    private val presenceTracker: DevicePresenceTracker? = null,
    private val clock: () -> Long = System::currentTimeMillis,
    /**
     * AGENT-106: when true (and [presenceTracker] is set), [execute] answers DEVICE_UNAVAILABLE unless
     * the device was already reachable BEFORE this request. Presence is then kept alive by
     * [listTools] / explicit heartbeats; a rejected request does not itself mark the device online.
     */
    private val requireReachable: Boolean = false
) {
    private val toolRegistry = AgentMcpToolRegistry(api)

    fun listTools(presentedToken: String?): AgentGatewayToolsResponse =
        when (val validation = pairingService.validate(presentedToken)) {
            is TokenValidation.Invalid -> AgentGatewayToolsResponse(
                success = false,
                error = tokenError(validation)
            )
            is TokenValidation.Valid -> {
                presenceTracker?.heartbeat(validation.session.deviceId)
                AgentGatewayToolsResponse(success = true, tools = toolRegistry.listTools())
            }
        }

    fun execute(presentedToken: String?, request: AgentGatewayRequest): AgentGatewayResponse {
        val validation = pairingService.validate(presentedToken)
        if (validation is TokenValidation.Invalid) {
            return failure(request, tokenError(validation))
        }
        val device = (validation as TokenValidation.Valid).session
        if (presenceTracker != null && requireReachable && !presenceTracker.isReachable(device.deviceId)) {
            return failure(
                request,
                error(
                    GatewayErrorCodes.DEVICE_UNAVAILABLE,
                    "Device is not reachable",
                    retryable = true,
                    details = mapOf("deviceState" to presenceTracker.presence(device.deviceId).state.name)
                )
            )
        }
        presenceTracker?.heartbeat(device.deviceId)

        if (request.requestId.isBlank()) {
            return failure(request, error(GatewayErrorCodes.INVALID_REQUEST, "requestId is required"))
        }
        if (request.operation.isBlank()) {
            return failure(request, error(GatewayErrorCodes.INVALID_REQUEST, "operation is required"))
        }
        findForbiddenKey(request.parameters)?.let { key ->
            return failure(
                request,
                error(
                    GatewayErrorCodes.FORBIDDEN_FIELD,
                    "Parameter '$key' is not accepted: identity is derived from the paired device session",
                    details = mapOf("field" to key)
                )
            )
        }
        val now = clock()
        request.expiresAtEpochMs?.let { deadline ->
            if (now > deadline) {
                return failure(
                    request,
                    error(
                        GatewayErrorCodes.REQUEST_EXPIRED,
                        "Gateway request expired",
                        details = mapOf("expiresAtEpochMs" to deadline)
                    )
                )
            }
        }

        val scope = "${device.deviceId}|${device.session.userUid}"
        val fingerprint = fingerprint(request)
        when (val decision = replayGuard.begin(scope, request.requestId, request.idempotencyKey, fingerprint)) {
            is ReplayDecision.CachedReplay -> return decision.response
            is ReplayDecision.Rejected -> return failure(
                request,
                error(GatewayErrorCodes.REPLAY_DETECTED, decision.reason)
            )
            ReplayDecision.Fresh -> Unit
        }

        // Identity comes ONLY from the token's bound session.
        val auth = AgentAuthContext(
            userUid = device.session.userUid,
            permissions = device.session.permissions.toList(),
            deviceId = device.deviceId
        )
        val agentRequest = AgentRequest(
            apiVersion = AgentApiVersions.API_VERSION,
            operation = request.operation,
            requestId = request.requestId,
            target = AgentExecutionTarget.ANDROID_LOCAL,
            parameters = request.parameters,
            auth = auth,
            correlationId = request.correlationId,
            idempotencyKey = request.idempotencyKey
        )
        val response = try {
            map(api.execute(agentRequest))
        } catch (_: Throwable) {
            failure(
                request,
                error(GatewayErrorCodes.INTERNAL_ERROR, "Agent API execution failed", retryable = true)
            )
        }
        replayGuard.complete(scope, request.requestId, request.idempotencyKey, response)
        return response
    }

    private fun map(response: AgentResponse) = AgentGatewayResponse(
        success = response.success,
        operation = response.operation,
        requestId = response.requestId,
        correlationId = response.correlationId,
        data = response.data,
        metadata = response.metadata,
        pagination = response.pagination,
        error = response.error?.let {
            AgentGatewayError(it.code.name, it.message, it.retryable, it.details)
        } ?: if (response.success) null else error(
            GatewayErrorCodes.INTERNAL_ERROR,
            "Agent API returned an unsuccessful response without an error"
        )
    )

    private fun tokenError(invalid: TokenValidation.Invalid): AgentGatewayError {
        val code = when (invalid.failure) {
            TokenFailure.EXPIRED -> GatewayErrorCodes.TOKEN_EXPIRED
            TokenFailure.REVOKED -> GatewayErrorCodes.TOKEN_REVOKED
            else -> GatewayErrorCodes.UNAUTHORIZED
        }
        // Never reveal whether a token id exists vs. has a bad signature.
        val message = when (invalid.failure) {
            TokenFailure.EXPIRED, TokenFailure.REVOKED -> invalid.message
            else -> "Invalid device token"
        }
        return error(code, message)
    }

    private fun failure(request: AgentGatewayRequest, error: AgentGatewayError) = AgentGatewayResponse(
        success = false,
        operation = request.operation.ifBlank { null },
        requestId = request.requestId.ifBlank { null },
        correlationId = request.correlationId,
        error = error
    )

    private fun error(
        code: String,
        message: String,
        retryable: Boolean = false,
        details: Map<String, Any?> = emptyMap()
    ) = AgentGatewayError(code, message, retryable, details)

    private fun findForbiddenKey(parameters: Map<*, *>): String? {
        for ((rawKey, value) in parameters) {
            val key = rawKey.toString()
            if (key.lowercase() in FORBIDDEN_IDENTITY_KEYS) return key
            findForbiddenKeyInValue(value)?.let { return it }
        }
        return null
    }

    /** Identity keys are rejected at any depth, including maps nested inside lists/arrays. */
    private fun findForbiddenKeyInValue(value: Any?): String? = when (value) {
        is Map<*, *> -> findForbiddenKey(value)
        is Iterable<*> -> value.firstNotNullOfOrNull { findForbiddenKeyInValue(it) }
        is Array<*> -> value.firstNotNullOfOrNull { findForbiddenKeyInValue(it) }
        else -> null
    }

    private fun fingerprint(request: AgentGatewayRequest): String {
        val canonical = request.operation + "|" + canonicalize(request.parameters)
        val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun canonicalize(value: Any?): String = when (value) {
        is Map<*, *> -> value.entries
            .sortedBy { it.key.toString() }
            .joinToString(",", "{", "}") { "${it.key}:${canonicalize(it.value)}" }
        is Iterable<*> -> value.joinToString(",", "[", "]") { canonicalize(it) }
        is Number -> if (value.toDouble() % 1.0 == 0.0) value.toLong().toString() else value.toString()
        else -> value.toString()
    }

    companion object {
        val FORBIDDEN_IDENTITY_KEYS: Set<String> = setOf(
            "useruid", "uid", "userid", "roles", "permissions", "deviceid", "tenantid", "auth"
        )
    }
}
