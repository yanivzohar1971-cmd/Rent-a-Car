package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.validation.AgentRequestValidator

interface AgentOperationExecutor {
    fun execute(request: AgentRequest): AgentResponse
}

/**
 * AGENT-001 executor: validates and discovers only — never runs business operations,
 * never touches Room/Firestore, never enables writes.
 */
class DisabledAgentOperationExecutor(
    private val registry: AgentCapabilityRegistry,
    private val validator: AgentRequestValidator = AgentRequestValidator(registry)
) : AgentOperationExecutor {

    override fun execute(request: AgentRequest): AgentResponse {
        val validationError = validator.validate(request)
        if (validationError != null) {
            return failure(request, validationError)
        }

        val def = registry.get(request.operation)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.UNKNOWN_OPERATION,
                    message = "Unknown operation '${request.operation}'",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        // Extra hard guards independent of registry metadata defaults.
        if (def.readOrWrite == AgentReadOrWrite.WRITE) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.WRITE_DISABLED,
                    message = "Write operations are disabled in AGENT-001",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("operation" to def.operationId, "risk" to def.risk.name)
                ),
                metadata = baseMeta(request, def.executable, def.implementationStatus)
            )
        }

        if (!def.executable) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.EXECUTION_DISABLED,
                    message = "Operation '${def.operationId}' is registered but not executable yet",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf(
                        "implementationStatus" to def.implementationStatus.name,
                        "executable" to false
                    )
                ),
                metadata = baseMeta(request, false, def.implementationStatus)
            )
        }

        // Defensive: even if a future catalog marks executable, AGENT-001 runtime refuses.
        return failure(
            request,
            AgentError(
                code = AgentErrorCode.NOT_IMPLEMENTED,
                message = "No business executor is wired for AGENT-001",
                requestId = request.requestId,
                correlationId = request.correlationId
            ),
            metadata = baseMeta(request, false, def.implementationStatus)
        )
    }

    private fun baseMeta(
        request: AgentRequest,
        executable: Boolean,
        status: com.rentacar.app.agentapi.model.AgentImplementationStatus
    ) = AgentResponseMetadata(
        source = AgentDataSource.UNKNOWN,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = AgentResultCompleteness.UNKNOWN,
        lastSuccessfulSyncEpochMs = null,
        warnings = listOf(
            "AGENT-001 contract foundation only — no business data access",
            "Synchronization timestamps are unknown until a real executor observes them"
        ),
        executionTarget = request.target,
        implementationStatus = status,
        executable = executable
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError,
        metadata: AgentResponseMetadata = AgentResponseMetadata(
            source = AgentDataSource.UNKNOWN,
            syncStatus = AgentSyncStatus.UNKNOWN,
            resultCompleteness = AgentResultCompleteness.UNKNOWN,
            warnings = listOf("Request did not execute against business data")
        )
    ): AgentResponse = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = metadata,
        error = error
    )
}
