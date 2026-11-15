package com.rentacar.app.agentapi.model

/**
 * Immutable registry entry for one Phase-0 discovered business operation.
 * Registration does **not** imply the operation is executable.
 */
data class AgentOperationDefinition(
    val operationId: String,
    val module: String,
    val entity: String,
    val description: String,
    val actionName: String,
    val screen: String,
    val readOrWrite: AgentReadOrWrite,
    val sourceFiles: String,
    val localSupport: String,
    val cloudSupport: String,
    val requiredPermissions: List<String>,
    val risk: AgentOperationRisk,
    val confirmationPolicy: AgentConfirmationPolicy,
    val executionTargets: List<AgentExecutionTarget>,
    val syncConsiderations: String,
    val inputSchema: Map<String, Any?>,
    val outputSchema: Map<String, Any?>,
    val implementationStatus: AgentImplementationStatus,
    val executable: Boolean,
    val sideEffect: AgentSideEffect,
    val complexity: String
) {
    init {
        require(operationId.isNotBlank()) { "operationId required" }
        if (executable) {
            require(
                implementationStatus == AgentImplementationStatus.EXECUTABLE ||
                    implementationStatus == AgentImplementationStatus.TESTED
            ) { "executable=true requires EXECUTABLE/TESTED status" }
        }
    }
}
