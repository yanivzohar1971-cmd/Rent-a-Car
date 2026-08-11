package com.rentacar.app.domain

import com.rentacar.app.commission.domain.CommissionEventType
import com.rentacar.app.commission.domain.CommissionSettlementIds
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class CommissionClosingRemainderTest {

    private val timezone = ZoneId.of("Asia/Jerusalem")

    @Before
    fun setUp() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 7, 7) }
    }

    @After
    fun tearDown() {
        CommissionCalculationService.currentDateProvider = { LocalDate.now(timezone) }
    }

    @Test
    fun closedMonthly_43days_emitsFullCyclePlusRemainderWithMonthlyPercent() {
        val start = date(2026, 1, 1)
        val end = date(2026, 2, 12) // 43 inclusive days
        val reservation = Reservation(
            id = 1,
            customerId = 1,
            supplierId = 1,
            branchId = 1,
            carTypeId = 1,
            dateFrom = start,
            dateTo = date(2026, 3, 1),
            actualReturnDate = end,
            agreedPrice = 3000.0,
            includeVat = false,
            kmIncluded = 0,
            requiredHoldAmount = 0,
            periodTypeDays = 30,
            status = ReservationStatus.Confirmed,
            isClosed = true
        )
        val terms = SupplierCommissionTerms(15, 10, 7)
        val events = CommissionCalculationService.calculateAllInstallmentsForReservation(
            reservation,
            CommissionCalcOptions(includeClosingRemainder = true, terms = terms)
        )
        assertEquals(2, events.size)
        assertEquals(CommissionEventType.MONTHLY_CYCLE.name, events[0].eventType)
        assertEquals(30, events[0].numberOfDays)
        assertEquals(7.0, events[0].commissionPercent!!, 0.001)
        assertEquals(CommissionEventType.FINAL_REMAINDER.name, events[1].eventType)
        assertEquals(13, events[1].numberOfDays)
        assertEquals(7.0, events[1].commissionPercent!!, 0.001)
    }

    @Test
    fun defaultOptions_stillOmitIncompleteRemainder() {
        val reservation = Reservation(
            id = 1,
            customerId = 1,
            supplierId = 1,
            branchId = 1,
            carTypeId = 1,
            dateFrom = date(2026, 1, 1),
            dateTo = date(2026, 3, 1),
            actualReturnDate = date(2026, 2, 12),
            agreedPrice = 3000.0,
            includeVat = false,
            kmIncluded = 0,
            requiredHoldAmount = 0,
            periodTypeDays = 30,
            status = ReservationStatus.Confirmed,
            isClosed = true
        )
        val events = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)
        assertEquals(1, events.size)
        assertEquals(30, events.single().numberOfDays)
    }

    @Test
    fun trackingCap_stopsFutureAccrual() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 6, 1) }
        val reservation = Reservation(
            id = 1,
            customerId = 1,
            supplierId = 1,
            branchId = 1,
            carTypeId = 1,
            dateFrom = date(2026, 1, 1),
            dateTo = date(2026, 12, 1),
            actualReturnDate = null,
            agreedPrice = 3000.0,
            includeVat = false,
            kmIncluded = 0,
            requiredHoldAmount = 0,
            periodTypeDays = 30,
            status = ReservationStatus.Confirmed,
            isClosed = false
        )
        val capped = CommissionCalculationService.calculateAllInstallmentsForReservation(
            reservation,
            CommissionCalcOptions(
                commissionCapByReservationId = mapOf(1L to LocalDate.of(2026, 1, 30))
            )
        )
        val uncapped = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)
        assertTrue(capped.size < uncapped.size)
        assertEquals(1, capped.size)
    }

    @Test
    fun settlementIds_stable() {
        val id = CommissionSettlementIds.monthlyCycle(
            10, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 30)
        )
        assertEquals("10_2026-01-01_2026-01-30_MONTHLY_CYCLE", id)
        assertEquals(
            "10_2026-01-31_2026-02-12_FINAL_REMAINDER",
            CommissionSettlementIds.finalRemainder(
                10, LocalDate.of(2026, 1, 31), LocalDate.of(2026, 2, 12)
            )
        )
    }

    @Test
    fun reconciliationEvents_43days() {
        val reservation = Reservation(
            id = 1,
            customerId = 1,
            supplierId = 1,
            branchId = 1,
            carTypeId = 1,
            dateFrom = date(2026, 1, 1),
            dateTo = date(2026, 3, 1),
            actualReturnDate = null,
            agreedPrice = 3000.0,
            includeVat = false,
            kmIncluded = 0,
            requiredHoldAmount = 0,
            periodTypeDays = 30,
            status = ReservationStatus.Confirmed
        )
        val events = CommissionCalculationService.calculateEventsForReconciliation(
            reservation,
            supplierTotalDays = 43,
            terms = SupplierCommissionTerms(15, 10, 7)
        )
        assertEquals(2, events.size)
        assertEquals(30, events[0].numberOfDays)
        assertEquals(13, events[1].numberOfDays)
    }

    private fun date(year: Int, month: Int, day: Int): Long =
        LocalDate.of(year, month, day).atStartOfDay(timezone).toInstant().toEpochMilli()
}
