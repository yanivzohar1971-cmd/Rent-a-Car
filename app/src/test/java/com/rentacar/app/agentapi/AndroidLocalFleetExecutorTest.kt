package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.ports.FleetReadPort
import com.rentacar.app.data.CarSale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLocalFleetExecutorTest {
    @Test
    fun fleetUsesAuthScopedPortAndFiltersStatus() {
        var receivedUid: String? = null
        val port = object : FleetReadPort {
            override suspend fun fleet(userUid: String): List<CarSale> {
                receivedUid = userUid
                return listOf(car(1, "DRAFT"), car(2, "PUBLISHED"))
            }
        }
        val api = RentCarAgentAPI.forAndroidLocalReads(
            EmptySupplierPort, EmptyReservationPort, fleetReadPort = port
        )
        val response = api.execute(batchRequest("yard.fleet.filter", mapOf("status" to "DRAFT")))
        assertTrue(response.success)
        assertEquals(BATCH_UID, receivedUid)
        assertEquals(1, (response.data as Map<*, *>)["totalMatching"])
    }

    private fun car(id: Long, status: String) = CarSale(
        id = id, firstName = "A", lastName = "B", phone = "1", carTypeName = "Ford Focus",
        saleDate = 1, salePrice = 1000.0, commissionPrice = 0.0,
        publicationStatus = status, userUid = BATCH_UID
    )
}
