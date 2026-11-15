package com.rentacar.app.agentapi.registry

import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentReadOrWrite

/**
 * In-memory capability registry. Discoverable, not executable by default.
 */
class AgentCapabilityRegistry(
    private val catalog: OperationCatalogDocument
) {
    private val byId: Map<String, AgentOperationDefinition> =
        catalog.operations.associateBy { it.operationId }

    init {
        require(byId.size == catalog.operations.size) {
            "Duplicate operationId values in catalog"
        }
        // Catalog may mark IMPLEMENTED, but executable=true is reserved for runtime wiring.
        require(catalog.operations.none { it.executable }) {
            "Catalog must not set executable=true; runtime wiring controls executability"
        }
        require(
            catalog.operations
                .filter { it.readOrWrite == AgentReadOrWrite.WRITE }
                .none {
                    it.implementationStatus.name == "EXECUTABLE" ||
                        it.implementationStatus.name == "TESTED"
                }
        ) {
            "Write operations must not be catalog-marked executable/tested"
        }
        val reads = catalog.operations.count { it.readOrWrite == AgentReadOrWrite.READ }
        val writes = catalog.operations.count { it.readOrWrite == AgentReadOrWrite.WRITE }
        require(catalog.operations.size == catalog.reconciledTotals.total)
        require(reads == catalog.reconciledTotals.read)
        require(writes == catalog.reconciledTotals.write)
        // Hard safety: no SQL / reflection capability entries.
        require(catalog.operations.none { it.operationId.contains("sql", ignoreCase = true) }) {
            "SQL operations are forbidden"
        }
        require(catalog.operations.none { it.operationId.contains("reflect", ignoreCase = true) }) {
            "Reflection operations are forbidden"
        }
    }

    val apiVersion: String get() = catalog.apiVersion
    val catalogVersion: String get() = catalog.catalogVersion
    val sourceDocument: String get() = catalog.sourceDocument
    val reconciliationNote: String? get() = catalog.reconciliationNote
    val reconciledTotals: CatalogTotals get() = catalog.reconciledTotals
    val phase0SummaryClaim: CatalogTotals? get() = catalog.phase0SummaryClaim

    fun size(): Int = catalog.operations.size

    fun all(): List<AgentOperationDefinition> = catalog.operations

    fun get(operationId: String): AgentOperationDefinition? = byId[operationId]

    fun contains(operationId: String): Boolean = byId.containsKey(operationId)

    fun reads(): List<AgentOperationDefinition> =
        catalog.operations.filter { it.readOrWrite == AgentReadOrWrite.READ }

    fun writes(): List<AgentOperationDefinition> =
        catalog.operations.filter { it.readOrWrite == AgentReadOrWrite.WRITE }

    fun modules(): List<String> = catalog.operations.map { it.module }.distinct().sorted()

    fun executableCount(): Int = catalog.operations.count { it.executable }

    companion object {
        fun loadDefault(): AgentCapabilityRegistry =
            AgentCapabilityRegistry(OperationCatalogLoader.loadFromClasspath())
    }
}
