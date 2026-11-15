package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.dto.ReservationAgentDtoMapper
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
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
        const val DEFAULT_LIMIT: Int = LocalReadSupport.DEFAULT_LIMIT
        const val MAX_LIMIT: Int = LocalReadSupport.MAX_LIMIT

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
        val authError = LocalReadSupport.authorize(request, definition, "reservation")
        if (authError != null) return failure(request, authError)

        val targetError = LocalReadSupport.validateLocalOrAutoTarget(
            request,
            "AGENT-012 reservation reads"
        )
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
        val pageParams = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(
                request,
                it.message ?: "Invalid pagination",
                warnings = listOf("Reservation read did not return business data")
            )
        }
        val limit = pageParams.limit
        val offset = pageParams.offset

        // DAO orders by dateFrom DESC; add id DESC secondary for stable pagination.
        val all = reservationReadPort.listForUser(userUid)
            .sortedWith(compareByDescending<Reservation> { it.dateFrom }.thenByDescending { it.id })
        val filtered = if (query.isEmpty()) {
            all
        } else {
            all.filter { matchesQuery(it, query) }
        }
        val (page, total, hasMore) = LocalReadSupport.paginate(filtered, pageParams)
        val items = page.map(ReservationAgentDtoMapper::toDto)

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

        val id = LocalReadSupport.parseRequiredPositiveLong(request.parameters["id"])
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
            ?: return LocalReadSupport.failure(
                request,
                AgentError(
                    code = AgentErrorCode.NOT_FOUND,
                    message = "Reservation not found",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("id" to id)
                ),
                metadata = LocalReadSupport.localMeta(request, warnings())
            )

        return LocalReadSupport.success(
            request = request,
            data = mapOf("item" to ReservationAgentDtoMapper.toDto(reservation)),
            warnings = warnings()
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

    private fun warnings() = listOf(
        "Read from local Room via ReservationRepository; sync freshness is unknown",
        "CLOUD target is disabled for AGENT-012",
        "query matches reservation-local fields only (id, supplierOrderNumber, externalContractNumber, status, carTypeName)"
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError
    ): AgentResponse = LocalReadSupport.failure(
        request,
        error,
        warnings = listOf("Reservation read did not return business data")
    )
}
