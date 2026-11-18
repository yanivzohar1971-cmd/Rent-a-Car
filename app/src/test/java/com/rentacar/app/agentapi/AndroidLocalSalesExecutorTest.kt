package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.ports.SalesReadPort
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLocalSalesExecutorTest {
    @Test
    fun listFilterAndTotalsUsePaidAmounts() {
        val open = sale(1, "Open", 100.0)
        val closed = sale(2, "Closed", 50.0)
        val port = object : SalesReadPort {
            override suspend fun salesWithPaidTotals(userUid: String) =
                listOf(open, closed) to mapOf(1L to 20.0, 2L to 50.0)
            override suspend fun requests(userUid: String) = listOf(
                Request(id = 3, firstName = "Yaniv", lastName = "Test", phone = "050", carTypeName = "SUV")
            )
        }
        val api = RentCarAgentAPI.forAndroidLocalReads(
            EmptySupplierPort, EmptyReservationPort, salesReadPort = port
        )
        val list = api.execute(batchRequest("carSale.list", mapOf("commissionFilter" to "OPEN")))
        assertTrue(list.success)
        assertEquals(1, (list.data as Map<*, *>)["totalMatching"])
        val totals = api.execute(batchRequest("carSale.commission.totals", mapOf("commissionFilter" to "ALL")))
        assertEquals(70.0, (totals.data as Map<*, *>)["sumPaid"])
        assertEquals("PAYMENT_TRACKED_BALANCE", (totals.data as Map<*, *>)["financialLabel"])
        assertEquals(true, (totals.data as Map<*, *>)["paymentStatusTracked"])
        assertTrue(api.execute(batchRequest("request.list", mapOf("query" to "SUV"))).success)
    }

    private fun sale(id: Long, name: String, commission: Double) = CarSale(
        id = id, firstName = name, lastName = "Buyer", phone = "1", carTypeName = "Car",
        saleDate = 1, salePrice = 1000.0, commissionPrice = commission, userUid = BATCH_UID
    )
}
