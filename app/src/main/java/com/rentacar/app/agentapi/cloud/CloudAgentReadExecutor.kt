package com.rentacar.app.agentapi.cloud

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.execution.AgentOperationExecutor
import com.rentacar.app.agentapi.execution.LocalReadSupport
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus

/**
 * Result of a cloud read. [data] has the same shape as the Android-local executors
 * (`items` + `totalMatching` for lists, `item` for gets).
 *
 * [completeness] must be COMPLETE or PARTIAL; anything else is reported as PARTIAL.
 */
data class CloudReadResult(
    val data: Map<String, Any?> = emptyMap(),
    val completeness: AgentResultCompleteness = AgentResultCompleteness.PARTIAL,
    val pagination: AgentPaginationMetadata? = null,
    val warnings: List<String> = emptyList(),
    /** True when the port looked and the record does not exist in the caller's scope. */
    val notFound: Boolean = false
)

/**
 * Seam for reading business data from the cloud mirror (Firestore/Functions).
 * The only production implementation is [NotActivatedCloudReadPort]. A live Firebase port must
 * not be added without an isolated dev project and an explicit activation task (AGENT-028 doc);
 * tests use an isolated in-memory port.
 */
interface CloudReadPort {
    /** False until a future task activates cloud reads. */
    val activated: Boolean

    /**
     * Reads one allowlisted operation scoped to [uid]. Returns null when the cloud cannot answer
     * (unsupported operation, outage, not activated) — callers must treat null as unavailable.
     */
    fun read(operation: String, uid: String, parameters: Map<String, Any?>): CloudReadResult? = null
}

/** The only production [CloudReadPort]. */
object NotActivatedCloudReadPort : CloudReadPort {
    override val activated: Boolean = false
}

/** Operations that may ever be served from the cloud. Everything else is refused. */
object CloudReadAllowlist {
    const val SUPPLIER_LIST = "supplier.list"
    const val SUPPLIER_GET = "supplier.get"
    const val CUSTOMER_LIST = "customer.list"
    const val CUSTOMER_GET = "customer.get"
    const val RESERVATION_LIST_MANAGE = "reservation.list.manage"
    const val RESERVATION_GET = "reservation.get"

    val OPERATIONS: Set<String> = setOf(
        SUPPLIER_LIST, SUPPLIER_GET, CUSTOMER_LIST, CUSTOMER_GET, RESERVATION_LIST_MANAGE, RESERVATION_GET
    )

    private val GET_OPERATIONS = setOf(SUPPLIER_GET, CUSTOMER_GET, RESERVATION_GET)

    fun isAllowed(operation: String): Boolean = operation in OPERATIONS

    fun isGet(operation: String): Boolean = operation in GET_OPERATIONS
}

/**
 * Cloud read executor (AGENT-028 stub, extended by AGENT-107).
 *
 * While the port is not [CloudReadPort.activated] every request fails with
 * [AgentErrorCode.EXECUTION_DISABLED] without touching the port. When activated, only
 * [CloudReadAllowlist] operations execute, scoped to the authenticated uid. Responses carry
 * source=CLOUD and syncStatus=UNKNOWN (cloud freshness is never verified here) and never invent
 * a last-sync timestamp.
 */
class CloudAgentReadExecutor(
    private val port: CloudReadPort = NotActivatedCloudReadPort
) : AgentOperationExecutor {

    val activated: Boolean get() = port.activated

    override fun execute(request: AgentRequest): AgentResponse {
        if (!port.activated) return disabled(request)

        if (!CloudReadAllowlist.isAllowed(request.operation)) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.UNSUPPORTED_OPERATION,
                    message = "Operation '${request.operation}' is not available as a cloud read",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("allowed" to CloudReadAllowlist.OPERATIONS.sorted())
                )
            )
        }
        if (request.target == AgentExecutionTarget.ANDROID_LOCAL) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.UNSUPPORTED_OPERATION,
                    message = "Cloud executor does not serve target ANDROID_LOCAL",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("target" to request.target.name)
                )
            )
        }

        val auth = request.auth
        val uid = auth?.userUid?.trim().orEmpty()
        if (uid.isEmpty()) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.UNAUTHORIZED,
                    message = "Authenticated userUid is required for cloud reads",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        }
        if (auth!!.permissions.none { it.equals("AUTHENTICATED", ignoreCase = true) }) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.FORBIDDEN,
                    message = "Missing required permissions: AUTHENTICATED",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("missing" to listOf("AUTHENTICATED"))
                )
            )
        }

        val parameters = HashMap(request.parameters)
        if (CloudReadAllowlist.isGet(request.operation)) {
            val id = LocalReadSupport.parseRequiredPositiveLong(request.parameters["id"])
                ?: return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.INVALID_ARGUMENT,
                        message = "Parameter 'id' must be a positive integer",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    )
                )
            parameters["id"] = id
        } else {
            val page = LocalReadSupport.parsePagination(request).getOrElse {
                return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.INVALID_ARGUMENT,
                        message = it.message ?: "Invalid pagination",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    )
                )
            }
            parameters["limit"] = page.limit
            parameters["offset"] = page.offset
        }

        val result = try {
            port.read(request.operation, uid, parameters)
        } catch (t: Throwable) {
            System.err.println("AgentCloudRead: read failed for ${request.operation}: ${t.javaClass.simpleName}")
            null
        } ?: return failure(
            request,
            AgentError(
                code = AgentErrorCode.CLOUD_UNAVAILABLE,
                message = "Cloud data could not be read",
                requestId = request.requestId,
                correlationId = request.correlationId,
                retryable = true
            )
        )

        if (result.notFound) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Record not found in cloud data for the authenticated user",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        }

        val completeness = when (result.completeness) {
            AgentResultCompleteness.COMPLETE -> AgentResultCompleteness.COMPLETE
            else -> AgentResultCompleteness.PARTIAL
        }
        return AgentResponse(
            success = true,
            apiVersion = AgentApiVersions.API_VERSION,
            operation = request.operation,
            requestId = request.requestId,
            correlationId = request.correlationId,
            data = result.data,
            metadata = metadata(completeness, SUCCESS_WARNINGS + result.warnings),
            error = null,
            pagination = result.pagination
        )
    }

    private fun metadata(completeness: AgentResultCompleteness, warnings: List<String>) = AgentResponseMetadata(
        source = AgentDataSource.CLOUD,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = completeness,
        lastSuccessfulSyncEpochMs = null,
        warnings = warnings,
        executionTarget = AgentExecutionTarget.CLOUD,
        implementationStatus = AgentImplementationStatus.EXECUTABLE,
        executable = true
    )

    private fun failure(request: AgentRequest, error: AgentError) = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = metadata(AgentResultCompleteness.UNAVAILABLE, listOf("Cloud read did not return business data")),
        error = error
    )

    private fun disabled(request: AgentRequest): AgentResponse = AgentResponse(
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

        private val SUCCESS_WARNINGS = listOf(
            "Read from cloud mirror; sync freshness is unknown"
        )
    }
}
