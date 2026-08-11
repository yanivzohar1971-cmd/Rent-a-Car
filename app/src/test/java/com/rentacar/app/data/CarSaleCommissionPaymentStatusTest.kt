package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CarSaleCommissionPaymentStatusTest {

    @Test
    fun case1_noCommission() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.NO_COMMISSION,
            CarSaleCommissionPaymentLogic.paymentStatus(0.0, 0.0)
        )
        assertEquals(0.0, CarSaleCommissionPaymentLogic.remaining(0.0, 0.0), 0.0001)
    }

    @Test
    fun case2_unpaid() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.UNPAID,
            CarSaleCommissionPaymentLogic.paymentStatus(2000.0, 0.0)
        )
        assertEquals(2000.0, CarSaleCommissionPaymentLogic.remaining(2000.0, 0.0), 0.0001)
    }

    @Test
    fun case3_partial() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.PARTIAL,
            CarSaleCommissionPaymentLogic.paymentStatus(2000.0, 500.0)
        )
        assertEquals(1500.0, CarSaleCommissionPaymentLogic.remaining(2000.0, 500.0), 0.0001)
    }

    @Test
    fun case4_fullyPaid() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.PAID,
            CarSaleCommissionPaymentLogic.paymentStatus(2000.0, 2000.0)
        )
        assertEquals(0.0, CarSaleCommissionPaymentLogic.remaining(2000.0, 2000.0), 0.0001)
    }

    @Test
    fun case5_almostPaid_stillPartial() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.PARTIAL,
            CarSaleCommissionPaymentLogic.paymentStatus(2000.0, 1999.0)
        )
        assertEquals(1.0, CarSaleCommissionPaymentLogic.remaining(2000.0, 1999.0), 0.0001)
    }

    @Test
    fun case6_floatOvershoot_treatedAsPaid() {
        assertEquals(
            CarSaleCommissionPaymentLogic.PaymentStatus.PAID,
            CarSaleCommissionPaymentLogic.paymentStatus(2000.0, 2000.0000001)
        )
        assertEquals(0.0, CarSaleCommissionPaymentLogic.remaining(2000.0, 2000.0000001), 0.0001)
    }

    @Test
    fun filter_allWithWithoutPartial() {
        data class Sale(val name: String, val commission: Double, val paid: Double)

        val sales = listOf(
            Sale("A", 0.0, 0.0),
            Sale("B", 1000.0, 0.0),
            Sale("C", 1500.0, 500.0),
            Sale("D", 2000.0, 2000.0)
        )

        fun names(filter: String?): List<String> =
            sales.filter {
                CarSaleCommissionPaymentLogic.matchesCommissionFilter(filter, it.commission, it.paid)
            }.map { it.name }

        assertEquals(listOf("A", "B", "C", "D"), names(null))
        assertEquals(listOf("B", "C", "D"), names("with"))
        assertEquals(listOf("A"), names("without"))
        assertEquals(listOf("C"), names("partial"))
    }

    @Test
    fun aggregates_visibleSet() {
        data class Sale(val commission: Double, val paid: Double)

        val visible = listOf(
            Sale(1000.0, 0.0),
            Sale(2000.0, 500.0),
            Sale(3000.0, 3000.0)
        )
        val totalCommission = visible.sumOf { it.commission }
        val totalActuallyPaid = visible.sumOf { it.paid }
        assertEquals(6000.0, totalCommission, 0.0001)
        assertEquals(3500.0, totalActuallyPaid, 0.0001)

        val partialOnly = visible.filter {
            CarSaleCommissionPaymentLogic.matchesCommissionFilter("partial", it.commission, it.paid)
        }
        val partialRemaining = partialOnly.sumOf {
            CarSaleCommissionPaymentLogic.remaining(it.commission, it.paid)
        }
        assertEquals(1, partialOnly.size)
        assertEquals(1500.0, partialRemaining, 0.0001)
    }

    @Test
    fun withCommission_includesUnpaidPartialAndPaid() {
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter("with", 1000.0, 0.0))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter("with", 1000.0, 400.0))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter("with", 1000.0, 1000.0))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter("with", 0.0, 0.0))
    }
}
