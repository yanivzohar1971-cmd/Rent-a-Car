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
    fun filter_case1_zeroCommission_onlyAll() {
        val c = 0.0
        val p = 0.0
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL, c, p))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, c, p))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED, c, p))
    }

    @Test
    fun filter_case2_unpaid_isOpen() {
        val c = 2000.0
        val p = 0.0
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL, c, p))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, c, p))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED, c, p))
    }

    @Test
    fun filter_case3_partial_isOpen() {
        val c = 2000.0
        val p = 500.0
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL, c, p))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, c, p))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED, c, p))
    }

    @Test
    fun filter_case4_fullyPaid_isClosed() {
        val c = 2000.0
        val p = 2000.0
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL, c, p))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, c, p))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED, c, p))
    }

    @Test
    fun filter_case5_floatOvershoot_closed() {
        assertTrue(
            CarSaleCommissionPaymentLogic.matchesCommissionFilter(
                CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED,
                2000.0,
                2000.0000001
            )
        )
    }

    @Test
    fun filter_case6_almostPaid_open() {
        assertTrue(
            CarSaleCommissionPaymentLogic.matchesCommissionFilter(
                CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN,
                2000.0,
                1999.0
            )
        )
        assertFalse(
            CarSaleCommissionPaymentLogic.matchesCommissionFilter(
                CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED,
                2000.0,
                1999.0
            )
        )
    }

    @Test
    fun filter_collection_allOpenClosed() {
        data class Sale(val name: String, val commission: Double, val paid: Double)

        val sales = listOf(
            Sale("A", 0.0, 0.0),
            Sale("B", 1000.0, 0.0),
            Sale("C", 1500.0, 500.0),
            Sale("D", 2000.0, 2000.0)
        )

        fun names(filter: CarSaleCommissionPaymentLogic.CommissionCollectionFilter): List<String> =
            sales.filter {
                CarSaleCommissionPaymentLogic.matchesCommissionFilter(filter, it.commission, it.paid)
            }.map { it.name }

        assertEquals(listOf("A", "B", "C", "D"), names(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.ALL))
        assertEquals(listOf("B", "C"), names(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN))
        assertEquals(listOf("D"), names(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.CLOSED))
    }

    @Test
    fun aggregates_openVisibleSet() {
        data class Sale(val commission: Double, val paid: Double)

        val sales = listOf(
            Sale(0.0, 0.0),
            Sale(1000.0, 0.0),
            Sale(1500.0, 500.0),
            Sale(2000.0, 2000.0)
        )
        val openVisible = sales.filter {
            CarSaleCommissionPaymentLogic.matchesCommissionFilter(
                CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN,
                it.commission,
                it.paid
            )
        }
        val totalCommission = openVisible.sumOf { it.commission }
        val totalActuallyPaid = openVisible.sumOf { it.paid }
        val openRemaining = openVisible.sumOf {
            CarSaleCommissionPaymentLogic.remaining(it.commission, it.paid)
        }
        assertEquals(2, openVisible.size)
        assertEquals(2500.0, totalCommission, 0.0001)
        assertEquals(500.0, totalActuallyPaid, 0.0001)
        assertEquals(2000.0, openRemaining, 0.0001)
    }

    @Test
    fun open_includesUnpaidAndPartial_excludesPaidAndZero() {
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, 1000.0, 0.0))
        assertTrue(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, 1000.0, 400.0))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, 1000.0, 1000.0))
        assertFalse(CarSaleCommissionPaymentLogic.matchesCommissionFilter(CarSaleCommissionPaymentLogic.CommissionCollectionFilter.OPEN, 0.0, 0.0))
    }
}
