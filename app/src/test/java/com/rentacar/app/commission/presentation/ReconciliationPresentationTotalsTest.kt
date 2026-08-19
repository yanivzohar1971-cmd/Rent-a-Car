package com.rentacar.app.commission.presentation

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconciliationPresentationTotalsTest {

    @Test
    fun totalsSeparateMatchedFromApplicationOnly() {
        val matched = item(
            id = 1,
            key = "m",
            status = ReconciliationMatchStatus.AMOUNT_MISMATCH,
            supplier = "5772.10586",
            internal = "225.22746071133176"
        )
        val historical = item(
            id = 2,
            key = "h",
            status = ReconciliationMatchStatus.APPLICATION_ONLY,
            lifecycle = CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE,
            supplier = null,
            internal = "49084.61"
        )
        val supplierOnly = item(
            id = 3,
            key = "s",
            status = ReconciliationMatchStatus.SUPPLIER_ONLY,
            supplier = "15",
            internal = null
        )
        val presentations = CommissionComparisonMapper.buildPresentations(
            listOf(matched, historical, supplierOnly)
        )
        val totals = CommissionComparisonMapper.computeTotals(presentations)
        assertEquals(MoneyDecimal.of("5787.10586"), totals.supplierTotal)
        assertEquals(MoneyDecimal.of("225.22746071133176"), totals.matchedApplicationTotal)
        assertEquals(MoneyDecimal.of("49084.61"), totals.applicationOnlyTotal)
        assertEquals(MoneyDecimal.of("49084.61"), totals.historicalApplicationTotal)
        assertEquals(
            totals.matchedApplicationTotal.plus(totals.applicationOnlyTotal),
            totals.combinedApplicationTotal
        )
        assertEquals(
            totals.supplierTotal.minus(totals.matchedApplicationTotal),
            totals.matchedDifference
        )
        assertNotEquals(totals.matchedApplicationTotal, totals.combinedApplicationTotal)
        assertEquals(totals.matchedDifference, totals.netSignedDifference)
    }

    @Test
    fun displayFormattingDoesNotChangeExactTotals() {
        val exact = MoneyDecimal.of("225.22746071133176")
        val presentations = CommissionComparisonMapper.buildPresentations(
            listOf(
                item(
                    1, "m", ReconciliationMatchStatus.AMOUNT_MISMATCH,
                    supplier = "231",
                    internal = exact.toExactString()
                )
            )
        )
        val totals = CommissionComparisonMapper.computeTotals(presentations)
        assertEquals(exact.toExactString(), totals.matchedApplicationTotal.toExactString())
        val displayed = FinancialDisplayFormatter.formatMoney(totals.matchedApplicationTotal)
        assertTrue(displayed.contains("225"))
    }

    private fun item(
        id: Long,
        key: String,
        status: ReconciliationMatchStatus,
        supplier: String?,
        internal: String?,
        lifecycle: CommissionLifecycleClassification = CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT
    ) = CommissionReconciliationItem(
        id = id,
        importId = 1,
        supplierId = 5,
        normalizedGroupKey = key,
        reservationId = if (status == ReconciliationMatchStatus.SUPPLIER_ONLY) null else id,
        internalEventId = internal?.let { "e$id" },
        supplierOrderNumber = if (status == ReconciliationMatchStatus.APPLICATION_ONLY) null else "$id",
        supplierInvoiceNumber = "i$id",
        supplierCustomerName = null,
        supplierDays = 5,
        supplierRevenue = "100",
        supplierPercent = "15",
        supplierCommission = supplier,
        internalPeriodStart = null,
        internalPeriodEnd = null,
        internalDays = 5,
        internalPercent = "15",
        internalCommission = internal,
        deviation = null,
        matchStatus = status.name,
        lifecycleClassification = lifecycle.name,
        proposedActualReturnDate = null,
        approvalState = "PENDING",
        appSupplierOrderNumber = if (status == ReconciliationMatchStatus.APPLICATION_ONLY) "3016163" else "$id",
        userUid = "uid"
    )
}
