package com.rentacar.app.agentapi.discovery

import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.registry.CatalogTotals

/**
 * Discovery surface for future MCP tool schema generation.
 * Advertises executable=true only for operations wired into the current API boundary.
 */
class AgentCapabilityDiscovery(
    private val registry: AgentCapabilityRegistry,
    private val wiredExecutableIds: Set<String> = emptySet()
) {
    data class DiscoveryDocument(
        val apiVersion: String,
        val catalogVersion: String,
        val reconciledTotals: CatalogTotals,
        val phase0SummaryClaim: CatalogTotals?,
        val reconciliationNote: String?,
        val modules: List<String>,
        val operations: List<DiscoveredOperation>,
        val executableOperations: Int,
        val registeredOperations: Int,
        val implementedOperations: Int
    )

    data class DiscoveredOperation(
        val operationId: String,
        val module: String,
        val entity: String,
        val description: String,
        val readOrWrite: AgentReadOrWrite,
        val requiredParameters: List<String>,
        val inputSchema: Map<String, Any?>,
        val outputSchema: Map<String, Any?>,
        val executionTargets: List<String>,
        val requiredPermissions: List<String>,
        val confirmationPolicy: String,
        val risk: String,
        val implementationStatus: String,
        val executable: Boolean,
        val syncConsiderations: String,
        val sourceFiles: String
    )

    fun discoverAll(): DiscoveryDocument {
        val ops = registry.all().map { it.toDiscovered() }
        return DiscoveryDocument(
            apiVersion = registry.apiVersion,
            catalogVersion = registry.catalogVersion,
            reconciledTotals = registry.reconciledTotals,
            phase0SummaryClaim = registry.phase0SummaryClaim,
            reconciliationNote = registry.reconciliationNote,
            modules = registry.modules(),
            operations = ops,
            executableOperations = ops.count { it.executable },
            registeredOperations = ops.size,
            implementedOperations = registry.all().count {
                it.implementationStatus.name == "IMPLEMENTED" ||
                    it.implementationStatus.name == "EXECUTABLE" ||
                    it.implementationStatus.name == "TESTED" ||
                    it.operationId in wiredExecutableIds
            }
        )
    }

    fun discover(operationId: String): DiscoveredOperation? =
        registry.get(operationId)?.toDiscovered()

    private fun AgentOperationDefinition.toDiscovered(): DiscoveredOperation {
        @Suppress("UNCHECKED_CAST")
        val required = (inputSchema["required"] as? List<*>)?.mapNotNull { it as? String }.orEmpty()
        val isWired = operationId in wiredExecutableIds
        return DiscoveredOperation(
            operationId = operationId,
            module = module,
            entity = entity,
            description = description,
            readOrWrite = readOrWrite,
            requiredParameters = required,
            inputSchema = inputSchema,
            outputSchema = outputSchema,
            executionTargets = executionTargets.map { it.name },
            requiredPermissions = requiredPermissions,
            confirmationPolicy = confirmationPolicy.name,
            risk = risk.name,
            implementationStatus = if (isWired) "EXECUTABLE" else implementationStatus.name,
            executable = isWired,
            syncConsiderations = syncConsiderations,
            sourceFiles = sourceFiles
        )
    }
}
