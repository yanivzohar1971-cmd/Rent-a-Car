package com.rentacar.app.agentapi.mcp

import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentSideEffect

/**
 * MCP discovery is runtime-wiring based: catalog registration alone never
 * creates a tool.
 */
class AgentMcpToolRegistry(
    private val api: RentCarAgentAPI
) {
    private val toolsByName: Map<String, AgentMcpToolDescriptor> = api
        .wiredExecutableOperations
        .asSequence()
        .filter(AgentExecutableAllowlist::isLocalReadEnabled)
        .mapNotNull(api.registry::get)
        .filter { definition ->
            definition.readOrWrite == AgentReadOrWrite.READ &&
                definition.sideEffect == AgentSideEffect.NONE &&
                definition.implementationStatus != AgentImplementationStatus.REGISTERED
        }
        .map { definition ->
            AgentMcpToolDescriptor(
                name = definition.operationId,
                description = definition.description,
                inputSchema = definition.inputSchema,
                operationId = definition.operationId
            )
        }
        .sortedBy(AgentMcpToolDescriptor::name)
        .associateBy(AgentMcpToolDescriptor::name)

    fun listTools(): List<AgentMcpToolDescriptor> = toolsByName.values.toList()

    fun find(name: String): AgentMcpToolDescriptor? = toolsByName[name]
}
