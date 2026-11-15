package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.dto.ReservationAgentDtoMapper
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
import com.rentacar.app.agentapi.reservation.ReservationReadPort
import com.rentacar.app.data.Reservation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

/**
 * AGENT-012: Android local read executor for reservation.list.manage / reservation.get.
 * Uses existing [ReservationReadPort] (backed by [com.rentacar.app.data.ReservationRepository]).
 */
class AndroidLocalReservationReadExecutor(
    private val reservationReadPort: ReservationReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    companion object {
        private const val TAG = "AgentReservationRead"
        const val DEFAULT_LIMIT: Int = 50
        const val MAX_LIMIT: Int = 200

        /** Catalog-declared parameters only; UI-only filters are rejected if sent. */
        private val LIST_ALLOWED_PARAMS = setOf("query", "limit", "offset")
        private val GET_ALLOWED_PARAMS = setOf("id")

        /**
         * Unsupported manage-screen filters that are intentionally not in the AGENT-001
         * catalog schema for reservation.list.manage. Reject explicitly if a client sends them.
         */
        private val UNSUPPORTED_LIST_FILTERS = setOf(
            "status",
            "supplierId",
            "customerId",
            "agentId",
            "branchId",
            "dateFrom",
            "dateTo",
            "fromDate",
            "toDate",
            "cancelledFilter",
            "isClosed",
            "isQuote",
            "supplierOrderNumber",
            "externalContractNumber",
            "reservationNumber"
        )
    }

    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        val authError = authorize(request, definition)
        if (authError != null) return failure(request, authError)

        val targetError = validateTarget(request)
        if (targetError != null) return failure(request, targetError)

        return try {
            when (request.operation) {
                AgentExecutableAllowlist.RESERVATION_LIST_MANAGE -> runBlocking {
                    withContext(ioDispatcher) { listReservations(request) }
                }
                AgentExecutableAllowlist.RESERVATION_GET -> runBlocking {
                    withContext(ioDispatcher) { getReservation(request) }
                }
                else -> failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.UNSUPPORTED_OPERATION,
                        message = "Local reservation executor does not support '${request.operation}'",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    )
                )
            }
        } catch (t: Throwable) {
            System.err.println("$TAG: Reservation read failed for ${request.operation}: ${t.javaClass.simpleName}")
            failure(
                request,
                AgentError(
                    code = AgentErrorCode.INTERNAL_ERROR,
                    message = "Reservation read failed",
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
                message = "Authenticated userUid is required for local reservation reads",
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
                message = "CLOUD execution is disabled for AGENT-012 reservation reads",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("target" to request.target.name)
            )
        }
    }

    private suspend fun listReservations(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!

        val unsupported = request.parameters.keys.filter { key ->
            key in UNSUPPORTED_LIST_FILTERS || (key !in LIST_ALLOWED_PARAMS)
        }
        if (unsupported.isNotEmpty()) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Unsupported filter(s) for reservation.list.manage: ${unsupported.sorted().joinToString()}",
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

        // DAO orders by dateFrom DESC; add id DESC secondary for stable pagination.
        val all = reservationReadPort.listForUser(userUid)
            .sortedWith(compareByDescending<Reservation> { it.dateFrom }.thenByDescending { it.id })
        val filtered = if (query.isEmpty()) {
            all
        } else {
            all.filter { matchesQuery(it, query) }
        }
        val page = filtered.drop(offset).take(limit)
        val items = page.map(ReservationAgentDtoMapper::toDto)
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

    private suspend fun getReservation(request: AgentRequest): AgentResponse {
        val userUid = request.auth!!.userUid!!

        val unknownKeys = request.parameters.keys.filter { it !in GET_ALLOWED_PARAMS }
        if (unknownKeys.isNotEmpty()) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Unsupported parameter(s) for reservation.get: ${unknownKeys.sorted().joinToString()}",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("unsupported" to unknownKeys.sorted())
                )
            )
        }

        // Do not accept supplierOrderNumber / externalContractNumber as internal id.
        if (request.parameters.containsKey("supplierOrderNumber") ||
            request.parameters.containsKey("externalContractNumber")
        ) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "reservation.get requires internal Room id; supplier/external identifiers are not accepted",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )
        }

        val id = parseRequiredId(request.parameters["id"])
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.INVALID_ARGUMENT,
                    message = "Parameter 'id' must be a positive integer (internal reservation id)",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        val reservation = reservationReadPort.getByIdForUser(id, userUid)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Reservation not found",
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
            data = mapOf("item" to ReservationAgentDtoMapper.toDto(reservation)),
            metadata = localMeta(request),
            error = null
        )
    }

    /**
     * Catalog `query` filter over reservation-local fields only.
     * Matches manage-screen text search for order id / supplier order / contract /
     * status / car type. Customer name/phone and supplier name require customer/
     * supplier joins and are documented as a known AGENT-012 limitation.
     */
    private fun matchesQuery(reservation: Reservation, rawQuery: String): Boolean {
        val q = rawQuery.lowercase()
        return reservation.id.toString().contains(q) ||
            (reservation.supplierOrderNumber?.lowercase()?.contains(q) == true) ||
            (reservation.externalContractNumber?.lowercase()?.contains(q) == true) ||
            reservation.status.name.lowercase().contains(q) ||
            (reservation.carTypeName?.lowercase()?.contains(q) == true)
    }

    private fun localMeta(request: AgentRequest) = AgentResponseMetadata(
        source = AgentDataSource.LOCAL,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = AgentResultCompleteness.UNKNOWN,
        lastSuccessfulSyncEpochMs = null,
        warnings = listOf(
            "Read from local Room via ReservationRepository; sync freshness is unknown",
            "CLOUD target is disabled for AGENT-012",
            "query matches reservation-local fields only (id, supplierOrderNumber, externalContractNumber, status, carTypeName)"
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
            warnings = listOf("Reservation read did not return business data"),
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
