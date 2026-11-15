package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.cloud.CloudReadAllowlist
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget

/** What is currently available to serve one request. */
data class ExecutionAvailability(
    /** A local executor is wired for the requested operation. */
    val localOperationWired: Boolean,
    /** The device that owns the local data is reachable. */
    val deviceReachable: Boolean = true,
    /** The cloud read port is activated. */
    val cloudActivated: Boolean = false
)

sealed class ExecutionRoute {
    data class Selected(
        val target: AgentExecutionTarget,
        val warnings: List<String> = emptyList()
    ) : ExecutionRoute()

    data class Failed(
        val code: AgentErrorCode,
        val message: String,
        val retryable: Boolean = false,
        val details: Map<String, Any?> = emptyMap()
    ) : ExecutionRoute()
}

/**
 * AGENT-108: picks ANDROID_LOCAL or CLOUD for a request, or fails with a clear error.
 *
 *  - ANDROID_LOCAL: needs a wired local executor and a reachable device; never falls back to cloud.
 *  - CLOUD: needs an activated port and an allowlisted cloud operation; never falls back to local.
 *  - AUTO: local first; falls back to cloud only when the device is unreachable (or no local
 *    executor exists) AND the cloud can serve the operation. A cloud fallback is flagged with a warning
 *    because cloud data has unverified freshness.
 */
class ExecutionTargetRouter {

    fun route(
        target: AgentExecutionTarget,
        operation: String,
        availability: ExecutionAvailability
    ): ExecutionRoute = when (target) {
        AgentExecutionTarget.ANDROID_LOCAL -> local(operation, availability)
        AgentExecutionTarget.CLOUD -> cloud(operation, availability)
        AgentExecutionTarget.AUTO -> auto(operation, availability)
    }

    private fun local(operation: String, a: ExecutionAvailability): ExecutionRoute = when {
        !a.localOperationWired -> unsupported(operation, AgentExecutionTarget.ANDROID_LOCAL, "no local executor is wired")
        !a.deviceReachable -> deviceUnavailable()
        else -> ExecutionRoute.Selected(AgentExecutionTarget.ANDROID_LOCAL)
    }

    private fun cloud(operation: String, a: ExecutionAvailability): ExecutionRoute = when {
        !CloudReadAllowlist.isAllowed(operation) ->
            unsupported(operation, AgentExecutionTarget.CLOUD, "operation is not an allowlisted cloud read")
        !a.cloudActivated -> cloudUnavailable()
        else -> ExecutionRoute.Selected(AgentExecutionTarget.CLOUD, listOf(CLOUD_WARNING))
    }

    private fun auto(operation: String, a: ExecutionAvailability): ExecutionRoute {
        if (a.localOperationWired && a.deviceReachable) {
            return ExecutionRoute.Selected(AgentExecutionTarget.ANDROID_LOCAL)
        }
        val cloudEligible = CloudReadAllowlist.isAllowed(operation) && a.cloudActivated
        if (cloudEligible) {
            val reason = if (a.localOperationWired) "Device unavailable" else "No local executor"
            return ExecutionRoute.Selected(
                AgentExecutionTarget.CLOUD,
                listOf("$reason; served from cloud", CLOUD_WARNING)
            )
        }
        return when {
            a.localOperationWired -> deviceUnavailable()
            else -> unsupported(operation, AgentExecutionTarget.AUTO, "neither local nor cloud can serve it")
        }
    }

    private fun deviceUnavailable() = ExecutionRoute.Failed(
        code = AgentErrorCode.DEVICE_UNAVAILABLE,
        message = "Device is not reachable and no cloud fallback is available",
        retryable = true
    )

    private fun cloudUnavailable() = ExecutionRoute.Failed(
        code = AgentErrorCode.CLOUD_UNAVAILABLE,
        message = "Cloud reads are not activated",
        retryable = false
    )

    private fun unsupported(operation: String, target: AgentExecutionTarget, reason: String) = ExecutionRoute.Failed(
        code = AgentErrorCode.UNSUPPORTED_OPERATION,
        message = "Operation '$operation' cannot be executed on target ${target.name}: $reason",
        details = mapOf("operation" to operation, "target" to target.name)
    )

    companion object {
        const val CLOUD_WARNING: String = "Data source is CLOUD; sync status is unverified"
    }
}
