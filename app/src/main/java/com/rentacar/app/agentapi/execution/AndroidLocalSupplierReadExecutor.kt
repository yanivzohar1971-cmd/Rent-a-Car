package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.dto.SupplierAgentDtoMapper
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
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
        const val DEFAULT_LIMIT: Int = LocalReadSupport.DEFAULT_LIMIT
        const val MAX_LIMIT: Int = LocalReadSupport.MAX_LIMIT
    }

    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        val authError = LocalReadSupport.authorize(request, definition, "supplier")
        if (authError != null) return failure(request, authError)

        val targetError = LocalReadSupport.validateLocalOrAutoTarget(
            request,
            "AGENT-010 supplier reads"
        )
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
        val pageParams = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(
                request,
                it.message ?: "Invalid pagination",
                warnings = listOf("Supplier read did not return business data")
            )
        }
        val limit = pageParams.limit
        val offset = pageParams.offset

        // DAO already orders by name; keep deterministic secondary sort by id.
        val all = supplierReadPort.listForUser(userUid)
            .sortedWith(compareBy({ it.name.lowercase() }, { it.id }))
        val filtered = if (query.isEmpty()) {
            all
        } else {
            all.filter { it.name.contains(query, ignoreCase = true) }
        }
        val (page, total, hasMore) = LocalReadSupport.paginate(filtered, pageParams)
        val items = page.map(SupplierAgentDtoMapper::toDto)

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

    private suspend fun getSupplier(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!
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

        val supplier = supplierReadPort.getByIdForUser(id, userUid)
            ?: return LocalReadSupport.failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Supplier not found",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("id" to id)
                ),
                metadata = LocalReadSupport.localMeta(request, warnings())
            )

        return LocalReadSupport.success(
            request = request,
            data = mapOf("item" to SupplierAgentDtoMapper.toDto(supplier)),
            warnings = warnings()
        )
    }

    private fun warnings() = listOf(
        "Read from local Room via SupplierRepository; sync freshness is unknown",
        "CLOUD target is disabled for AGENT-010"
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError
    ): AgentResponse = LocalReadSupport.failure(
        request,
        error,
        warnings = listOf("Supplier read did not return business data")
    )
}

/** Trusted test/app boundary helper: authenticated local context. */
fun agentLocalAuth(userUid: String): AgentAuthContext = AgentAuthContext(
    userUid = userUid,
    permissions = listOf("AUTHENTICATED")
)
