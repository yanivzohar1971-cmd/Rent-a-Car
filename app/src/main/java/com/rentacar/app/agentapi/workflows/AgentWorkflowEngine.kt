package com.rentacar.app.agentapi.workflows

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.validation.AgentRequestValidator

/** One operation call made by a workflow (no business data; counts only). */
data class WorkflowStep(
    val operation: String,
    val success: Boolean,
    val errorCode: String? = null,
    val itemCount: Int? = null
)

data class WorkflowResult(
    val workflowId: String,
    val success: Boolean,
    val data: Map<String, Any?>? = null,
    val steps: List<WorkflowStep> = emptyList(),
    val error: AgentError? = null,
    val warnings: List<String> = emptyList(),
    /** Workflows in this phase compose reads only; this is always true. */
    val readOnly: Boolean = true
)

/**
 * Read-only composition of existing Agent API operations. A workflow may only call operations
 * it declares in [allowedOperations]; the engine verifies each is a registered READ that is on
 * the local-read allowlist, so a workflow can never reach a write.
 */
interface AgentWorkflow {
    val workflowId: String
    val description: String
    val allowedOperations: Set<String>

    /** Parameter names the workflow accepts (anything else is rejected before execution). */
    val allowedParameters: Set<String>

    fun run(context: WorkflowContext, parameters: Map<String, Any?>): WorkflowResult
}

/** Scoped, auditable access to the Agent API for a single workflow run. */
class WorkflowContext internal constructor(
    private val api: RentCarAgentAPI,
    val auth: AgentAuthContext,
    private val workflow: AgentWorkflow,
    private val requestIdPrefix: String
) {
    private val recorded = mutableListOf<WorkflowStep>()
    val steps: List<WorkflowStep> get() = recorded.toList()

    fun call(operation: String, parameters: Map<String, Any?> = emptyMap()): AgentResponse {
        check(operation in workflow.allowedOperations) {
            "Workflow '${workflow.workflowId}' may not call '$operation'"
        }
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = operation,
                requestId = "$requestIdPrefix-${recorded.size + 1}-$operation",
                target = AgentExecutionTarget.ANDROID_LOCAL,
                parameters = parameters,
                auth = auth,
                correlationId = requestIdPrefix
            )
        )
        recorded += WorkflowStep(
            operation = operation,
            success = response.success,
            errorCode = response.error?.code?.name,
            itemCount = ((response.data as? Map<*, *>)?.get("items") as? List<*>)?.size
        )
        return response
    }

    internal fun failure(response: AgentResponse): WorkflowResult = WorkflowResult(
        workflowId = workflow.workflowId,
        success = false,
        steps = steps,
        error = response.error ?: AgentError(
            code = AgentErrorCode.INTERNAL_ERROR,
            message = "Step '${response.operation}' failed without an error"
        )
    )
}

/**
 * AGENT-061: runs registered read-only [AgentWorkflow]s on top of [RentCarAgentAPI].
 *
 * Identity is taken only from the supplied [AgentAuthContext] (in production: the gateway's
 * token-bound session); workflow parameters can never carry identity or SQL.
 */
class AgentWorkflowEngine(
    private val api: RentCarAgentAPI,
    workflows: List<AgentWorkflow> = defaultWorkflows()
) {
    private val byId = workflows.associateBy { it.workflowId }

    init {
        require(byId.size == workflows.size) { "Duplicate workflow ids" }
        workflows.forEach { workflow ->
            workflow.allowedOperations.forEach { op ->
                val def = api.registry.get(op)
                require(def != null && def.readOrWrite == AgentReadOrWrite.READ) {
                    "Workflow '${workflow.workflowId}' references non-READ or unknown operation '$op'"
                }
                require(AgentExecutableAllowlist.isLocalReadEnabled(op)) {
                    "Workflow '${workflow.workflowId}' references '$op' which is not a local read"
                }
            }
        }
    }

    fun workflowIds(): List<String> = byId.keys.sorted()

    fun describe(): List<Pair<String, String>> = byId.values.sortedBy { it.workflowId }.map { it.workflowId to it.description }

    fun run(
        workflowId: String,
        parameters: Map<String, Any?>,
        auth: AgentAuthContext?,
        requestId: String = "wf-${System.nanoTime()}"
    ): WorkflowResult {
        val workflow = byId[workflowId]
            ?: return rejected(workflowId, AgentErrorCode.UNKNOWN_OPERATION, "Unknown workflow '$workflowId'")
        if (auth?.userUid.isNullOrBlank()) {
            return rejected(workflowId, AgentErrorCode.UNAUTHORIZED, "Authenticated userUid is required")
        }
        AgentRequestValidator.detectForbiddenParameters(parameters)?.let { (code, message) ->
            return rejected(workflowId, code, message)
        }
        val unknown = parameters.keys.filterNot { it in workflow.allowedParameters }.sorted()
        if (unknown.isNotEmpty()) {
            return rejected(
                workflowId, AgentErrorCode.INVALID_ARGUMENT,
                "Unknown parameters: ${unknown.joinToString()}", mapOf("unknown" to unknown)
            )
        }
        val context = WorkflowContext(api, auth!!, workflow, requestId)
        return try {
            workflow.run(context, parameters)
        } catch (_: Throwable) {
            WorkflowResult(
                workflowId = workflowId,
                success = false,
                steps = context.steps,
                error = AgentError(AgentErrorCode.INTERNAL_ERROR, "Workflow execution failed", retryable = false)
            )
        }
    }

    private fun rejected(
        workflowId: String,
        code: AgentErrorCode,
        message: String,
        details: Map<String, Any?> = emptyMap()
    ) = WorkflowResult(
        workflowId = workflowId,
        success = false,
        error = AgentError(code = code, message = message, details = details)
    )

    companion object {
        fun defaultWorkflows(): List<AgentWorkflow> = listOf(
            FindCustomerAndListReservationsWorkflow(),
            UnpaidCommissionSummaryWorkflow()
        )
    }
}
