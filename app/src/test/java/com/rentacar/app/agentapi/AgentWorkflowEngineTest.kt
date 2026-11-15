package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.dto.CustomerAgentDto
import com.rentacar.app.agentapi.dto.ReservationAgentDto
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.ports.CatalogAndReservationExtReadPort
import com.rentacar.app.agentapi.ports.FinanceReadPort
import com.rentacar.app.agentapi.ports.SalesReadPort
import com.rentacar.app.agentapi.workflows.AgentWorkflow
import com.rentacar.app.agentapi.workflows.AgentWorkflowEngine
import com.rentacar.app.agentapi.workflows.FindCustomerAndListReservationsWorkflow
import com.rentacar.app.agentapi.workflows.UnpaidCommissionSummaryWorkflow
import com.rentacar.app.agentapi.workflows.WorkflowContext
import com.rentacar.app.agentapi.workflows.WorkflowResult
import com.rentacar.app.data.Agent
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CarSale
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Payment
import com.rentacar.app.data.Request
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierPriceListHeader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.Instant

/** AGENT-061: read-only workflow stubs composed from existing local-read operations (fixtures only). */
class AgentWorkflowEngineTest {
    private val uidA = "wf-user-a"
    private val uidB = "wf-user-b"

    private val customers = InMemoryCustomerReadPort().also {
        it.seed(
            Customer(id = 1, firstName = "Alice", lastName = "Alpha", phone = "050-1", userUid = uidA),
            Customer(id = 3, firstName = "Alina", lastName = "Alpha", phone = "050-3", userUid = uidA),
            Customer(id = 2, firstName = "Alice", lastName = "Beta", phone = "050-2", userUid = uidB)
        )
    }

    private fun reservation(id: Long, customerId: Long, uid: String, from: String = "2026-01-10T10:00:00Z", to: String = "2026-01-15T10:00:00Z") =
        Reservation(
            id = id, customerId = customerId, supplierId = 2, branchId = 3, carTypeId = 4,
            dateFrom = Instant.parse(from).toEpochMilli(), dateTo = Instant.parse(to).toEpochMilli(),
            actualReturnDate = Instant.parse(to).toEpochMilli(),
            agreedPrice = 600.0, kmIncluded = 100, requiredHoldAmount = 1000,
            status = ReservationStatus.Paid, userUid = uid
        )

    private val allReservations = listOf(
        reservation(10, 1, uidA),
        reservation(11, 1, uidA, "2026-02-01T10:00:00Z", "2026-02-03T10:00:00Z"),
        reservation(12, 3, uidA),
        reservation(20, 2, uidB)
    )

    private val extPort = object : CatalogAndReservationExtReadPort {
        override suspend fun agents(userUid: String) = emptyList<Agent>()
        override suspend fun branches(userUid: String, supplierId: Long?) = emptyList<Branch>()
        override suspend fun suppliers(userUid: String) = emptyList<Supplier>()
        override suspend fun priceLists(userUid: String, supplierId: Long?) = emptyList<SupplierPriceListHeader>()
        override suspend fun reservations(userUid: String) = allReservations.filter { it.userUid == userUid }
        override suspend fun reservationsByCustomer(userUid: String, customerId: Long) =
            reservations(userUid).filter { it.customerId == customerId }
        override suspend fun reservationsBySupplier(userUid: String, supplierId: Long) = reservations(userUid)
        override suspend fun reservationsByAgent(userUid: String, agentId: Long) = emptyList<Reservation>()
        override suspend fun reservationsByBranch(userUid: String, branchId: Long) = emptyList<Reservation>()
        override suspend fun openReservations(userUid: String) = reservations(userUid)
        override suspend fun payments(userUid: String, reservationId: Long) = emptyList<Payment>()
        override suspend fun customer(userUid: String, id: Long) =
            customers.snapshot()[id]?.takeIf { it.userUid == userUid }
    }

