package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.discovery.AgentCapabilityDiscovery
import com.rentacar.app.agentapi.execution.AgentOperationExecutor
import com.rentacar.app.agentapi.execution.DisabledAgentOperationExecutor
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry

/**
 * Entry point for the Rent a Car Agent API contract (AGENT-001 foundation).
 *
 * This façade exposes discovery + disabled execution only.
 * It does not open Room, Firestore, network listeners, or MCP sockets.
 */
class RentCarAgentAPI(
    val registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault(),
    val discovery: AgentCapabilityDiscovery = AgentCapabilityDiscovery(registry),
    private val executor: AgentOperationExecutor = DisabledAgentOperationExecutor(registry)
) {
    fun discover() = discovery.discoverAll()

    fun discover(operationId: String) = discovery.discover(operationId)

    fun execute(request: AgentRequest): AgentResponse = executor.execute(request)

    companion object {
        const val NAME: String = "RentCarAgentAPI"
    }
}
