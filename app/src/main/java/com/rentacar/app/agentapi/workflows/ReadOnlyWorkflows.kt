package com.rentacar.app.agentapi.workflows

import com.rentacar.app.agentapi.dto.CustomerAgentDto
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import java.time.YearMonth

/**
 * customer.list (search) -> reservation.list.byCustomer for each match (bounded).
 *
 * Parameters: `query` (required, non-blank), `maxCustomers` (optional, 1..[MAX_CUSTOMERS]).
 * Returns every matching customer with its reservations so the caller can disambiguate; it
 * never picks a customer on the caller's behalf.
 */
class FindCustomerAndListReservationsWorkflow : AgentWorkflow {
    override val workflowId: String = ID
    override val description: String = "Find customers by text and list each match's reservations (read-only)"
    override val allowedOperations: Set<String> = setOf(
        AgentExecutableAllowlist.CUSTOMER_LIST,
        AgentExecutableAllowlist.RESERVATION_LIST_BY_CUSTOMER
    )
    override val allowedParameters: Set<String> = setOf("query", "maxCustomers")

    override fun run(context: WorkflowContext, parameters: Map<String, Any?>): WorkflowResult {
        val query = (parameters["query"] as? String)?.trim().orEmpty()
        if (query.isEmpty()) return invalid("query is required")
        val maxCustomers = when (val raw = parameters["maxCustomers"]) {
            null -> DEFAULT_MAX_CUSTOMERS
            is Number -> raw.toInt()
            else -> return invalid("maxCustomers must be an integer")
        }
        if (maxCustomers !in 1..MAX_CUSTOMERS) return invalid("maxCustomers must be between 1 and $MAX_CUSTOMERS")

        val customersResponse = context.call(
            AgentExecutableAllowlist.CUSTOMER_LIST,
            mapOf("query" to query, "limit" to maxCustomers)
        )
        if (!customersResponse.success) return context.failure(customersResponse)

        val customersData = customersResponse.data as? Map<*, *>
        val customers = (customersData?.get("items") as? List<*>).orEmpty()
        val totalMatching = (customersData?.get("totalMatching") as? Number)?.toInt() ?: customers.size

        val matches = customers.map { item ->
            val customerId = customerIdOf(item)
                ?: return context.failure(customersResponse.copy(
                    success = false,
                    error = AgentError(AgentErrorCode.INTERNAL_ERROR, "Customer row without id")
                ))
            val reservationsResponse = context.call(
                AgentExecutableAllowlist.RESERVATION_LIST_BY_CUSTOMER,
                mapOf("customerId" to customerId)
            )
            if (!reservationsResponse.success) return context.failure(reservationsResponse)
            val reservations = ((reservationsResponse.data as? Map<*, *>)?.get("items") as? List<*>).orEmpty()
            mapOf("customer" to item, "reservations" to reservations, "reservationCount" to reservations.size)
        }

        val warnings = buildList {
            if (matches.isEmpty()) add("No customer matched the query")
            if (matches.size > 1) add("Multiple customers matched; results are grouped per customer, none was selected")
            if (totalMatching > matches.size) add("Only the first ${matches.size} of $totalMatching matching customers were expanded")
        }
        return WorkflowResult(
            workflowId = workflowId,
            success = true,
            data = mapOf(
                "matches" to matches,
                "customerCount" to matches.size,
                "totalMatchingCustomers" to totalMatching
            ),
            steps = context.steps,
            warnings = warnings
        )
    }

    private fun customerIdOf(item: Any?): Long? = when (item) {
        is CustomerAgentDto -> item.id
        is Map<*, *> -> (item["id"] as? Number)?.toLong()
        else -> null
    }

    private fun invalid(message: String) = WorkflowResult(
        workflowId = workflowId,
        success = false,
        error = AgentError(AgentErrorCode.INVALID_ARGUMENT, message)
    )

    companion object {
        const val ID = "workflow.findCustomerAndListReservations"
        const val DEFAULT_MAX_CUSTOMERS = 5
        const val MAX_CUSTOMERS = 10
    }
}

/**
 * commission.summary.totals (reservation commission for a payout month) +
 * carSale.commission.totals (car-sale commission still open).
 *
 * Parameters: `payoutMonth` (required, YYYY-MM), `supplierId` (optional, reservations only).
 *
 * The two figures stay separate on purpose: reservation commissions have no payment tracking
 * in the read model, so only car-sale commissions have a real "remaining/unpaid" amount.
 */
class UnpaidCommissionSummaryWorkflow : AgentWorkflow {
    override val workflowId: String = ID
    override val description: String =
        "Reservation commission total for a payout month plus open car-sale commission remaining (read-only)"
    override val allowedOperations: Set<String> = setOf(
        AgentExecutableAllowlist.COMMISSION_SUMMARY_TOTALS,
        AgentExecutableAllowlist.CAR_SALE_COMMISSION_TOTALS
    )
    override val allowedParameters: Set<String> = setOf("payoutMonth", "supplierId")

    override fun run(context: WorkflowContext, parameters: Map<String, Any?>): WorkflowResult {
        val payoutMonth = (parameters["payoutMonth"] as? String)?.trim().orEmpty()
        if (runCatching { YearMonth.parse(payoutMonth) }.isFailure) return invalid("payoutMonth must use YYYY-MM")

        val reservationParams = buildMap<String, Any?> {
            put("payoutMonth", payoutMonth)
            parameters["supplierId"]?.let { put("supplierId", it) }
        }
        val reservationTotals = context.call(AgentExecutableAllowlist.COMMISSION_SUMMARY_TOTALS, reservationParams)
        if (!reservationTotals.success) return context.failure(reservationTotals)

        val carSaleTotals = context.call(
            AgentExecutableAllowlist.CAR_SALE_COMMISSION_TOTALS,
            mapOf("commissionFilter" to "OPEN")
        )
        if (!carSaleTotals.success) return context.failure(carSaleTotals)

        val reservationData = reservationTotals.data as? Map<*, *>
        val carSaleData = carSaleTotals.data as? Map<*, *>
        return WorkflowResult(
            workflowId = workflowId,
            success = true,
            data = mapOf(
                "payoutMonth" to payoutMonth,
                "reservationCommission" to mapOf(
                    "totalCommission" to reservationData?.get("totalCommission"),
                    "distinctReservationCount" to reservationData?.get("distinctReservationCount")
                ),
                "carSaleCommissionOpen" to mapOf(
                    "count" to carSaleData?.get("count"),
                    "sumCommissionPrice" to carSaleData?.get("sumCommissionPrice"),
                    "sumPaid" to carSaleData?.get("sumPaid"),
                    "sumRemaining" to carSaleData?.get("sumRemaining")
                )
            ),
            steps = context.steps,
            warnings = listOf(
                "Reservation commission is the total for the payout month; reservations have no paid/unpaid tracking here",
                "Car-sale figures cover all open (not fully paid) car sales, not only the payout month"
            )
        )
    }

    private fun invalid(message: String) = WorkflowResult(
        workflowId = workflowId,
        success = false,
        error = AgentError(AgentErrorCode.INVALID_ARGUMENT, message)
    )

    companion object {
        const val ID = "workflow.unpaidCommissionSummary"
    }
}
