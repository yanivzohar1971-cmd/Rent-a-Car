package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CarSaleCommissionPaymentLogicTest {

    @Test
    fun case1_noPayments() {
        val totals = CarSaleCommissionPaymentLogic.totals(1500.0, emptyList())
        assertEquals(0.0, totals.totalPaid, 0.0001)
        assertEquals(1500.0, totals.remaining, 0.0001)
        assertFalse(totals.fullyPaid)
    }

    @Test
    fun case2_singlePartialPayment() {
        val totals = CarSaleCommissionPaymentLogic.totals(1500.0, listOf(500.0))
        assertEquals(500.0, totals.totalPaid, 0.0001)
        assertEquals(1000.0, totals.remaining, 0.0001)
        assertFalse(totals.fullyPaid)
    }

    @Test
    fun case3_twoPartialPayments() {
        val totals = CarSaleCommissionPaymentLogic.totals(1500.0, listOf(500.0, 300.0))
        assertEquals(800.0, totals.totalPaid, 0.0001)
        assertEquals(700.0, totals.remaining, 0.0001)
        assertFalse(totals.fullyPaid)
    }

    @Test
    fun case4_fullyPaid() {
        val totals = CarSaleCommissionPaymentLogic.totals(1500.0, listOf(500.0, 300.0, 700.0))
        assertEquals(1500.0, totals.totalPaid, 0.0001)
        assertEquals(0.0, totals.remaining, 0.0001)
        assertTrue(totals.fullyPaid)
    }

    @Test
    fun case5_newPaymentExceedsRemaining_invalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentAmount(
            amount = 701.0,
            commissionPrice = 1500.0,
            alreadyPaidExcludingThis = 800.0
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun case6_newPaymentEqualsRemaining_valid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentAmount(
            amount = 700.0,
            commissionPrice = 1500.0,
            alreadyPaidExcludingThis = 800.0
        )
        assertEquals(CarSaleCommissionPaymentLogic.ValidationResult.Ok, result)
    }

    @Test
    fun case7_commissionZero_newPaymentInvalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentAmount(
            amount = 1.0,
            commissionPrice = 0.0,
            alreadyPaidExcludingThis = 0.0
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun case8_loweringCommissionBelowPaid_invalid() {
        val result = CarSaleCommissionPaymentLogic.validateCommissionAgainstPaid(
            newCommissionPrice = 1000.0,
            totalPaid = 1200.0
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun case9_paymentAmountZero_invalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentAmount(
            amount = 0.0,
            commissionPrice = 1500.0,
            alreadyPaidExcludingThis = 0.0
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun case10_paymentAmountNegative_invalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentAmount(
            amount = -10.0,
            commissionPrice = 1500.0,
            alreadyPaidExcludingThis = 0.0
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun missingDate_invalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentDate(null)
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }

    @Test
    fun paymentsExceedCommission_invalid() {
        val result = CarSaleCommissionPaymentLogic.validatePaymentsDoNotExceedCommission(
            commissionPrice = 1500.0,
            paymentAmounts = listOf(1000.0, 600.0)
        )
        assertTrue(result is CarSaleCommissionPaymentLogic.ValidationResult.Error)
    }
}
