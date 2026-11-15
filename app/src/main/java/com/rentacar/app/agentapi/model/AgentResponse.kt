package com.rentacar.app.agentapi.model

/**
 * Versioned Agent API response envelope.
 */
data class AgentResponse(
    val success: Boolean,
    val apiVersion: String,
    val operation: String,
    val requestId: String,
    val correlationId: String? = null,
    val data: Any? = null,
    val metadata: AgentResponseMetadata = AgentResponseMetadata(),
    val error: AgentError? = null,
    val pagination: AgentPaginationMetadata? = null
)

data class AgentResponseMetadata(
    val source: AgentDataSource = AgentDataSource.UNKNOWN,
    val syncStatus: AgentSyncStatus = AgentSyncStatus.UNKNOWN,
    val resultCompleteness: AgentResultCompleteness = AgentResultCompleteness.UNKNOWN,
    /**
     * Only set when a real executor observes a verified timestamp.
     * AGENT-001 never invents sync timestamps.
     */
    val lastSuccessfulSyncEpochMs: Long? = null,
    val warnings: List<String> = emptyList(),
    val executionTarget: AgentExecutionTarget? = null,
    val implementationStatus: AgentImplementationStatus? = null,
    val executable: Boolean? = null
)

data class AgentPaginationMetadata(
    val limit: Int? = null,
    val offset: Int? = null,
    val totalHint: Int? = null,
    val hasMore: Boolean? = null
)

data class AgentError(
    val code: AgentErrorCode,
    val message: String,
    val requestId: String? = null,
    val correlationId: String? = null,
    val retryable: Boolean = false,
    val details: Map<String, Any?> = emptyMap()
)

data class AgentExecutionContext(
    val request: AgentRequest,
    val operation: AgentOperationDefinition?,
    val nowEpochMs: Long = System.currentTimeMillis()
)

/**
 * Future prepare → confirm → execute workflow contract (metadata only in AGENT-001).
 */
enum class AgentCommandPhase {
    PREPARE,
    VALIDATE,
    AUTHORIZE,
    CONFIRM,
    EXECUTE,
    AUDIT
}
