package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.dto.toAgentDto
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.SalesReadPort
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.CarSaleCommissionPaymentLogic
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

class AndroidLocalSalesExecutor(
    private val port: SalesReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "sales reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        return try {
            runBlocking { withContext(ioDispatcher) { read(request) } }
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Sales read failed")
        }
    }

    private suspend fun read(request: AgentRequest): AgentResponse {
        val uid = request.auth!!.userUid!!
        return when (request.operation) {
            AgentExecutableAllowlist.CAR_SALE_LIST -> {
                LocalReadSupport.rejectUnknownParams(
                    request, setOf("query", "commissionFilter", "limit", "offset")
                )?.let { return LocalReadSupport.failure(request, it) }
                val page = page(request) ?: return LocalReadSupport.invalidArgument(request, "Invalid pagination")
                val (sales, paid) = port.salesWithPaidTotals(uid)
                val filtered = filterSales(request, sales, paid)
                    ?: return LocalReadSupport.invalidArgument(request, "commissionFilter must be ALL, OPEN, or CLOSED")
                val (slice, total, more) = LocalReadSupport.paginate(filtered, page)
                LocalReadSupport.success(
                    request,
                    mapOf("items" to slice.map { it.toAgentDto(paid[it.id] ?: 0.0) }, "totalMatching" to total),
                    warnings(),
                    AgentPaginationMetadata(page.limit, page.offset, total, more)
                )
            }
            AgentExecutableAllowlist.CAR_SALE_COMMISSION_TOTALS -> {
                LocalReadSupport.rejectUnknownParams(request, setOf("query", "commissionFilter"))?.let {
                    return LocalReadSupport.failure(request, it)
                }
                val (sales, paid) = port.salesWithPaidTotals(uid)
                val filtered = filterSales(request, sales, paid)
                    ?: return LocalReadSupport.invalidArgument(request, "commissionFilter must be ALL, OPEN, or CLOSED")
                LocalReadSupport.success(
                    request,
                    mapOf(
                        "count" to filtered.size,
                        "sumCommissionPrice" to filtered.sumOf { it.commissionPrice },
                        "sumPaid" to filtered.sumOf { paid[it.id] ?: 0.0 },
                        "sumRemaining" to filtered.sumOf {
                            CarSaleCommissionPaymentLogic.remaining(it.commissionPrice, paid[it.id] ?: 0.0)
                        },
                        // AGENT-131: car-sale commission payments are persisted (carSaleCommissionPayments),
                        // so the remaining balance is a tracked receivable, unlike calculated rental commission.
                        "financialLabel" to "PAYMENT_TRACKED_BALANCE",
                        "paymentStatusTracked" to true
                    ),
                    warnings()
                )
            }
            AgentExecutableAllowlist.REQUEST_LIST -> {
                LocalReadSupport.rejectUnknownParams(request, setOf("query", "limit", "offset"))?.let {
                    return LocalReadSupport.failure(request, it)
                }
                val page = page(request) ?: return LocalReadSupport.invalidArgument(request, "Invalid pagination")
                val query = request.parameters["query"]?.toString()?.trim().orEmpty()
                val rows = port.requests(uid).filter {
                    query.isEmpty() || listOf(it.firstName, it.lastName, it.phone, it.carTypeName)
                        .any { value -> value.contains(query, true) }
                }
                val (slice, total, more) = LocalReadSupport.paginate(rows, page)
                LocalReadSupport.success(
                    request,
                    mapOf("items" to slice.map { it.toAgentDto() }, "totalMatching" to total),
                    warnings(),
                    AgentPaginationMetadata(page.limit, page.offset, total, more)
                )
            }
            else -> LocalReadSupport.invalidArgument(request, "Unsupported sales operation")
        }
    }

    private fun filterSales(
        request: AgentRequest,
        sales: List<CarSale>,
        paid: Map<Long, Double>
    ): List<CarSale>? {
        val filter = runCatching {
            CarSaleCommissionPaymentLogic.CommissionCollectionFilter.valueOf(
                request.parameters["commissionFilter"]?.toString()?.uppercase() ?: "ALL"
            )
        }.getOrNull() ?: return null
        val query = request.parameters["query"]?.toString()?.trim().orEmpty()
        return sales.filter {
            (query.isEmpty() || listOf(it.firstName, it.lastName, it.phone, it.carTypeName)
                .any { value -> value.contains(query, true) }) &&
                CarSaleCommissionPaymentLogic.matchesCommissionFilter(
                    filter, it.commissionPrice, paid[it.id] ?: 0.0
                )
        }
    }

    private fun page(request: AgentRequest) = LocalReadSupport.parsePagination(request).getOrNull()
    private fun warnings() = listOf("Read from local Room; sync freshness is unknown")
}
