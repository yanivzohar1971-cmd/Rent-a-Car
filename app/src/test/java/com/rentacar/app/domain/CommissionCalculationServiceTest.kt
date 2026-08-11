package com.rentacar.app.domain

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class CommissionCalculationServiceTest {

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
    fun dailyRental_returned15July2026_commissionMonthAugust2026() {
        val reservation = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 7, 10),
            dateTo = date(2026, 7, 15),
            actualReturnDate = date(2026, 7, 15)
        )

        val installments = payoutMonth("2026-08", reservation)

        assertEquals(1, installments.size)
        assertEquals("2026-08", installments.single().payoutMonth)
        assertEquals(false, installments.single().isMonthlyRental)
    }

    @Test
    fun weeklyRental_returned31January2026_commissionMonthFebruary2026() {
        val reservation = reservation(
            periodTypeDays = 7,
            dateFrom = date(2026, 1, 25),
            dateTo = date(2026, 1, 31),
            actualReturnDate = date(2026, 1, 31)
        )

        val installments = payoutMonth("2026-02", reservation)

        assertEquals(1, installments.size)
        assertEquals("2026-02", installments.single().payoutMonth)
    }

    @Test
    fun dailyRental_nullActualReturnDate_noCommission() {
        val reservation = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 7, 10),
            dateTo = date(2026, 7, 15),
            actualReturnDate = null,
            isClosed = true
        )

        val installments = payoutMonth("2026-08", reservation)

        assertTrue(installments.isEmpty())
    }

    @Test
    fun monthlyRental_openFrom10January2026_generatesFirstTwoCompletedCycles() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 3, 15) }

        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 4, 10),
            actualReturnDate = null
        )

        val marchPayout = payoutMonth("2026-03", reservation)
        val aprilPayout = payoutMonth("2026-04", reservation)
        val mayPayout = payoutMonth("2026-05", reservation)

        assertEquals(1, marchPayout.size)
        assertEquals(date(2026, 1, 10), marchPayout.single().periodStart)
        assertEquals(date(2026, 2, 8), marchPayout.single().periodEnd)

        assertEquals(1, aprilPayout.size)
        assertEquals(date(2026, 2, 9), aprilPayout.single().periodStart)
        assertEquals(date(2026, 3, 10), aprilPayout.single().periodEnd)

        assertTrue(mayPayout.isEmpty())
    }

    @Test
    fun monthlyRental_returnedOnExactCycleEnd_generatesMarchCommission() {
        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 2, 10),
            actualReturnDate = date(2026, 2, 8)
        )

        val installments = payoutMonth("2026-03", reservation)
        val all = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)

        assertEquals(1, installments.size)
        assertEquals("2026-03", installments.single().payoutMonth)
        assertEquals(date(2026, 1, 10), installments.single().periodStart)
        assertEquals(date(2026, 2, 8), installments.single().periodEnd)
        assertEquals("1_2026-01-10_2026-02-08", installments.single().id)
        assertEquals(1, all.size)
        assertEquals("2026-03", all.single().payoutMonth)
    }

    @Test
    fun monthlyRental_returnedBeforeNextCycle_doesNotGenerateIncompleteCycle() {
        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 3, 10),
            actualReturnDate = date(2026, 2, 20)
        )

        val all = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)

        assertEquals(1, all.size)
        assertEquals("2026-03", all.single().payoutMonth)
        assertEquals(date(2026, 2, 8), all.single().periodEnd)
    }

    @Test
    fun monthlyRental_returnedAfterSeveralCycles_generatesOnlyCompletedCycles() {
        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 6, 10),
            actualReturnDate = date(2026, 4, 5)
        )

        val all = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)

        assertEquals(2, all.size)
        assertEquals(listOf("2026-03", "2026-04"), all.map { it.payoutMonth })
        assertEquals(date(2026, 3, 10), all.last().periodEnd)
    }

    @Test
    fun decemberCycleEnd_commissionMonthMovesToJanuaryNextYear() {
        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2025, 12, 2),
            dateTo = date(2026, 1, 31),
            actualReturnDate = date(2025, 12, 31)
        )

        val installments = payoutMonth("2026-01", reservation)

        assertEquals(1, installments.size)
        assertEquals(date(2025, 12, 31), installments.single().periodEnd)
    }

    @Test
    fun recalculationExecutedTwice_noDuplicateCommissionEvents() {
        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 6, 10),
            actualReturnDate = date(2026, 4, 5)
        )

        val first = payoutMonth("2026-04", reservation)
        val second = payoutMonth("2026-04", reservation)

        assertEquals(first, second)
        assertEquals(1, first.size)
        assertEquals("1_2026-02-09_2026-03-10", first.single().id)
        assertEquals(1, first.map { it.id }.distinct().size)
    }

    @Test
    fun periodTypeDays24_usesMonthlyRollingCyclesSameAs30() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 3, 15) }

        val legacyMonthly = reservation(
            id = 1,
            periodTypeDays = 24,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 4, 10),
            actualReturnDate = null
        )
        val explicitMonthly = reservation(
            id = 2,
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 4, 10),
            actualReturnDate = null
        )

        assertTrue(CommissionCalculationService.isMonthlyRental(legacyMonthly))

        val legacyInstallments = CommissionCalculationService.calculateAllInstallmentsForReservation(legacyMonthly)
        val explicitInstallments = CommissionCalculationService.calculateAllInstallmentsForReservation(explicitMonthly)

        assertEquals(
            explicitInstallments.map { it.payoutMonth to it.id.replace("2_", "1_") },
            legacyInstallments.map { it.payoutMonth to it.id }
        )
        assertEquals(
            explicitInstallments.map { Triple(it.periodStart, it.periodEnd, it.amount) },
            legacyInstallments.map { Triple(it.periodStart, it.periodEnd, it.amount) }
        )
        assertEquals(listOf("2026-03", "2026-04"), legacyInstallments.map { it.payoutMonth })
        assertEquals("1_2026-01-10_2026-02-08", legacyInstallments.first().id)
    }

    @Test
    fun openMonthlyRental_doesNotCreateFutureCycles() {
        CommissionCalculationService.currentDateProvider = { LocalDate.of(2026, 3, 15) }

        val reservation = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 1, 10),
            dateTo = date(2026, 12, 10),
            actualReturnDate = null
        )

        val futurePayout = payoutMonth("2026-12", reservation)
        val currentCompleted = payoutMonth("2026-04", reservation)

        assertTrue(futurePayout.isEmpty())
        assertEquals(1, currentCompleted.size)
        assertEquals("1_2026-02-09_2026-03-10", currentCompleted.single().id)
    }

    @Test
    fun installmentIds_useIsoLocalDateFormattingWithoutTimestamps() {
        val reservation = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 7, 10),
            dateTo = date(2026, 7, 15),
            actualReturnDate = date(2026, 7, 15) + 5_000L
        )

        val installment = payoutMonth("2026-08", reservation).single()

        assertEquals("1_2026-07-10_2026-07-15", installment.id)
    }

    @Test
    fun supplierYearMonthFilter_showsOnlyMatchingCommissionMonth() {
        val supplierA = 1L
        val supplierB = 2L
        val julyReturn = reservation(
            id = 1,
            supplierId = supplierA,
            periodTypeDays = 1,
            dateFrom = date(2026, 7, 1),
            dateTo = date(2026, 7, 10),
            actualReturnDate = date(2026, 7, 15)
        )
        val augustReturn = reservation(
            id = 2,
            supplierId = supplierB,
            periodTypeDays = 1,
            dateFrom = date(2026, 8, 1),
            dateTo = date(2026, 8, 10),
            actualReturnDate = date(2026, 8, 12)
        )

        val augustForSupplierA = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
            payoutMonth = "2026-08",
            reservations = listOf(julyReturn, augustReturn),
            supplierFilter = supplierA
        )
        val septemberForSupplierB = CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
            payoutMonth = "2026-09",
            reservations = listOf(julyReturn, augustReturn),
            supplierFilter = supplierB
        )

        assertEquals(1, augustForSupplierA.size)
        assertEquals(1L, augustForSupplierA.single().orderId)
        assertEquals(1, septemberForSupplierB.size)
        assertEquals(2L, septemberForSupplierB.single().orderId)
    }

    @Test
    fun isMonthlyRental_usesPeriodTypeNotDuration() {
        val legacyMonthlyType = reservation(
            periodTypeDays = 24,
            dateFrom = date(2026, 7, 1),
            dateTo = date(2026, 7, 5),
            actualReturnDate = date(2026, 7, 5)
        )
        val shortMonthlyType = reservation(
            periodTypeDays = 30,
            dateFrom = date(2026, 7, 1),
            dateTo = date(2026, 7, 5),
            actualReturnDate = date(2026, 7, 5)
        )
        val longDailyType = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 1, 1),
            dateTo = date(2026, 3, 1),
            actualReturnDate = date(2026, 3, 1)
        )

        assertTrue(CommissionCalculationService.isMonthlyRental(legacyMonthlyType))
        assertTrue(CommissionCalculationService.isMonthlyRental(shortMonthlyType))
        assertTrue(!CommissionCalculationService.isMonthlyRental(longDailyType))
    }

    @Test
    fun getCommissionEndDate_ignoresUpdatedAtAndPlannedEnd() {
        val reservation = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 7, 1),
            dateTo = date(2026, 7, 10),
            actualReturnDate = null,
            isClosed = true,
            updatedAt = date(2026, 8, 1)
        )

        assertEquals(null, CommissionCalculationService.getCommissionEndDate(reservation))
    }

    @Test
    fun computeEarliestPayoutMonth_usesCommissionTimingNotRentalStart() {
        val reservation = reservation(
            periodTypeDays = 1,
            dateFrom = date(2026, 1, 1),
            dateTo = date(2026, 1, 5),
            actualReturnDate = date(2026, 7, 15)
        )

        val earliest = CommissionCalculationService.computeEarliestPayoutMonth(
            reservations = listOf(reservation),
            supplierId = 1L
        )

        assertEquals(YearMonth.of(2026, 8), earliest)
    }

    private fun payoutMonth(month: String, reservation: Reservation) =
        CommissionCalculationService.calculateCommissionInstallmentsForPayoutMonth(
            payoutMonth = month,
            reservations = listOf(reservation)
        )

    private fun reservation(
        id: Long = 1L,
        supplierId: Long = 1L,
        periodTypeDays: Int,
        dateFrom: Long,
        dateTo: Long,
        actualReturnDate: Long?,
        isClosed: Boolean = actualReturnDate != null,
        updatedAt: Long = System.currentTimeMillis()
    ): Reservation = Reservation(
        id = id,
        customerId = 1L,
        supplierId = supplierId,
        branchId = 1L,
        carTypeId = 1L,
        dateFrom = dateFrom,
        dateTo = dateTo,
        actualReturnDate = actualReturnDate,
        agreedPrice = 1000.0,
        kmIncluded = 100,
        requiredHoldAmount = 500,
        periodTypeDays = periodTypeDays,
        status = ReservationStatus.Confirmed,
        isClosed = isClosed,
        updatedAt = updatedAt
    )

    private fun date(year: Int, month: Int, day: Int): Long =
        LocalDate.of(year, month, day).atStartOfDay(timezone).toInstant().toEpochMilli()
}
