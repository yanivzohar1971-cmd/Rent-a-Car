package com.rentacar.app.agentapi.transport

import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentResponseMetadata

/**
 * Wire request for the authenticated gateway.
 *
 * Deliberately has NO userUid / roles / permissions / deviceId field: identity is derived
 * only from the device token's bound session.
 */
data class AgentGatewayRequest(
    val operation: String,
    val parameters: Map<String, Any?> = emptyMap(),
    val requestId: String,
    val correlationId: String? = null,
    val idempotencyKey: String? = null,
    /** Optional absolute deadline; requests received after it are rejected. */
    val expiresAtEpochMs: Long? = null
)

data class AgentGatewayError(
    val code: String,
    val message: String,
    val retryable: Boolean = false,
    val details: Map<String, Any?> = emptyMap()
)

data class AgentGatewayResponse(
    val success: Boolean,
    val operation: String?,
    val requestId: String?,
    val correlationId: String? = null,
    val data: Any? = null,
    val metadata: AgentResponseMetadata? = null,
    val pagination: AgentPaginationMetadata? = null,
    val error: AgentGatewayError? = null,
    /** True when this is a cached answer for a repeated idempotencyKey. */
    val replayed: Boolean = false
)

/** Gateway-level error codes (Agent API codes are passed through as their enum names). */
object GatewayErrorCodes {
    const val INVALID_REQUEST = "INVALID_REQUEST"
    const val UNAUTHORIZED = "UNAUTHORIZED"
    const val TOKEN_EXPIRED = "TOKEN_EXPIRED"
    const val TOKEN_REVOKED = "TOKEN_REVOKED"
    const val REQUEST_EXPIRED = "REQUEST_EXPIRED"
    const val REPLAY_DETECTED = "REPLAY_DETECTED"
    const val FORBIDDEN_FIELD = "FORBIDDEN_FIELD"
    const val DEVICE_UNAVAILABLE = "DEVICE_UNAVAILABLE"
    const val INTERNAL_ERROR = "INTERNAL_ERROR"
}
