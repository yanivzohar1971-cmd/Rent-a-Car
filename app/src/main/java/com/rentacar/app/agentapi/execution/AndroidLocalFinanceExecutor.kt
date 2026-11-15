package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.ports.FinanceReadPort
import com.rentacar.app.data.CarSaleCommissionAlignmentLogic
import com.rentacar.app.domain.CommissionCalculationService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import java.time.YearMonth

class AndroidLocalFinanceExecutor(
    private val port: FinanceReadPort,
    private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO
) {
    fun execute(request: AgentRequest, definition: AgentOperationDefinition): AgentResponse {
        LocalReadSupport.authorize(request, definition)?.let { return LocalReadSupport.failure(request, it) }
        LocalReadSupport.validateLocalOrAutoTarget(request, "finance reads")?.let {
            return LocalReadSupport.failure(request, it)
        }
        return try {
            runBlocking { withContext(ioDispatcher) { executeRead(request) } }
        } catch (_: Throwable) {
            LocalReadSupport.internalError(request, "Finance read failed")
        }
    }

    private suspend fun executeRead(request: AgentRequest): AgentResponse {
        val uid = request.auth!!.userUid!!
        return when (request.operation) {
            AgentExecutableAllowlist.COMMISSION_INSTALLMENTS_LIST,
            AgentExecutableAllowlist.COMMISSION_FILTER_PAYOUT_MONTH -> {
                val allowed = if (request.operation == AgentExecutableAllowlist.COMMISSION_INSTALLMENTS_LIST)
                    setOf("payoutMonth", "supplierId", "query", "limit", "offset")
                else setOf("payoutMonth", "supplierId", "limit", "offset")
                LocalReadSupport.rejectUnknownParams(request, allowed)?.let {
                    return LocalReadSupport.failure(request, it)
                }
                val payoutMonth = payoutMonth(request) ?: return LocalReadSupport.invalidArgument(
                    request, "payoutMonth must use YYYY-MM"
                )
                val supplierId = optionalId(request, "supplierId") ?: if (request.parameters["supplierId"] != null)
                    return LocalReadSupport.invalidArgument(request, "supplierId must be a positive integer") else null
                val page = LocalReadSupport.parsePagination(request).getOrElse {
                    return LocalReadSupport.invalidArgument(request, it.message ?: "Invalid pagination")
                }
                var items = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
                    payoutMonth, port.reservations(uid), supplierId
                )
                val query = request.parameters["query"]?.toString()?.trim().orEmpty()
                if (query.isNotEmpty()) items = items.filter {
                    it.orderId.toString().contains(query, true) || it.eventType.orEmpty().contains(query, true)
                }
                val (slice, total, more) = LocalReadSupport.paginate(items, page)
                LocalReadSupport.success(
                    request,
                    mapOf("items" to slice, "totalMatching" to total),
                    warnings(),
                    AgentPaginationMetadata(page.limit, page.offset, total, more)
                )
            }
            AgentExecutableAllowlist.COMMISSION_SUMMARY_TOTALS -> {
                LocalReadSupport.rejectUnknownParams(request, setOf("payoutMonth", "supplierId"))?.let {
                    return LocalReadSupport.failure(request, it)
                }
                val payoutMonth = payoutMonth(request) ?: return LocalReadSupport.invalidArgument(
                    request, "payoutMonth must use YYYY-MM"
                )
                val supplierId = optionalId(request, "supplierId") ?: if (request.parameters["supplierId"] != null)
                    return LocalReadSupport.invalidArgument(request, "supplierId must be a positive integer") else null
                val installments = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
                    payoutMonth, port.reservations(uid), supplierId
                )
                LocalReadSupport.success(
                    request,
                    mapOf(
                        "totalCommission" to CommissionCalculationService.getTotalCommission(installments),
                        "distinctReservationCount" to installments.map { it.orderId }.distinct().size
                    ),
                    warnings()
                )
            }
            AgentExecutableAllowlist.COMMISSION_ALIGNMENT_PREVIEW -> {
                LocalReadSupport.rejectUnknownParams(request, emptySet())?.let {
                    return LocalReadSupport.failure(request, it)
                }
                val (sales, paid) = port.salesWithPaidTotals(uid)
                val preview = CarSaleCommissionAlignmentLogic.buildPreview(sales.map {
                    CarSaleCommissionAlignmentLogic.SaleAlignmentInput(
                        it.id, it.commissionPrice, paid[it.id] ?: 0.0, it.saleDate
                    )
                })
                LocalReadSupport.success(request, mapOf("preview" to preview), warnings())
            }
            else -> unsupported(request)
        }
    }

    private fun payoutMonth(request: AgentRequest): String? {
        val value = request.parameters["payoutMonth"]?.toString() ?: return null
        return runCatching { YearMonth.parse(value) }.getOrNull()?.toString()
    }

    private fun optionalId(request: AgentRequest, name: String) =
        LocalReadSupport.parseOptionalPositiveLong(request.parameters[name])

    private fun warnings() = listOf("Read from local Room; sync freshness is unknown")

    private fun unsupported(request: AgentRequest) = LocalReadSupport.failure(
        request,
        AgentError(
            AgentErrorCode.UNSUPPORTED_OPERATION,
            "Finance executor does not support '${request.operation}'",
            request.requestId,
            request.correlationId
        )
    )
}
