package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.ports.CatalogAndReservationExtReadPort
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.data.Agent
import com.rentacar.app.data.Branch
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierPriceListHeader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidLocalCatalogAndReservationExtExecutorTest {
    private val reservation = Reservation(
        id = 8, customerId = 4, supplierId = 2, branchId = 3, carTypeId = 1,
        dateFrom = 1, dateTo = 2, agreedPrice = 100.0, kmIncluded = 10,
        requiredHoldAmount = 100, userUid = BATCH_UID
    )
    private val port = object : CatalogAndReservationExtReadPort {
        override suspend fun agents(userUid: String) = listOf(Agent(1, "Agent", userUid = userUid))
        override suspend fun branches(userUid: String, supplierId: Long?) = emptyList<Branch>()
        override suspend fun suppliers(userUid: String) = emptyList<Supplier>()
        override suspend fun priceLists(userUid: String, supplierId: Long?) = emptyList<SupplierPriceListHeader>()
        override suspend fun reservations(userUid: String) = listOf(reservation)
        override suspend fun reservationsByCustomer(userUid: String, customerId: Long) = listOf(reservation)
        override suspend fun reservationsBySupplier(userUid: String, supplierId: Long) = listOf(reservation)
        override suspend fun reservationsByAgent(userUid: String, agentId: Long) = listOf(reservation)
        override suspend fun reservationsByBranch(userUid: String, branchId: Long) = listOf(reservation)
        override suspend fun openReservations(userUid: String) = listOf(reservation)
        override suspend fun payments(userUid: String, reservationId: Long) =
            listOf(Payment(1, reservationId, 20.0, 1, "cash", userUid = userUid))
        override suspend fun customer(userUid: String, id: Long) =
            Customer(id, "A", "B", "050", userUid = userUid)
    }

    @Test
    fun severalExtendedReadsExecuteLocally() {
        val api = api()
        assertTrue(api.execute(batchRequest("agent.list")).success)
        assertTrue(api.execute(batchRequest("reservation.list.byCustomer", mapOf("customerId" to 4))).success)
        assertTrue(api.execute(batchRequest("reservation.payment.list", mapOf("reservationId" to 8))).success)
        assertTrue(api.execute(batchRequest("customer.details.view", mapOf("id" to 4))).success)
    }

    @Test
    fun writesStayDisabledAndCloudIsRejected() {
        val api = api()
        val registry = AgentCapabilityRegistry.loadDefault()
        val write = registry.writes().first()
        @Suppress("UNCHECKED_CAST")
        val required = (write.inputSchema["required"] as? List<*>)?.filterIsInstance<String>().orEmpty()
        val writeResponse = api.execute(batchRequest(write.operationId, required.associateWith { "1" }))
        assertFalse(writeResponse.success)
        assertEquals(AgentErrorCode.WRITE_DISABLED, writeResponse.error?.code)

        val cloud = api.execute(batchRequest("agent.list", target = AgentExecutionTarget.CLOUD))
        assertFalse(cloud.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, cloud.error?.code)
    }

    private fun api() = RentCarAgentAPI.forAndroidLocalReads(
        EmptySupplierPort, EmptyReservationPort, catalogReservationExtReadPort = port
    )
}
