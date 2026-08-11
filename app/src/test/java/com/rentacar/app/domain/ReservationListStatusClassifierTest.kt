package com.rentacar.app.domain

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReservationListStatusClassifierTest {

    @Test
    fun cancelled_takesPrecedence() {
        val r = reservation(status = ReservationStatus.Cancelled, isClosed = true, actualReturn = 1L)
        assertEquals(ReservationListStatus.CANCELLED, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun closed_whenIsClosed() {
        val r = reservation(isClosed = true)
        assertEquals(ReservationListStatus.CLOSED, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun closed_whenActualReturnDateExists() {
        val r = reservation(actualReturn = 1_700_000_000_000L)
        assertEquals(ReservationListStatus.CLOSED, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun closed_finalSettlementPending_viaIsClosedFlag() {
        // Closing process stored as isClosed without requiring Cancelled
        val r = reservation(status = ReservationStatus.Confirmed, isClosed = true)
        assertEquals(ReservationListStatus.CLOSED, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun active_openMonthlyCycle_noReturn_noClosedFlag() {
        val r = reservation(
            status = ReservationStatus.Confirmed,
            isClosed = false,
            actualReturn = null,
            periodTypeDays = 30
        )
        assertEquals(ReservationListStatus.ACTIVE, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun active_withoutClosingProcess() {
        val r = reservation(status = ReservationStatus.Paid, isClosed = false, actualReturn = null)
        assertEquals(ReservationListStatus.ACTIVE, ReservationListStatusClassifier.classify(r))
    }

    @Test
    fun closedFilter_matchesOnlyClosed() {
        val closed = reservation(isClosed = true)
        val active = reservation()
        val cancelled = reservation(status = ReservationStatus.Cancelled)
        assertTrue(ReservationListStatusClassifier.matches(closed, ReservationListStatus.CLOSED))
        assertTrue(!ReservationListStatusClassifier.matches(active, ReservationListStatus.CLOSED))
        assertTrue(!ReservationListStatusClassifier.matches(cancelled, ReservationListStatus.CLOSED))
    }

    private fun reservation(
        status: ReservationStatus = ReservationStatus.Confirmed,
        isClosed: Boolean = false,
        actualReturn: Long? = null,
        periodTypeDays: Int = 1
    ) = Reservation(
        id = 1,
        customerId = 1,
        supplierId = 1,
        branchId = 1,
        agentId = null,
        carTypeId = 1,
        dateFrom = 1L,
        dateTo = 2L,
        actualReturnDate = actualReturn,
        agreedPrice = 100.0,
        includeVat = false,
        kmIncluded = 0,
        requiredHoldAmount = 0,
        periodTypeDays = periodTypeDays,
        status = status,
        isClosed = isClosed,
        userUid = "uid"
    )
}
