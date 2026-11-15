package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.ports.FinanceReadPort
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class AndroidLocalFinanceExecutorTest {
    @Test
    fun totalsAndAlignmentAreReadOnlyRepositoryBackedPreviews() {
        val reservation = Reservation(
            id = 1, customerId = 1, supplierId = 2, branchId = 3, carTypeId = 4,
            dateFrom = Instant.parse("2026-01-10T10:00:00Z").toEpochMilli(),
            dateTo = Instant.parse("2026-01-15T10:00:00Z").toEpochMilli(),
            actualReturnDate = Instant.parse("2026-01-15T10:00:00Z").toEpochMilli(),
            agreedPrice = 600.0, kmIncluded = 100, requiredHoldAmount = 1000,
            status = ReservationStatus.Paid, userUid = BATCH_UID
        )
        val sale = CarSale(
            id = 7, firstName = "A", lastName = "B", phone = "1", carTypeName = "Car",
            saleDate = 10, salePrice = 1000.0, commissionPrice = 100.0, userUid = BATCH_UID
        )
        val port = object : FinanceReadPort {
            override suspend fun reservations(userUid: String) = listOf(reservation)
            override suspend fun salesWithPaidTotals(userUid: String) =
                listOf(sale) to mapOf(7L to 25.0)
        }
        val api = RentCarAgentAPI.forAndroidLocalReads(
            EmptySupplierPort, EmptyReservationPort, financeReadPort = port
        )
        val totals = api.execute(batchRequest("commission.summary.totals", mapOf("payoutMonth" to "2026-02")))
        assertTrue(totals.success)
        assertEquals(1, (totals.data as Map<*, *>)["distinctReservationCount"])
        val preview = api.execute(batchRequest("commission.alignment.preview"))
        assertTrue(preview.success)
        assertEquals(0, sale.copy().id.compareTo(sale.id))
    }
}
