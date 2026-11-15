package com.rentacar.app.agentapi.mcp

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import java.util.UUID

data class AgentMcpError(
    val code: String,
    val message: String,
    val retryable: Boolean = false,
    val details: Map<String, Any?> = emptyMap()
)

data class AgentMcpCallResult(
    val success: Boolean,
    val operationId: String?,
    val requestId: String?,
    val result: Any? = null,
    val metadata: AgentResponseMetadata? = null,
    val pagination: AgentPaginationMetadata? = null,
    val error: AgentMcpError? = null
)

/**
 * In-process MCP-shaped adapter. Transport, authentication and device routing
 * remain responsibilities of a future authenticated gateway.
 */
class AgentMcpAdapter(
    private val api: RentCarAgentAPI,
    private val toolRegistry: AgentMcpToolRegistry = AgentMcpToolRegistry(api),
    private val requestIdFactory: () -> String = { "mcp-${UUID.randomUUID()}" }
) {
    fun listTools(): List<AgentMcpToolDescriptor> = toolRegistry.listTools()

    fun callTool(
        name: String,
        arguments: Map<String, Any?>,
        authContext: AgentAuthContext
    ): AgentMcpCallResult {
        val tool = toolRegistry.find(name)
            ?: return AgentMcpCallResult(
                success = false,
                operationId = null,
                requestId = null,
                error = AgentMcpError(
                    code = "UNKNOWN_TOOL",
                    message = "Unknown or unavailable MCP tool '$name'",
                    details = mapOf("tool" to name)
                )
            )

        val request = AgentRequest(
            apiVersion = AgentApiVersions.API_VERSION,
            operation = tool.operationId,
            requestId = requestIdFactory(),
            target = AgentExecutionTarget.ANDROID_LOCAL,
            parameters = arguments,
            auth = authContext
        )
        val response = api.execute(request)
        return if (response.success) {
            AgentMcpCallResult(
                success = true,
                operationId = response.operation,
                requestId = response.requestId,
                result = response.data,
                metadata = response.metadata,
                pagination = response.pagination
            )
        } else {
            AgentMcpCallResult(
                success = false,
                operationId = response.operation,
                requestId = response.requestId,
                metadata = response.metadata,
                pagination = response.pagination,
                error = response.error?.let {
                    AgentMcpError(
                        code = it.code.name,
                        message = it.message,
                        retryable = it.retryable,
                        details = it.details
                    )
                } ?: AgentMcpError(
                    code = "INTERNAL_ERROR",
                    message = "Agent API returned an unsuccessful response without an error"
                )
            )
        }
    }
}
