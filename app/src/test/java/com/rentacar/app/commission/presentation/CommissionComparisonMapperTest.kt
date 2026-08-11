package com.rentacar.app.commission.presentation

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.ui.vm.CommissionReconFilter
import com.rentacar.app.ui.vm.filterPresentations
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class CommissionComparisonMapperTest {

    @Test
    fun underpaid_supplier80_application100() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(comparableItem(supplier = "80", internal = "100"))
        )
        assertEquals(PaymentDifferenceDirection.UNDERPAID, p.direction)
        assertEquals(MoneyDecimal.of("20"), p.absoluteDifference)
        assertEquals("שולם בחסר", p.directionTitleHebrew)
        assertEquals(MoneyDecimal.of("100"), p.internalCurrentPayableAmount)
    }

    @Test
    fun overpaid_supplier120_application100() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(comparableItem(supplier = "120", internal = "100"))
        )
        assertEquals(PaymentDifferenceDirection.OVERPAID, p.direction)
        assertEquals(MoneyDecimal.of("20"), p.absoluteDifference)
        assertEquals("שולם ביתר", p.directionTitleHebrew)
    }

    @Test
    fun withinTolerance_isMatch() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(comparableItem(supplier = "100.00", internal = "100.01"))
        )
        assertEquals(PaymentDifferenceDirection.MATCH, p.direction)
    }

    @Test
    fun supplierOnly_isNotComparable_notOverpaid() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(
                comparableItem(supplier = "50", internal = null).copy(
                    matchStatus = ReconciliationMatchStatus.SUPPLIER_ONLY.name,
                    reservationId = null,
                    internalEventId = null,
                    internalCommission = null
                )
            )
        )
        assertEquals(PaymentDifferenceDirection.NOT_COMPARABLE, p.direction)
        assertEquals("תשלום ספק ללא התאמה", p.directionTitleHebrew)
    }

    @Test
    fun applicationOnly_isNotComparable_notUnderpaid() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(
                comparableItem(supplier = null, internal = "90").copy(
                    matchStatus = ReconciliationMatchStatus.APPLICATION_ONLY.name,
                    supplierCommission = null,
                    supplierOrderNumber = null
                )
            )
        )
        assertEquals(PaymentDifferenceDirection.NOT_COMPARABLE, p.direction)
        assertTrue(p.directionTitleHebrew.contains("לא הופיע"))
        assertFalse(p.direction == PaymentDifferenceDirection.UNDERPAID)
    }

    @Test
    fun multiEvent_usesSumAsCurrentPayable_notSingleEvent() {
        val siblings = listOf(
            comparableItem(
                id = 1,
                supplier = "210.71",
                internal = "164.97",
                eventId = "e1",
                eventType = "MONTHLY_CYCLE",
                days = 30
            ),
            comparableItem(
                id = 2,
                supplier = "210.71",
                internal = "71.48",
                eventId = "e2",
                eventType = "FINAL_REMAINDER",
                days = 13
            )
        ).map {
            it.copy(
                normalizedGroupKey = "24288",
                supplierOrderNumber = "24288",
                matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name,
                lifecycleClassification = CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name
            )
        }
        val p = CommissionComparisonMapper.buildPresentation(siblings)
        assertEquals(MoneyDecimal.of("210.71"), p.supplierReportedAmount)
        assertEquals(MoneyDecimal.of("236.45"), p.internalLifecycleTotal)
        assertEquals(MoneyDecimal.of("236.45"), p.internalCurrentPayableAmount)
        assertEquals(PaymentDifferenceDirection.UNDERPAID, p.direction)
        assertEquals(MoneyDecimal.of("25.74"), p.absoluteDifference)
        // Must NOT treat 164.97 as the comparison amount
        assertFalse(p.internalCurrentPayableAmount == MoneyDecimal.of("164.97"))
    }

    @Test
    fun overpaid_whenPayableIs164_97() {
        val direction = CommissionComparisonMapper.classifyPaymentDifference(
            MoneyDecimal.of("210.71"),
            MoneyDecimal.of("164.97")
        )
        assertEquals(PaymentDifferenceDirection.OVERPAID, direction)
        val abs = MoneyDecimal.of("210.71").minus(MoneyDecimal.of("164.97")).abs()
        assertTrue(abs.matchesWithinTolerance(MoneyDecimal.of("45.74")) ||
            abs.matchesWithinTolerance(MoneyDecimal.of("45.75")))
    }

    @Test
    fun grossTotals_doNotHideUnderAndOver() {
        val items = listOf(
            comparableItem(id = 1, key = "a", supplier = "0", internal = "500"), // under 500
            comparableItem(id = 2, key = "b", supplier = "300", internal = "0") // over 300
        ).mapIndexed { idx, item ->
            item.copy(
                matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name,
                normalizedGroupKey = if (idx == 0) "a" else "b"
            )
        }
        val presentations = CommissionComparisonMapper.buildPresentations(items)
        val totals = CommissionComparisonMapper.computeTotals(presentations)
        assertEquals(MoneyDecimal.of("500"), totals.grossUnderpaid)
        assertEquals(MoneyDecimal.of("300"), totals.grossOverpaid)
        assertEquals(MoneyDecimal.of("-200"), totals.netSignedDifference)
        assertEquals(1, totals.underpaidCount)
        assertEquals(1, totals.overpaidCount)
    }

    @Test
    fun filter_underpaid_onlyProvenComparable() {
        val presentations = CommissionComparisonMapper.buildPresentations(
            listOf(
                comparableItem(id = 1, key = "u", supplier = "80", internal = "100")
                    .copy(matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name),
                comparableItem(id = 2, key = "o", supplier = "120", internal = "100")
                    .copy(matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name),
                comparableItem(id = 3, key = "s", supplier = "50", internal = null).copy(
                    matchStatus = ReconciliationMatchStatus.SUPPLIER_ONLY.name,
                    reservationId = null,
                    internalCommission = null,
                    internalEventId = null
                )
            )
        )
        val under = filterPresentations(presentations, CommissionReconFilter.UNDERPAID)
        val over = filterPresentations(presentations, CommissionReconFilter.OVERPAID)
        assertEquals(1, under.size)
        assertEquals(PaymentDifferenceDirection.UNDERPAID, under.single().direction)
        assertEquals(1, over.size)
        assertEquals(PaymentDifferenceDirection.OVERPAID, over.single().direction)
    }

    @Test
    fun percentFormatting_stripsFloatArtifact() {
        assertEquals("7%", FinancialDisplayFormatter.formatPercent("7.000000000000001"))
        assertEquals("7.5%", FinancialDisplayFormatter.formatPercent("7.5"))
        assertEquals("7%", FinancialDisplayFormatter.formatPercent(7.000000000000001))
    }

    @Test
    fun moneyFormatting_hasSymbolAndTwoDecimals() {
        val text = FinancialDisplayFormatter.formatMoney(MoneyDecimal.of("1612.39"))
        assertTrue(text.startsWith("₪"))
        assertTrue(text.contains("1,612.39") || text.contains("1.612,39") || text.endsWith("1612.39"))
    }

    @Test
    fun signedDifference_equals_supplierMinusCurrentPayable() {
        val p = CommissionComparisonMapper.buildPresentation(
            listOf(comparableItem(supplier = "210.71", internal = "236.45"))
        )
        val expected = MoneyDecimal.of("210.71").minus(MoneyDecimal.of("236.45"))
        assertEquals(expected, p.signedDifference)
        assertEquals(p.internalCurrentPayableAmount, MoneyDecimal.of("236.45"))
    }

    private fun comparableItem(
        id: Long = 1,
        key: String = "k$id",
        supplier: String?,
        internal: String?,
        eventId: String? = "e$id",
        eventType: String? = "FINAL_RENTAL",
        days: Int? = 5
    ) = CommissionReconciliationItem(
        id = id,
        importId = 1,
        supplierId = 1,
        normalizedGroupKey = key,
        reservationId = 10L,
        internalEventId = eventId,
        supplierOrderNumber = "ord$id",
        supplierInvoiceNumber = "inv$id",
        supplierCustomerName = "Customer",
        supplierDays = 43,
        supplierRevenue = "3000",
        supplierPercent = "7.000000000000001",
        supplierCommission = supplier,
        internalPeriodStart = null,
        internalPeriodEnd = null,
        internalDays = days,
        internalPercent = "7",
        internalCommission = internal,
        deviation = null,
        matchStatus = ReconciliationMatchStatus.AMOUNT_MISMATCH.name,
        lifecycleClassification = CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name,
        proposedActualReturnDate = null,
        approvalState = "PENDING",
        userUid = "uid",
        eventType = eventType
    )
}