    private fun sale(id: Long, commission: Double) = CarSale(
        id = id, firstName = "S$id", lastName = "Buyer", phone = "1", carTypeName = "Car",
        saleDate = 1, salePrice = 1000.0, commissionPrice = commission, userUid = uidA
    )

    private val openSale = sale(1, 100.0)
    private val closedSale = sale(2, 50.0)
    private val paid = mapOf(1L to 20.0, 2L to 50.0)

    private val financePort = object : FinanceReadPort {
        override suspend fun reservations(userUid: String) = allReservations.filter { it.userUid == userUid }
        override suspend fun salesWithPaidTotals(userUid: String) = listOf(openSale, closedSale) to paid
    }
    private val salesPort = object : SalesReadPort {
        override suspend fun salesWithPaidTotals(userUid: String) = listOf(openSale, closedSale) to paid
        override suspend fun requests(userUid: String) = emptyList<Request>()
    }

    private val api = RentCarAgentAPI.forAndroidLocalReads(
        EmptySupplierPort, EmptyReservationPort,
        customerReadPort = customers,
        financeReadPort = financePort,
        salesReadPort = salesPort,
        catalogReservationExtReadPort = extPort
    )
    private val engine = AgentWorkflowEngine(api)
    private val authA = agentLocalAuth(uidA)

    @Suppress("UNCHECKED_CAST")
    private fun matches(result: WorkflowResult) = result.data!!["matches"] as List<Map<String, Any?>>

    // ---- FindCustomerAndListReservations ----

    @Test
    fun findCustomerGroupsReservationsPerMatchWithoutPickingOne() {
        val result = engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Ali"), authA)
        assertTrue(result.error?.message, result.success)
        assertTrue(result.readOnly)
        val found = matches(result)
        assertEquals(listOf(1L, 3L), found.map { (it["customer"] as CustomerAgentDto).id })
        assertEquals(listOf(2, 1), found.map { it["reservationCount"] })
        val firstReservations = found[0]["reservations"] as List<*>
        assertEquals(listOf(10L, 11L), firstReservations.map { (it as ReservationAgentDto).id })
        assertEquals(
            listOf("customer.list", "reservation.list.byCustomer", "reservation.list.byCustomer"),
            result.steps.map { it.operation }
        )
        assertTrue(result.steps.all { it.success })
        assertTrue(result.warnings.any { it.contains("Multiple customers matched") })
    }

    @Test
    fun findCustomerSingleMatchAndNoMatch() {
        val one = engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Alina"), authA)
        assertEquals(1, matches(one).size)
        assertTrue(one.warnings.isEmpty())

        val none = engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Zed"), authA)
        assertTrue(none.success)
        assertTrue(matches(none).isEmpty())
        assertEquals(listOf("customer.list"), none.steps.map { it.operation })
        assertTrue(none.warnings.any { it.contains("No customer matched") })
    }

    @Test
    fun findCustomerIsIsolatedPerUser() {
        val asB = engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Alice"), agentLocalAuth(uidB))
        val found = matches(asB)
        assertEquals(listOf(2L), found.map { (it["customer"] as CustomerAgentDto).id })
        assertEquals(listOf(20L), (found[0]["reservations"] as List<*>).map { (it as ReservationAgentDto).id })
        // A's data never shows up for B, and B's never for A.
        val asA = engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Beta"), authA)
        assertTrue(matches(asA).isEmpty())
    }

    @Test
    fun findCustomerCapsExpandedMatchesAndWarns() {
        val result = engine.run(
            FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Alpha", "maxCustomers" to 1), authA
        )
        assertTrue(result.success)
        assertEquals(1, matches(result).size)
        assertEquals(2, result.data!!["totalMatchingCustomers"])
        assertTrue(result.warnings.any { it.contains("Only the first 1 of 2") })
    }

