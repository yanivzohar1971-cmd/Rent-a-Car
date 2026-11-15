package com.rentacar.app.agentapi.cloud

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.execution.AgentOperationExecutor
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus

/**
 * Future seam for reading business data from the cloud mirror (Firestore/Functions).
 * NOT wired anywhere: no implementation exists and none may be added without an
 * isolated dev project and an explicit activation task (see AGENT-028 doc).
 */
interface CloudReadPort {
    /** Always false until a future task activates cloud reads. */
    val activated: Boolean
}

/** The only [CloudReadPort] that exists. */
object NotActivatedCloudReadPort : CloudReadPort {
    override val activated: Boolean = false
}

/**
 * AGENT-028 stub. Never reads cloud data, never calls the network, and never inspects
 * the port: every request fails with [AgentErrorCode.EXECUTION_DISABLED].
 */
class CloudAgentReadExecutor(
    @Suppress("unused") private val port: CloudReadPort = NotActivatedCloudReadPort
) : AgentOperationExecutor {
    override fun execute(request: AgentRequest): AgentResponse = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = AgentResponseMetadata(
            source = AgentDataSource.CLOUD,
            syncStatus = AgentSyncStatus.UNKNOWN,
            resultCompleteness = AgentResultCompleteness.UNAVAILABLE,
            warnings = listOf(MESSAGE),
            executable = false
        ),
        error = AgentError(
            code = AgentErrorCode.EXECUTION_DISABLED,
            message = MESSAGE,
            requestId = request.requestId,
            correlationId = request.correlationId,
            details = mapOf("operation" to request.operation, "cloudReadsActivated" to false)
        )
    )

    companion object {
        const val MESSAGE: String =
            "Cloud reads are not activated: this is an isolated-dev-only stub with no production deployment"
    }
}
