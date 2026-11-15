package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.dto.CustomerAgentDtoMapper
import com.rentacar.app.agentapi.dto.ReservationAgentDtoMapper
import com.rentacar.app.agentapi.dto.SupplierAgentDtoMapper
import com.rentacar.app.agentapi.dto.toAgentDto
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.CatalogAndReservationExtReadPort
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class AndroidLocalCatalogAndReservationExtExecutor(
    private val port: CatalogAndReservationExtReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "catalog and reservation reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        return try {
            runBlocking { withContext(ioDispatcher) { read(request) } }
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Catalog or reservation read failed")
        }
    }

    private suspend fun read(request: AgentRequest): AgentResponse {
        val uid = request.auth!!.userUid!!
        return when (request.operation) {
            AgentExecutableAllowlist.AGENT_LIST -> {
                noParams(request)?.let { return it }
                ok(request, port.agents(uid).map { it.toAgentDto() })
            }
            AgentExecutableAllowlist.BRANCH_LIST -> {
                reject(request, setOf("supplierId", "query", "limit", "offset"))?.let { return it }
                val supplierId = optionalId(request, "supplierId") ?: if (request.parameters["supplierId"] != null)
                    return LocalReadSupport.invalidArgument(request, "supplierId must be positive") else null
                val query = query(request)
                paged(request, port.branches(uid, supplierId).filter {
                    query.isEmpty() || listOfNotNull(it.name, it.address, it.city, it.street, it.phone)
                        .any { value -> value.contains(query, true) }
                }.map { it.toAgentDto() })
            }
            AgentExecutableAllowlist.SUPPLIER_PICK -> {
                reject(request, setOf("query", "limit", "offset"))?.let { return it }
                val query = query(request)
                paged(request, port.suppliers(uid).filter {
                    query.isEmpty() || listOfNotNull(it.name, it.phone, it.email, it.address)
                        .any { value -> value.contains(query, true) }
                }.map(SupplierAgentDtoMapper::toDto))
            }
            AgentExecutableAllowlist.PRICE_LIST_LIST -> {
                reject(request, setOf("supplierId", "query", "limit", "offset"))?.let { return it }
                val supplierId = optionalId(request, "supplierId") ?: if (request.parameters["supplierId"] != null)
                    return LocalReadSupport.invalidArgument(request, "supplierId must be positive") else null
                val query = query(request)
                paged(request, port.priceLists(uid, supplierId).filter {
                    query.isEmpty() || listOf(it.year.toString(), it.month.toString(), it.sourceFileName.orEmpty())
                        .any { value -> value.contains(query, true) }
                }.map { it.toAgentDto() })
            }
            AgentExecutableAllowlist.RESERVATION_LIST_BY_CUSTOMER,
            AgentExecutableAllowlist.CUSTOMER_HISTORY_RESERVATIONS -> reservationById(
                request, "customerId"
            ) { port.reservationsByCustomer(uid, it) }
            AgentExecutableAllowlist.RESERVATION_LIST_BY_SUPPLIER -> reservationById(
                request, "supplierId"
            ) { port.reservationsBySupplier(uid, it) }
            AgentExecutableAllowlist.RESERVATION_LIST_BY_AGENT -> reservationById(
                request, "agentId"
            ) { port.reservationsByAgent(uid, it) }
            AgentExecutableAllowlist.RESERVATION_LIST_BY_BRANCH -> reservationById(
                request, "branchId"
            ) { port.reservationsByBranch(uid, it) }
            AgentExecutableAllowlist.RESERVATION_PAYMENT_LIST -> {
                reject(request, setOf("reservationId", "limit", "offset"))?.let { return it }
                val id = requiredId(request, "reservationId") ?: return invalidId(request, "reservationId")
                paged(request, port.payments(uid, id).map { it.toAgentDto() })
            }
            AgentExecutableAllowlist.RESERVATION_FILTER_DATE_RANGE -> {
                reject(request, setOf("fromEpochMs", "toEpochMs", "query", "limit", "offset"))?.let { return it }
                val from = long(request.parameters["fromEpochMs"]) ?: Long.MIN_VALUE
                val to = long(request.parameters["toEpochMs"]) ?: Long.MAX_VALUE
                if (from > to) return LocalReadSupport.invalidArgument(request, "fromEpochMs must be <= toEpochMs")
                reservationsPage(request, port.reservations(uid).filter { it.createdAt in from..to })
            }
            AgentExecutableAllowlist.RESERVATION_FILTER_SUPPLIER -> {
                reject(request, setOf("supplierId", "query", "limit", "offset"))?.let { return it }
                val id = requiredId(request, "supplierId") ?: return invalidId(request, "supplierId")
                reservationsPage(request, port.reservationsBySupplier(uid, id))
            }
            AgentExecutableAllowlist.RESERVATION_FILTER_STATUS -> {
                reject(request, setOf("status", "query", "limit", "offset"))?.let { return it }
                val status = ReservationStatus.entries.firstOrNull {
                    it.name.equals(request.parameters["status"]?.toString(), true)
                } ?: return LocalReadSupport.invalidArgument(request, "Unknown reservation status")
                reservationsPage(request, port.reservations(uid).filter { it.status == status })
            }
            AgentExecutableAllowlist.DASHBOARD_OPEN_RESERVATIONS -> {
                noParams(request)?.let { return it }
                ok(request, port.openReservations(uid).map(ReservationAgentDtoMapper::toDto))
            }
            AgentExecutableAllowlist.CUSTOMER_DETAILS_VIEW -> {
                reject(request, setOf("id"))?.let { return it }
                val id = requiredId(request, "id") ?: return invalidId(request, "id")
                val customer = port.customer(uid, id)
                    ?: return LocalReadSupport.notFound(request, "Customer not found", mapOf("id" to id))
                LocalReadSupport.success(
                    request, mapOf("item" to CustomerAgentDtoMapper.toDto(customer)), warnings()
                )
            }
            else -> LocalReadSupport.invalidArgument(request, "Unsupported extended read operation")
        }
    }

    private suspend fun reservationById(
        request: AgentRequest,
        field: String,
        load: suspend (Long) -> List<Reservation>
    ): AgentResponse {
        reject(request, setOf(field, "limit", "offset"))?.let { return it }
        val id = requiredId(request, field) ?: return invalidId(request, field)
        return reservationsPage(request, load(id))
    }

    private fun reservationsPage(request: AgentRequest, rows: List<Reservation>): AgentResponse {
        val q = query(request)
        val filtered = rows.filter {
            q.isEmpty() || listOf(
                it.id.toString(), it.supplierOrderNumber.orEmpty(),
                it.externalContractNumber.orEmpty(), it.carTypeName.orEmpty(), it.status.name
            ).any { value -> value.contains(q, true) }
        }
        return paged(request, filtered.map(ReservationAgentDtoMapper::toDto))
    }

    private fun <T> paged(request: AgentRequest, rows: List<T>): AgentResponse {
        val page = LocalReadSupport.parsePagination(request).getOrElse {
            return LocalReadSupport.invalidArgument(request, it.message ?: "Invalid pagination")
        }
        val (items, total, more) = LocalReadSupport.paginate(rows, page)
        return LocalReadSupport.success(
            request, mapOf("items" to items, "totalMatching" to total), warnings(),
            AgentPaginationMetadata(page.limit, page.offset, total, more)
        )
    }

    private fun <T> ok(request: AgentRequest, rows: List<T>) =
        LocalReadSupport.success(request, mapOf("items" to rows, "totalMatching" to rows.size), warnings())
    private fun noParams(request: AgentRequest) = reject(request, emptySet())
    private fun reject(request: AgentRequest, allowed: Set<String>) =
        LocalReadSupport.rejectUnknownParams(request, allowed)?.let { LocalReadSupport.failure(request, it) }
    private fun requiredId(request: AgentRequest, field: String) =
        LocalReadSupport.parseRequiredPositiveLong(request.parameters[field], field)
    private fun optionalId(request: AgentRequest, field: String) =
        LocalReadSupport.parseOptionalPositiveLong(request.parameters[field])
    private fun invalidId(request: AgentRequest, field: String) =
        LocalReadSupport.invalidArgument(request, "$field must be a positive integer")
    private fun query(request: AgentRequest) = request.parameters["query"]?.toString()?.trim().orEmpty()
    private fun long(raw: Any?): Long? = when (raw) {
        null -> null
        is Number -> raw.toLong()
        is String -> raw.toLongOrNull()
        else -> null
    }
    private fun warnings() = listOf("Read from local Room; sync freshness is unknown")
}