    @Test
    fun findCustomerValidatesParameters() {
        val id = FindCustomerAndListReservationsWorkflow.ID
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, engine.run(id, emptyMap(), authA).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, engine.run(id, mapOf("query" to "  "), authA).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, engine.run(id, mapOf("query" to "a", "maxCustomers" to 0), authA).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, engine.run(id, mapOf("query" to "a", "maxCustomers" to 99), authA).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, engine.run(id, mapOf("query" to "a", "maxCustomers" to "2"), authA).error?.code)
    }

    @Test
    fun findCustomerPropagatesStepFailureWithoutLeakingData() {
        // No catalog/reservation port wired: reservation.list.byCustomer is not executable.
        val partial = AgentWorkflowEngine(
            RentCarAgentAPI.forAndroidLocalReads(EmptySupplierPort, EmptyReservationPort, customerReadPort = customers)
        )
        val result = partial.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Alina"), authA)
        assertFalse(result.success)
        assertNotNull(result.error)
        assertNull(result.data)
        assertEquals(listOf(true, false), result.steps.map { it.success })
        assertEquals("reservation.list.byCustomer", result.steps.last().operation)
    }

    // ---- UnpaidCommissionSummary ----

    @Test
    fun unpaidCommissionSummaryComposesReservationAndCarSaleTotals() {
        val result = engine.run(UnpaidCommissionSummaryWorkflow.ID, mapOf("payoutMonth" to "2026-02"), authA)
        assertTrue(result.error?.message, result.success)
        assertEquals(listOf("commission.summary.totals", "carSale.commission.totals"), result.steps.map { it.operation })
        val data = result.data!!
        assertEquals("2026-02", data["payoutMonth"])
        @Suppress("UNCHECKED_CAST")
        val reservation = data["reservationCommission"] as Map<String, Any?>
        assertTrue(reservation["distinctReservationCount"] is Int)
        assertTrue(reservation["totalCommission"] is Number)
        @Suppress("UNCHECKED_CAST")
        val carSales = data["carSaleCommissionOpen"] as Map<String, Any?>
        // Only the open sale (commission 100, paid 20) is counted; the fully paid one is excluded.
        assertEquals(1, carSales["count"])
        assertEquals(100.0, carSales["sumCommissionPrice"])
        assertEquals(20.0, carSales["sumPaid"])
        assertEquals(80.0, carSales["sumRemaining"])
        assertEquals(2, result.warnings.size)
    }

    @Test
    fun unpaidCommissionSummaryPassesSupplierFilterThrough() {
        val withSupplier = engine.run(
            UnpaidCommissionSummaryWorkflow.ID, mapOf("payoutMonth" to "2026-02", "supplierId" to 2), authA
        )
        assertTrue(withSupplier.success)
        val other = engine.run(
            UnpaidCommissionSummaryWorkflow.ID, mapOf("payoutMonth" to "2026-02", "supplierId" to 999), authA
        )
        assertTrue(other.success)
        @Suppress("UNCHECKED_CAST")
        val otherReservation = other.data!!["reservationCommission"] as Map<String, Any?>
        assertEquals(0, otherReservation["distinctReservationCount"])
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            engine.run(UnpaidCommissionSummaryWorkflow.ID, mapOf("payoutMonth" to "2026-02", "supplierId" to -1), authA)
                .error?.code
        )
    }

    @Test
    fun unpaidCommissionSummaryValidatesPayoutMonth() {
        val id = UnpaidCommissionSummaryWorkflow.ID
        listOf<Map<String, Any?>>(emptyMap(), mapOf("payoutMonth" to "2026-13"), mapOf("payoutMonth" to "Feb 2026"), mapOf("payoutMonth" to 202602))
            .forEach { params ->
                val result = engine.run(id, params, authA)
                assertFalse(params.toString(), result.success)
                assertEquals(params.toString(), AgentErrorCode.INVALID_ARGUMENT, result.error?.code)
                assertTrue(result.steps.isEmpty())
            }
    }

    // ---- engine guarantees ----

    @Test
    fun engineRejectsMissingIdentityUnknownWorkflowsAndIdentityParameters() {
        val id = FindCustomerAndListReservationsWorkflow.ID
        assertEquals(AgentErrorCode.UNAUTHORIZED, engine.run(id, mapOf("query" to "a"), null).error?.code)
        assertEquals(
            AgentErrorCode.UNAUTHORIZED,
            engine.run(id, mapOf("query" to "a"), AgentAuthContext(userUid = " ", permissions = listOf("AUTHENTICATED"))).error?.code
        )
        assertEquals(AgentErrorCode.UNKNOWN_OPERATION, engine.run("workflow.nope", emptyMap(), authA).error?.code)
        // Identity can never be supplied through workflow parameters.
        val smuggled = engine.run(id, mapOf("query" to "Alice", "userUid" to uidB), authA)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, smuggled.error?.code)
        assertTrue(smuggled.steps.isEmpty())
    }

    @Test
    fun engineRejectsSqlInWorkflowParameters() {
        val result = engine.run(
            FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "x'; DROP TABLE customer; --"), authA
        )
        assertEquals(AgentErrorCode.SQL_NOT_ALLOWED, result.error?.code)
        assertTrue(result.steps.isEmpty())
    }

    @Test
    fun workflowsCanOnlyDeclareAllowlistedReadOperations() {
        fun workflowOf(vararg ops: String) = object : AgentWorkflow {
            override val workflowId = "workflow.test"
            override val description = "test"
            override val allowedOperations = ops.toSet()
            override val allowedParameters = emptySet<String>()
            override fun run(context: WorkflowContext, parameters: Map<String, Any?>) =
                WorkflowResult(workflowId, true)
        }
        listOf("customer.create", "supplier.create", "request.create", "not.registered", "settings.sync.check").forEach { op ->
            try {
                AgentWorkflowEngine(api, listOf(workflowOf(op)))
                fail("workflow declaring '$op' must be rejected")
            } catch (_: IllegalArgumentException) {
            }
        }
        // A declared read is accepted.
        AgentWorkflowEngine(api, listOf(workflowOf("customer.list")))
    }

    @Test
    fun workflowCannotCallAnOperationItDidNotDeclare() {
        val sneaky = object : AgentWorkflow {
            override val workflowId = "workflow.sneaky"
            override val description = "tries to call a write"
            override val allowedOperations = setOf("customer.list")
            override val allowedParameters = emptySet<String>()
            override fun run(context: WorkflowContext, parameters: Map<String, Any?>): WorkflowResult {
                context.call("customer.create", mapOf("firstName" to "x", "lastName" to "y", "phone" to "1"))
                return WorkflowResult(workflowId, true)
            }
        }
        val result = AgentWorkflowEngine(api, listOf(sneaky)).run("workflow.sneaky", emptyMap(), authA)
        assertFalse(result.success)
        assertEquals(AgentErrorCode.INTERNAL_ERROR, result.error?.code)
        assertTrue(result.steps.isEmpty())
        assertEquals(0, customers.mutationCount)
    }

    @Test
    fun defaultEngineExposesExactlyTheTwoWorkflowsAndAllAreReadOnly() {
        assertEquals(
            listOf(FindCustomerAndListReservationsWorkflow.ID, UnpaidCommissionSummaryWorkflow.ID).sorted(),
            engine.workflowIds()
        )
        val writes = api.registry.writes().map { it.operationId }.toSet()
        AgentWorkflowEngine.defaultWorkflows().forEach { workflow ->
            assertTrue(workflow.allowedOperations.none { it in writes })
        }
        assertEquals(2, engine.describe().size)
    }

    @Test
    fun workflowsDoNotMutateFixtures() {
        val before = customers.snapshot()
        engine.run(FindCustomerAndListReservationsWorkflow.ID, mapOf("query" to "Ali"), authA)
        engine.run(UnpaidCommissionSummaryWorkflow.ID, mapOf("payoutMonth" to "2026-02"), authA)
        assertEquals(before, customers.snapshot())
        assertEquals(0, customers.mutationCount)
    }

    private fun assertNull(value: Any?) = org.junit.Assert.assertNull(value)
}
