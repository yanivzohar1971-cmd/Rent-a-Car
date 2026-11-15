package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.customer.CustomerReadPort
import com.rentacar.app.agentapi.dto.CustomerAgentDtoMapper
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
import com.rentacar.app.data.Customer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/**
 * AGENT-013: Android local read executor for customer.list / customer.get.
 * Uses existing [CustomerReadPort] (backed by [com.rentacar.app.data.CustomerRepository]).
 */
class AndroidLocalCustomerReadExecutor(
    private val customerReadPort: CustomerReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    companion object {
        private const val TAG = "AgentCustomerRead"
        const val DEFAULT_LIMIT: Int = 50
        const val MAX_LIMIT: Int = 200

        private val LIST_ALLOWED_PARAMS = setOf("query", "limit", "offset")
        private val GET_ALLOWED_PARAMS = setOf("id")

        private val UNSUPPORTED_LIST_FILTERS = setOf(
            "active",
            "isCompany",
            "phone",
            "email",
            "tzId",
            "address",
            "firstName",
            "lastName",
            "customerNumber"
        )
    }

    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        val authError = authorize(request, definition)
        if (authError != null) return failure(request, authError)

        val targetError = validateTarget(request)
        if (targetError != null) return failure(request, targetError)

        return try {
            when (request.operation) {
                AgentExecutableAllowlist.CUSTOMER_LIST -> runBlocking {
                    withContext(ioDispatcher) { listCustomers(request) }
                }
                AgentExecutableAllowlist.CUSTOMER_GET -> runBlocking {
                    withContext(ioDispatcher) { getCustomer(request) }
                }
                else -> failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.UNSUPPORTED_OPERATION,
                        message = "Local customer executor does not support '${request.operation}'",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    )
                )
            }
        } catch (t: Throwable) {
            System.err.println("$TAG: Customer read failed for ${request.operation}: ${t.javaClass.simpleName}")
            failure(
                request,
                AgentError(
                    code = AgentErrorCode.INTERNAL_ERROR,
                    message = "Customer read failed",
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
                message = "Authenticated userUid is required for local customer reads",
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
                message = "CLOUD execution is disabled for AGENT-013 customer reads",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("target" to request.target.name)
            )
        }
    }

    private suspend fun listCustomers(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!

        val unsupported = request.parameters.keys.filter { key ->
            key in UNSUPPORTED_LIST_FILTERS || (key !in LIST_ALLOWED_PARAMS)
        }
        if (unsupported.isNotEmpty()) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Unsupported filter(s) for customer.list: ${unsupported.sorted().joinToString()}",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf(
                        "unsupported" to unsupported.sorted(),
                        "supported" to LIST_ALLOWED_PARAMS.sorted()
                    )
                )
            )
        }

        val query = request.parameters["query"]?.toString()?.trim().orEmpty()
        val limit = parsePositiveInt(request.parameters["limit"], DEFAULT_LIMIT)
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
        val offset = parseNonNegativeInt(request.parameters["offset"], 0)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Invalid offset",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        // Match CustomersListScreen / CustomerViewModel: empty → all; query → active search.
        val matched = if (query.isEmpty()) {
            customerReadPort.listForUser(userUid)
        } else {
            customerReadPort.searchForUser(query, userUid)
        }
        // DAO orders by lastName, firstName; add id ASC secondary for stable pagination.
        val filtered = matched.sortedWith(
            compareBy<Customer> { it.lastName.lowercase() }
                .thenBy { it.firstName.lowercase() }
                .thenBy { it.id }
        )
        val page = filtered.drop(offset).take(limit)
        val items = page.map(CustomerAgentDtoMapper::toDto)
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

    private suspend fun getCustomer(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!

        val unknownKeys = request.parameters.keys.filter { it !in GET_ALLOWED_PARAMS }
        if (unknownKeys.isNotEmpty()) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Unsupported parameter(s) for customer.get: ${unknownKeys.sorted().joinToString()}",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("unsupported" to unknownKeys.sorted())
                )
            )
        }

        val id = parseRequiredId(request.parameters["id"])
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Parameter 'id' must be a positive integer (internal customer id)",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        val customer = customerReadPort.getByIdForUser(id, userUid)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Customer not found",
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
            data = mapOf("item" to CustomerAgentDtoMapper.toDto(customer)),
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
            "Read from local Room via CustomerRepository; sync freshness is unknown",
            "CLOUD target is disabled for AGENT-013",
            "tzId and address are excluded from Agent API customer DTOs",
            "Non-empty query uses active-only search (matches CustomerDao.search / CustomersListScreen)"
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

    private fun parsePositiveInt(raw: Any?, default: Int): Int? {
        if (raw == null) return default
        val value = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.trim().toIntOrNull() ?: return null
            else -> return null
        }
        return if (value >= 1) value else null
    }

    private fun parseNonNegativeInt(raw: Any?, default: Int): Int? {
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
            warnings = listOf("Customer read did not return business data"),
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
