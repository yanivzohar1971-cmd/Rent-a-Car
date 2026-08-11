package com.rentacar.app.commission.domain

import com.rentacar.app.commission.money.MoneyDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionReportNormalizerTest {

    @Test
    fun threeSplitRowsSameOrderInvoice_combine() {
        val rows = listOf(
            row(3, "3066588", "30042194", 30, "800", "56", "7"),
            row(4, "3066588", "30042194", 30, "800", "56", "7"),
            row(5, "3066588", "30042194", 30, "800", "56", "7")
        )
        val groups = CommissionReportNormalizer.normalize(rows)
        assertEquals(1, groups.size)
        assertEquals(MoneyDecimal.of("2400"), groups.single().revenueExVat)
        assertEquals(MoneyDecimal.of("168"), groups.single().commissionAmount)
        assertEquals(30, groups.single().totalDays)
        assertEquals(MoneyDecimal.of("7"), groups.single().commissionPercent)
        assertTrue(groups.single().isValid)
    }

    @Test
    fun twoSplitRowsSameOrderInvoice_combine() {
        val rows = listOf(
            row(1, "3054776", "30042302", 10, "500", "50", "10"),
            row(2, "3054776", "30042302", 10, "500", "50", "10")
        )
        val groups = CommissionReportNormalizer.normalize(rows)
        assertEquals(1, groups.size)
        assertEquals(MoneyDecimal.of("1000"), groups.single().revenueExVat)
    }

    @Test
    fun sameOrderDifferentInvoices_staySeparate() {
        val rows = listOf(
            row(1, "23733", "111", 5, "100", "15", "15"),
            row(2, "23733", "222", 5, "200", "30", "15")
        )
        val groups = CommissionReportNormalizer.normalize(rows)
        assertEquals(2, groups.size)
    }

    @Test
    fun conflictingDays_invalid() {
        val rows = listOf(
            row(1, "1", "1", 10, "100", "10", "10"),
            row(2, "1", "1", 12, "100", "10", "10")
        )
        val group = CommissionReportNormalizer.normalize(rows).single()
        assertFalse(group.isValid)
        assertTrue(group.validationErrors.any { it.contains("ימים") })
    }

    @Test
    fun conflictingPercents_invalid() {
        val rows = listOf(
            row(1, "1", "1", 10, "100", "10", "10"),
            row(2, "1", "1", 10, "100", "7", "7")
        )
        val group = CommissionReportNormalizer.normalize(rows).single()
        assertFalse(group.isValid)
    }

    @Test
    fun normalizeId_stripsExcelDotZero() {
        assertEquals("3066588", RawCommissionReportRow.normalizeId("3066588.0"))
    }

    private fun row(
        source: Int,
        order: String,
        invoice: String,
        days: Int,
        revenue: String,
        commission: String,
        percent: String
    ) = RawCommissionReportRow(
        sourceRowNumber = source,
        orderNumber = order,
        invoiceNumber = invoice,
        totalDays = days,
        customerName = "Test Customer",
        revenueExVat = MoneyDecimal.of(revenue),
        commissionPercent = MoneyDecimal.of(percent),
        commissionAmount = MoneyDecimal.of(commission),
        agentName = "Agent",
        rowHash = "h$source"
    )
}
