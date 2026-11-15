package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.dto.SupplierAgentDto
import com.rentacar.app.agentapi.dto.SupplierAgentDtoMapper
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.supplier.SupplierReadPort
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/**
 * AGENT-010: Android local read executor for supplier.list / supplier.get.
 * Uses existing [SupplierReadPort] (backed by [com.rentacar.app.data.SupplierRepository]).
 */
class AndroidLocalSupplierReadExecutor(
    private val supplierReadPort: SupplierReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    companion object {
        private const val TAG = "AgentSupplierRead"
        const val DEFAULT_LIMIT: Int = 50
        const val MAX_LIMIT: Int = 200
    }

    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        val authError = authorize(request, definition)
        if (authError != null) return failure(request, authError)

        val targetError = validateTarget(request)
        if (targetError != null) return failure(request, targetError)

        return try {
            when (request.operation) {
                AgentExecutableAllowlist.SUPPLIER_LIST -> runBlocking {
                    withContext(ioDispatcher) { listSuppliers(request) }
                }
                AgentExecutableAllowlist.SUPPLIER_GET -> runBlocking {
                    withContext(ioDispatcher) { getSupplier(request) }
                }
                else -> failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.UNSUPPORTED_OPERATION,
                        message = "Local supplier executor does not support '${request.operation}'",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    )
                )
            }
        } catch (t: Throwable) {
            // Avoid android.util.Log here so JVM unit tests can exercise failure paths.
            System.err.println("$TAG: Supplier read failed for ${request.operation}: ${t.javaClass.simpleName}")
            failure(
                request,
                AgentError(
                    code = AgentErrorCode.INTERNAL_ERROR,
                    message = "Supplier read failed",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    retryable = true
                )
            )
        }
    }

    private fun authorize(request: AgentRequest, definition: AgentOperationDefinition): AgentError? {
        val auth = request.auth
        if (auth == null || auth.userUid.isNullOrBlank()) {
            return AgentError(
                code = AgentErrorCode.UNAUTHORIZED,
                message = "Authenticated userUid is required for local supplier reads",
                requestId = request.requestId,
                correlationId = request.correlationId
            )
        }
        val required = definition.requiredPermissions
        val granted = auth.permissions.map { it.uppercase() }.toSet()
        val missing = required.filter { it.uppercase() !in granted }
        if (missing.isNotEmpty()) {
            return AgentError(
                code = AgentErrorCode.FORBIDDEN,
                message = "Missing required permissions: ${missing.joinToString()}",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("missing" to missing)
            )
        }
        return null
    }

    private fun validateTarget(request: AgentRequest): AgentError? {
        return when (request.target) {
            AgentExecutionTarget.ANDROID_LOCAL,
            AgentExecutionTarget.AUTO -> null
            AgentExecutionTarget.CLOUD -> AgentError(
                code = AgentErrorCode.UNSUPPORTED_OPERATION,
                message = "CLOUD execution is disabled for AGENT-010 supplier reads",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("target" to request.target.name)
            )
        }
    }

    private suspend fun listSuppliers(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!

        // supplierId is declared in catalog schema but is not a supported list filter.
        if (request.parameters.containsKey("supplierId")) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Parameter 'supplierId' is not supported for supplier.list; use supplier.get",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        }

        val query = request.parameters["query"]?.toString()?.trim().orEmpty()
        val limit = parsePositiveInt(request.parameters["limit"], DEFAULT_LIMIT, "limit")
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Invalid limit",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        if (limit > MAX_LIMIT) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "limit must be <= $MAX_LIMIT",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        }
        val offset = parseNonNegativeInt(request.parameters["offset"], 0, "offset")
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Invalid offset",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        // DAO already orders by name; keep deterministic secondary sort by id.
        val all = supplierReadPort.listForUser(userUid)
            .sortedWith(compareBy({ it.name.lowercase() }, { it.id }))
        val filtered = if (query.isEmpty()) {
            all
        } else {
            all.filter { it.name.contains(query, ignoreCase = true) }
        }
        val page = filtered.drop(offset).take(limit)
        val items = page.map(SupplierAgentDtoMapper::toDto)
        val hasMore = offset + items.size < filtered.size

        return AgentResponse(
            success = true,
            apiVersion = AgentApiVersions.API_VERSION,
            operation = request.operation,
            requestId = request.requestId,
            correlationId = request.correlationId,
            data = mapOf("items" to items, "totalMatching" to filtered.size),
            metadata = localMeta(request),
            error = null,
            pagination = AgentPaginationMetadata(
                limit = limit,
                offset = offset,
                totalHint = filtered.size,
                hasMore = hasMore
            )
        )
    }

    private suspend fun getSupplier(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!
        val id = parseRequiredId(request.parameters["id"])
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Parameter 'id' must be a positive integer",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        val supplier = supplierReadPort.getByIdForUser(id, userUid)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Supplier not found",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("id" to id)
                ),
                metadata = localMeta(request)
            )

        return AgentResponse(
            success = true,
            apiVersion = AgentApiVersions.API_VERSION,
            operation = request.operation,
            requestId = request.requestId,
            correlationId = request.correlationId,
            data = mapOf("item" to SupplierAgentDtoMapper.toDto(supplier)),
            metadata = localMeta(request),
            error = null
        )
    }

    private fun localMeta(request: AgentRequest) = AgentResponseMetadata(
        source = AgentDataSource.LOCAL,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = AgentResultCompleteness.UNKNOWN,
        lastSuccessfulSyncEpochMs = null,
        warnings = listOf(
            "Read from local Room via SupplierRepository; sync freshness is unknown",
            "CLOUD target is disabled for AGENT-010"
        ),
        executionTarget = when (request.target) {
            AgentExecutionTarget.AUTO -> AgentExecutionTarget.ANDROID_LOCAL
            else -> request.target
        },
        implementationStatus = AgentImplementationStatus.EXECUTABLE,
        executable = true
    )

    private fun parseRequiredId(raw: Any?): Long? {
        val value = when (raw) {
            null -> return null
            is Number -> raw.toLong()
            is String -> raw.trim().toLongOrNull() ?: return null
            else -> return null
        }
        return if (value > 0L) value else null
    }

    private fun parsePositiveInt(raw: Any?, default: Int, @Suppress("UNUSED_PARAMETER") field: String): Int? {
        if (raw == null) return default
        val value = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.trim().toIntOrNull() ?: return null
            else -> return null
        }
        return if (value >= 1) value else null
    }

    private fun parseNonNegativeInt(raw: Any?, default: Int, @Suppress("UNUSED_PARAMETER") field: String): Int? {
        if (raw == null) return default
        val value = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.trim().toIntOrNull() ?: return null
            else -> return null
        }
        return if (value >= 0) value else null
    }

    private fun failure(
        request: AgentRequest,
        error: AgentError,
        metadata: AgentResponseMetadata = AgentResponseMetadata(
            source = AgentDataSource.LOCAL,
            syncStatus = AgentSyncStatus.UNKNOWN,
            resultCompleteness = AgentResultCompleteness.UNKNOWN,
            warnings = listOf("Supplier read did not return business data"),
            executionTarget = request.target,
            implementationStatus = AgentImplementationStatus.IMPLEMENTED,
            executable = true
        )
    ): AgentResponse = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = metadata,
        error = error
    )
}

/** Trusted test/app boundary helper: authenticated local context. */
fun agentLocalAuth(userUid: String): AgentAuthContext = AgentAuthContext(
    userUid = userUid,
    permissions = listOf("AUTHENTICATED")
)
