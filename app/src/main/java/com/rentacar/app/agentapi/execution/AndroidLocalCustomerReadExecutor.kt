package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.customer.CustomerReadPort
import com.rentacar.app.agentapi.dto.CustomerAgentDtoMapper
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
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
        const val DEFAULT_LIMIT: Int = LocalReadSupport.DEFAULT_LIMIT
        const val MAX_LIMIT: Int = LocalReadSupport.MAX_LIMIT

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
        val authError = LocalReadSupport.authorize(request, definition, "customer")
        if (authError != null) return failure(request, authError)

        val targetError = LocalReadSupport.validateLocalOrAutoTarget(
            request,
            "AGENT-013 customer reads"
        )
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
        val pageParams = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(
                request,
                it.message ?: "Invalid pagination",
                warnings = listOf("Customer read did not return business data")
            )
        }
        val limit = pageParams.limit
        val offset = pageParams.offset

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
        val (page, total, hasMore) = LocalReadSupport.paginate(filtered, pageParams)
        val items = page.map(CustomerAgentDtoMapper::toDto)

        return LocalReadSupport.success(
            request = request,
            data = mapOf("items" to items, "totalMatching" to filtered.size),
            warnings = warnings(),
            pagination = AgentPaginationMetadata(
                limit = limit,
                offset = offset,
                totalHint = total,
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

        val id = LocalReadSupport.parseRequiredPositiveLong(request.parameters["id"])
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
            ?: return LocalReadSupport.failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Customer not found",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("id" to id)
                ),
                metadata = LocalReadSupport.localMeta(request, warnings())
            )

        return LocalReadSupport.success(
            request = request,
            data = mapOf("item" to CustomerAgentDtoMapper.toDto(customer)),
            warnings = warnings()
        )
    }

    private fun warnings() = listOf(
        "Read from local Room via CustomerRepository; sync freshness is unknown",
        "CLOUD target is disabled for AGENT-013",
        "tzId and address are excluded from Agent API customer DTOs",
        "Non-empty query uses active-only search (matches CustomerDao.search / CustomersListScreen)"
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError
    ): AgentResponse = LocalReadSupport.failure(
        request,
        error,
        warnings = listOf("Customer read did not return business data")
    )
}
