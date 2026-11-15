package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.validation.AgentRequestValidator

/**
 * Routes allowlisted local reads to [AndroidLocalSupplierReadExecutor];
 * everything else stays disabled / write-blocked.
 */
class DispatchingAgentOperationExecutor(
    private val registry: AgentCapabilityRegistry,
    private val localSupplierReadExecutor: AndroidLocalSupplierReadExecutor? = null,
    private val validator: AgentRequestValidator = AgentRequestValidator(registry)
) : AgentOperationExecutor {

    val wiredLocalOperations: Set<String> =
        if (localSupplierReadExecutor != null) AgentExecutableAllowlist.ANDROID_LOCAL_READS else emptySet()

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

        if (def.readOrWrite == AgentReadOrWrite.WRITE) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.WRITE_DISABLED,
                    message = "Write operations are disabled",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("operation" to def.operationId)
                ),
                metadata = meta(request, executable = false, status = def.implementationStatus)
            )
        }

        if (AgentExecutableAllowlist.isLocalReadEnabled(request.operation)) {
            val local = localSupplierReadExecutor
                ?: return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.NOT_IMPLEMENTED,
                        message = "Local supplier read executor is not wired",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    ),
                    metadata = meta(request, executable = false, status = AgentImplementationStatus.IMPLEMENTED)
                )
            return local.execute(request, def)
        }

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
            metadata = meta(request, executable = false, status = def.implementationStatus)
        )
    }

    private fun meta(
        request: AgentRequest,
        executable: Boolean,
        status: AgentImplementationStatus
    ) = AgentResponseMetadata(
        source = AgentDataSource.UNKNOWN,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = AgentResultCompleteness.UNKNOWN,
        lastSuccessfulSyncEpochMs = null,
        warnings = listOf("Operation was not executed against business data"),
        executionTarget = request.target,
        implementationStatus = status,
        executable = executable
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError,
        metadata: AgentResponseMetadata = meta(
            request,
            executable = false,
            status = AgentImplementationStatus.REGISTERED
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
