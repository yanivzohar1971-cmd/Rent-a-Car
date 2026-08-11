package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CarSaleCommissionAlignmentLogicTest {

    @Test
    fun case1_zeroCommission_noPayment() {
        assertEquals(0.0, CarSaleCommissionAlignmentLogic.alignmentAmount(0.0, 0.0), 0.0001)
    }

    @Test
    fun case2_unpaid_fullCommission() {
        assertEquals(2000.0, CarSaleCommissionAlignmentLogic.alignmentAmount(2000.0, 0.0), 0.0001)
    }

    @Test
    fun case3_partial_remainingOnly() {
        assertEquals(1500.0, CarSaleCommissionAlignmentLogic.alignmentAmount(2000.0, 500.0), 0.0001)
    }

    @Test
    fun case4_fullyPaid_noPayment() {
        assertEquals(0.0, CarSaleCommissionAlignmentLogic.alignmentAmount(2000.0, 2000.0), 0.0001)
    }

    @Test
    fun case5_overpaid_noPayment() {
        assertEquals(0.0, CarSaleCommissionAlignmentLogic.alignmentAmount(2000.0, 2100.0), 0.0001)
    }

    @Test
    fun case6_idempotency_secondRunEmpty() {
        val first = CarSaleCommissionAlignmentLogic.buildPreview(
            listOf(
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(1L, 2000.0, 500.0, 1_700_000_000_000L)
            )
        )
        assertEquals(1, first.saleCount)
        assertEquals(1500.0, first.totalAmount, 0.0001)

        val second = CarSaleCommissionAlignmentLogic.buildPreview(
            listOf(
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(1L, 2000.0, 2000.0, 1_700_000_000_000L)
            )
        )
        assertFalse(second.hasWork)
        assertEquals(0, second.saleCount)
        assertEquals(0.0, second.totalAmount, 0.0001)
    }

    @Test
    fun case7_usesSaleDateWhenValid() {
        val saleDate = 1_700_000_000_000L
        val date = CarSaleCommissionAlignmentLogic.resolvePaymentDate(saleDate)
        assertEquals(saleDate, date)
    }

    @Test
    fun case8_fallbackTodayWhenSaleDateMissing() {
        val now = 1_724_000_000_000L // fixed instant
        val expected = CarSaleCommissionAlignmentLogic.startOfTodayMillis(now)
        val date = CarSaleCommissionAlignmentLogic.resolvePaymentDate(0L, now)
        assertEquals(expected, date)
        assertTrue(date > 0L)
    }

    @Test
    fun preview_mixedSales() {
        val preview = CarSaleCommissionAlignmentLogic.buildPreview(
            listOf(
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(1L, 0.0, 0.0, 1L),
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(2L, 1000.0, 0.0, 2L),
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(3L, 1500.0, 500.0, 3L),
                CarSaleCommissionAlignmentLogic.SaleAlignmentInput(4L, 2000.0, 2000.0, 4L)
            )
        )
        assertEquals(2, preview.saleCount)
        assertEquals(2000.0, preview.totalAmount, 0.0001)
        assertEquals(1000.0, preview.plans[0].amount, 0.0001)
        assertEquals(1000.0, preview.plans[1].amount, 0.0001)
    }
}
