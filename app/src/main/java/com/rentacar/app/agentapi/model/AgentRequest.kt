package com.rentacar.app.agentapi.model

/**
 * Versioned Agent API request envelope.
 *
 * Forbidden: arbitrary SQL strings, arbitrary method names, unrestricted query DSLs.
 */
data class AgentRequest(
    val apiVersion: String,
    val operation: String,
    val requestId: String,
    val target: AgentExecutionTarget = AgentExecutionTarget.AUTO,
    val parameters: Map<String, Any?> = emptyMap(),
    val auth: AgentAuthContext? = null,
    val correlationId: String? = null,
    val idempotencyKey: String? = null,
    val confirmationToken: String? = null
)

data class AgentAuthContext(
    val userUid: String? = null,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val deviceId: String? = null,
    val tenantId: String? = null
)
