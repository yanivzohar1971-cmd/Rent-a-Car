package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.ports.CatalogAndReservationExtReadPort
import com.rentacar.app.agentapi.ports.ImportLogReadPort
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.data.Agent
import com.rentacar.app.data.Branch
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierImportRun
import com.rentacar.app.data.SupplierPriceListHeader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Batch B partial: agent.history.reservations + import.log.list. */
class BatchBPartialReadsTest {
    private val reservation = Reservation(
        id = 8, customerId = 4, supplierId = 2, branchId = 3, carTypeId = 1,
        dateFrom = 1, dateTo = 2, agreedPrice = 100.0, kmIncluded = 10,
        requiredHoldAmount = 100, userUid = BATCH_UID
    )
    private var lastAgentId: Long? = null
    private val ext = object : CatalogAndReservationExtReadPort {
        override suspend fun agents(userUid: String) = emptyList<Agent>()
        override suspend fun branches(userUid: String, supplierId: Long?) = emptyList<Branch>()
        override suspend fun suppliers(userUid: String) = emptyList<Supplier>()
        override suspend fun priceLists(userUid: String, supplierId: Long?) = emptyList<SupplierPriceListHeader>()
        override suspend fun reservations(userUid: String) = emptyList<Reservation>()
        override suspend fun reservationsByCustomer(userUid: String, customerId: Long) = emptyList<Reservation>()
        override suspend fun reservationsBySupplier(userUid: String, supplierId: Long) = emptyList<Reservation>()
        override suspend fun reservationsByAgent(userUid: String, agentId: Long): List<Reservation> {
            lastAgentId = agentId
            return listOf(reservation)
        }
        override suspend fun reservationsByBranch(userUid: String, branchId: Long) = emptyList<Reservation>()
        override suspend fun openReservations(userUid: String) = emptyList<Reservation>()
        override suspend fun payments(userUid: String, reservationId: Long) = emptyList<Payment>()
        override suspend fun customer(userUid: String, id: Long): Customer? = null
    }

    private fun run(id: Long, supplierId: Long, time: Long, file: String, uid: String = BATCH_UID) =
        SupplierImportRun(
            id = id, supplierId = supplierId, importTime = time, fileName = file, functionCode = 1,
            year = 2026, month = 11, rowsProcessed = 10, rowsCreated = 5, rowsUpdated = 3, rowsClosed = 1,
            rowsCancelled = 0, rowsSkipped = 1, success = true, errorMessage = null,
            fileHash = "secret-hash", userUid = uid
        )

    private val importPort = object : ImportLogReadPort {
        val rows = listOf(
            run(1, 10, 1_000, "alpha.xlsx"),
            run(2, 11, 3_000, "beta.xlsx"),
            run(3, 10, 2_000, "gamma.xlsx"),
            run(4, 10, 9_000, "other-user.xlsx", uid = "someone-else")
        )
        override suspend fun runs(userUid: String, supplierId: Long?) =
            rows.filter { it.userUid == userUid && (supplierId == null || it.supplierId == supplierId) }
                .sortedByDescending { it.importTime }
    }

    private fun api() = RentCarAgentAPI.forAndroidLocalReads(
        EmptySupplierPort, EmptyReservationPort,
        catalogReservationExtReadPort = ext, importLogReadPort = importPort
    )

    @Test
    fun agentHistoryReservationsReusesReservationsByAgent() {
        val response = api().execute(batchRequest("agent.history.reservations", mapOf("agentId" to 7)))
        assertTrue(response.error?.message, response.success)
        assertEquals(7L, lastAgentId)
        assertEquals(1, response.pagination?.totalHint)
    }

    @Test
    fun agentHistoryRequiresValidAgentIdAndRejectsUnknownParams() {
        val api = api()
        assertEquals(
            AgentErrorCode.VALIDATION_FAILED,
            api.execute(batchRequest("agent.history.reservations")).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(batchRequest("agent.history.reservations", mapOf("agentId" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(batchRequest("agent.history.reservations", mapOf("agentId" to 1, "userUid" to "x"))).error?.code
        )
        assertEquals(
            AgentErrorCode.UNSUPPORTED_OPERATION,
            api.execute(
                batchRequest("agent.history.reservations", mapOf("agentId" to 1), AgentExecutionTarget.CLOUD)
            ).error?.code
        )
    }

    @Test
    fun importLogListIsUidScopedSortedAndOmitsFileHash() {
        val response = api().execute(batchRequest("import.log.list"))
        assertTrue(response.error?.message, response.success)
        val json = com.google.gson.Gson().toJsonTree(response.data).asJsonObject
        val items = json["items"].asJsonArray
        assertEquals(listOf("beta.xlsx", "gamma.xlsx", "alpha.xlsx"), items.map { it.asJsonObject["fileName"].asString })
        assertFalse(items.toString().contains("secret-hash"))
        assertFalse(items.toString().contains("other-user"))
    }

    @Test
    fun importLogListFiltersAndPaginates() {
        val api = api()
        val bySupplier = api.execute(batchRequest("import.log.list", mapOf("supplierId" to 10)))
        assertEquals(2, bySupplier.pagination?.totalHint)
        val byQuery = api.execute(batchRequest("import.log.list", mapOf("query" to "ALPHA")))
        assertEquals(1, byQuery.pagination?.totalHint)
        val page = api.execute(batchRequest("import.log.list", mapOf("limit" to 1, "offset" to 1)))
        assertEquals(true, page.pagination?.hasMore)
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(batchRequest("import.log.list", mapOf("supplierId" to -1))).error?.code
        )
    }

    @Test
    fun importLogUnwiredStaysDisabled() {
        val api = RentCarAgentAPI.forAndroidLocalReads(EmptySupplierPort, EmptyReservationPort)
        assertFalse("import.log.list" in api.wiredExecutableOperations)
        val response = api.execute(batchRequest("import.log.list"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
    }

    @Test
    fun newReadsAreAllowlistedAndWired() {
        val api = api()
        assertTrue("agent.history.reservations" in api.wiredExecutableOperations)
        assertTrue("import.log.list" in api.wiredExecutableOperations)
        assertTrue(AgentExecutableAllowlist.isLocalReadEnabled("import.log.list"))
        val registry = AgentCapabilityRegistry.loadDefault()
        assertEquals("IMPLEMENTED", registry.get("import.log.list")!!.implementationStatus.name)
        assertEquals("IMPLEMENTED", registry.get("agent.history.reservations")!!.implementationStatus.name)
    }

    @Test
    fun blockedRemainingReadsStayDisabled() {
        val api = api()
        listOf("terms.load.effective", "reservation.terms.effective", "settings.sync.check").forEach {
            assertFalse(it in api.wiredExecutableOperations)
            val response = api.execute(batchRequest(it))
            assertFalse(it, response.success)
            assertNull(response.data)
            assertEquals(it, AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
        }
    }
}
