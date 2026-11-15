package com.rentacar.app.agentapi

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.rentacar.app.agentapi.dto.ReservationAgentDto
import com.rentacar.app.agentapi.dto.ReservationAgentDtoMapper
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.json.AgentApiJson
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.registry.GeneratedOperationCatalog
import com.rentacar.app.agentapi.reservation.ReservationReadPort
import com.rentacar.app.agentapi.supplier.SupplierReadPort
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * AGENT-012 tests. Uses an in-memory [ReservationReadPort] that mirrors
 * ReservationDao semantics (uid scope + ORDER BY dateFrom DESC).
 */
class AndroidLocalReservationExecutorTest {

    private lateinit var reservationPort: InMemoryReservationReadPort
    private lateinit var supplierPort: InMemorySupplierReadPort
    private lateinit var api: RentCarAgentAPI
    private lateinit var registry: AgentCapabilityRegistry

    private val uid = "test-user-uid"

    @Before
    fun setUp() {
        registry = AgentCapabilityRegistry.loadDefault()
        reservationPort = InMemoryReservationReadPort()
        supplierPort = InMemorySupplierReadPort()
        api = RentCarAgentAPI.forAndroidLocalReads(supplierPort, reservationPort, registry)
    }

    private fun authRequest(
        operation: String,
        requestId: String,
        parameters: Map<String, Any?> = emptyMap(),
        target: AgentExecutionTarget = AgentExecutionTarget.ANDROID_LOCAL,
        auth: AgentAuthContext? = agentLocalAuth(uid)
    ) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = operation,
        requestId = requestId,
        target = target,
        parameters = parameters,
        auth = auth,
        correlationId = "corr-$requestId"
    )

    private fun sample(
        id: Long,
        dateFrom: Long,
        status: ReservationStatus = ReservationStatus.Confirmed,
        supplierOrderNumber: String? = null,
        externalContractNumber: String? = null,
        carTypeName: String? = "Economy",
        userUid: String = uid,
        agreedPrice: Double = 100.0,
        notes: String? = null
    ) = Reservation(
        id = id,
        customerId = 10,
        supplierId = 20,
        branchId = 30,
        carTypeId = 40,
        carTypeName = carTypeName,
        dateFrom = dateFrom,
        dateTo = dateFrom + 86_400_000L,
        agreedPrice = agreedPrice,
        kmIncluded = 200,
        requiredHoldAmount = 1000,
        status = status,
        supplierOrderNumber = supplierOrderNumber,
        externalContractNumber = externalContractNumber,
        notes = notes,
        userUid = userUid
    )

    // TEST 012-01
    @Test
    fun reservationListManageReturnsRepositoryBackedRecords() {
        reservationPort.seed(
            sample(id = 1, dateFrom = 1_000L),
            sample(id = 2, dateFrom = 2_000L)
        )
        val response = api.execute(authRequest("reservation.list.manage", "list-1"))
        assertTrue(response.success)
        val items = items(response.data)
        assertEquals(2, items.size)
        assertEquals(2L, items[0].id)
        assertEquals(1L, items[1].id)
    }

    // TEST 012-02
    @Test
    fun reservationGetReturnsCorrectReservationByInternalId() {
        reservationPort.seed(
            sample(
                id = 7,
                dateFrom = 5_000L,
                supplierOrderNumber = "SO-999",
                externalContractNumber = "EC-111"
            )
        )
        val response = api.execute(authRequest("reservation.get", "get-1", mapOf("id" to 7)))
        assertTrue(response.success)
        val item = item(response.data)
        assertEquals(7L, item.id)
        assertEquals("SO-999", item.supplierOrderNumber)
        assertEquals("EC-111", item.externalContractNumber)
        assertEquals(ReservationStatus.Confirmed.name, item.status)
    }

    // TEST 012-03
    @Test
    fun reservationGetReturnsNotFoundForMissing() {
        val response = api.execute(authRequest("reservation.get", "get-missing", mapOf("id" to 999)))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.NOT_FOUND, response.error?.code)
        assertEquals("get-missing", response.requestId)
    }

    // TEST 012-04
    @Test
    fun reservationGetRejectsInvalidIdentifiers() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("reservation.get", "bad-id", mapOf("id" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("reservation.get", "bad-id2", mapOf("id" to "abc"))).error?.code
        )
        assertEquals(
            AgentErrorCode.VALIDATION_FAILED,
            api.execute(authRequest("reservation.get", "missing-id")).error?.code
        )
    }

    // TEST 012-05
    @Test
    fun reservationListReturnsEmptySuccess() {
        val response = api.execute(authRequest("reservation.list.manage", "empty"))
        assertTrue(response.success)
        assertEquals(0, items(response.data).size)
        assertEquals(0, response.pagination?.totalHint)
    }

    // TEST 012-06
    @Test
    fun reservationListSortingIsDeterministic() {
        reservationPort.seed(
            sample(id = 1, dateFrom = 5_000L),
            sample(id = 3, dateFrom = 5_000L),
            sample(id = 2, dateFrom = 9_000L)
        )
        val ids = items(api.execute(authRequest("reservation.list.manage", "sort")).data).map { it.id }
        assertEquals(listOf(2L, 3L, 1L), ids)
    }

    // TEST 012-07
    @Test
    fun paginationReturnsCorrectRecords() {
        reservationPort.seed(
            sample(id = 1, dateFrom = 1_000L),
            sample(id = 2, dateFrom = 2_000L),
            sample(id = 3, dateFrom = 3_000L)
        )
        val page = api.execute(
            authRequest(
                "reservation.list.manage",
                "page",
                mapOf("limit" to 1, "offset" to 1)
            )
        )
        assertTrue(page.success)
        assertEquals(listOf(2L), items(page.data).map { it.id })
        assertEquals(true, page.pagination!!.hasMore)
        assertEquals(3, page.pagination!!.totalHint)
    }

    // TEST 012-08
    @Test
    fun invalidPaginationRejected() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(
                authRequest("reservation.list.manage", "neg-off", mapOf("offset" to -1))
            ).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(
                authRequest("reservation.list.manage", "bad-lim", mapOf("limit" to 0))
            ).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(
                authRequest("reservation.list.manage", "huge", mapOf("limit" to 201))
            ).error?.code
        )
    }

    // TEST 012-09
    @Test
    fun supportedQueryFilterReturnsCorrectResults() {
        reservationPort.seed(
            sample(id = 10, dateFrom = 1_000L, supplierOrderNumber = "ALPHA-1"),
            sample(id = 11, dateFrom = 2_000L, supplierOrderNumber = "BETA-2"),
            sample(id = 12, dateFrom = 3_000L, carTypeName = "SUV Premium")
        )
        val byOrder = items(
            api.execute(authRequest("reservation.list.manage", "q1", mapOf("query" to "alpha"))).data
        )
        assertEquals(listOf(10L), byOrder.map { it.id })

        val byId = items(
            api.execute(authRequest("reservation.list.manage", "q2", mapOf("query" to "11"))).data
        )
        assertEquals(listOf(11L), byId.map { it.id })

        val byCar = items(
            api.execute(authRequest("reservation.list.manage", "q3", mapOf("query" to "suv"))).data
        )
        assertEquals(listOf(12L), byCar.map { it.id })
    }

    // TEST 012-10
    @Test
    fun unsupportedFiltersAreRejected() {
        val statusFilter = api.execute(
            authRequest("reservation.list.manage", "bad-status", mapOf("status" to "Confirmed"))
        )
        assertFalse(statusFilter.success)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, statusFilter.error?.code)

        val supplierFilter = api.execute(
            authRequest("reservation.list.manage", "bad-sup", mapOf("supplierId" to 20))
        )
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, supplierFilter.error?.code)
    }

    // TEST 012-11
    @Test
    fun internalIdAndExternalIdentifiersRemainDistinct() {
        reservationPort.seed(
            sample(
                id = 42,
                dateFrom = 1_000L,
                supplierOrderNumber = "99",
                externalContractNumber = "42"
            )
        )
        // get by internal id works
        assertTrue(api.execute(authRequest("reservation.get", "id-ok", mapOf("id" to 42))).success)

        // get does not accept supplier order number as id parameter type confusion:
        // numeric string "99" would look up id=99 which does not exist
        val byOrderAsId = api.execute(authRequest("reservation.get", "not-order", mapOf("id" to 99)))
        assertEquals(AgentErrorCode.NOT_FOUND, byOrderAsId.error?.code)

        // undeclared supplierOrderNumber param rejected
        val wrongParam = api.execute(
            authRequest(
                "reservation.get",
                "wrong-param",
                mapOf("id" to 42, "supplierOrderNumber" to "99")
            )
        )
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, wrongParam.error?.code)

        // list query may match supplierOrderNumber text without treating it as Room id
        val listed = items(
            api.execute(authRequest("reservation.list.manage", "q-order", mapOf("query" to "99"))).data
        )
        assertEquals(1, listed.size)
        assertEquals(42L, listed[0].id)
        assertEquals("99", listed[0].supplierOrderNumber)
    }

    // TEST 012-12
    @Test
    fun unauthorizedCallersCannotAccessReservations() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        var queried = false
        val tracking = object : ReservationReadPort {
            override suspend fun listForUser(userUid: String): List<Reservation> {
                queried = true
                return emptyList()
            }

            override suspend fun getByIdForUser(id: Long, userUid: String): Reservation? {
                queried = true
                return null
            }
        }
        val secured = RentCarAgentAPI.forAndroidLocalReservationReads(tracking, registry)
        val noAuth = secured.execute(authRequest("reservation.list.manage", "no-auth", auth = null))
        assertEquals(AgentErrorCode.UNAUTHORIZED, noAuth.error?.code)
        assertFalse(queried)

        val noPerm = secured.execute(
            authRequest(
                "reservation.list.manage",
                "no-perm",
                auth = AgentAuthContext(userUid = uid, permissions = emptyList())
            )
        )
        assertEquals(AgentErrorCode.FORBIDDEN, noPerm.error?.code)
        assertFalse(queried)
    }

    // TEST 012-13
    @Test
    fun otherScopeRecordsAreNotReturned() {
        reservationPort.seed(
            sample(id = 1, dateFrom = 2_000L, userUid = uid),
            sample(id = 2, dateFrom = 3_000L, userUid = "other-uid")
        )
        val list = items(api.execute(authRequest("reservation.list.manage", "iso")).data)
        assertEquals(listOf(1L), list.map { it.id })
        val missing = api.execute(authRequest("reservation.get", "iso-get", mapOf("id" to 2)))
        assertEquals(AgentErrorCode.NOT_FOUND, missing.error?.code)
    }

    // TEST 012-14
    @Test
    fun bothOperationsReturnSourceLocal() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val list = api.execute(authRequest("reservation.list.manage", "src-list"))
        val get = api.execute(authRequest("reservation.get", "src-get", mapOf("id" to 1)))
        assertEquals(AgentDataSource.LOCAL, list.metadata.source)
        assertEquals(AgentDataSource.LOCAL, get.metadata.source)
    }

    // TEST 012-15
    @Test
    fun unknownSyncStatusIsAccurate() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val response = api.execute(authRequest("reservation.get", "sync", mapOf("id" to 1)))
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertNull(response.metadata.lastSuccessfulSyncEpochMs)
    }

    // TEST 012-16
    @Test
    fun repositoryFailuresReturnStructuredErrors() {
        val failing = object : ReservationReadPort {
            override suspend fun listForUser(userUid: String): List<Reservation> {
                error("boom")
            }

            override suspend fun getByIdForUser(id: Long, userUid: String): Reservation? {
                error("boom")
            }
        }
        val failingApi = RentCarAgentAPI.forAndroidLocalReservationReads(failing, registry)
        val response = failingApi.execute(authRequest("reservation.list.manage", "fail"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.INTERNAL_ERROR, response.error?.code)
        assertEquals("fail", response.requestId)
        assertNull(response.data)
    }

    // TEST 012-17
    @Test
    fun requestCorrelationIdsPreserved() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val response = api.execute(authRequest("reservation.get", "corr-req", mapOf("id" to 1)))
        assertEquals("corr-req", response.requestId)
        assertEquals("corr-corr-req", response.correlationId)
    }

    // TEST 012-18
    @Test
    fun reservationDtoSerializesCorrectly() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L, agreedPrice = 250.5))
        val response = api.execute(authRequest("reservation.get", "ser", mapOf("id" to 1)))
        val json = AgentApiJson.toJson(response)
        val roundTrip = AgentApiJson.responseFromJson(json)
        assertTrue(roundTrip.success)
        assertNotNull(roundTrip.data)
    }

    // TEST 012-19
    @Test
    fun restrictedFieldsAreNotLeaked() {
        reservationPort.seed(
            sample(
                id = 1,
                dateFrom = 1_000L,
                notes = "card 4111111111111111 secret"
            )
        )
        val response = api.execute(authRequest("reservation.get", "restrict", mapOf("id" to 1)))
        val json = Gson().toJson(response.data)
        ReservationAgentDtoMapper.restrictedFieldNames().forEach { field ->
            assertFalse("Restricted field leaked: $field", json.contains(field, ignoreCase = true))
        }
        assertFalse(json.contains("4111111111111111"))
        assertFalse(json.contains("secret"))
        assertFalse(json.contains(uid))
    }

    // TEST 012-20
    @Test
    fun readsDoNotModifyDatabaseRecords() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val before = reservationPort.snapshot()
        api.execute(authRequest("reservation.list.manage", "no-mutate"))
        api.execute(authRequest("reservation.get", "no-mutate-get", mapOf("id" to 1)))
        assertEquals(before, reservationPort.snapshot())
        assertEquals(0, reservationPort.mutationCount)
    }

    // TEST 012-21
    @Test
    fun existingSupplierOperationsStillWork() {
        supplierPort.seed(Supplier(id = 1, name = "Alpha Rent", userUid = uid))
        val list = api.execute(authRequest("supplier.list", "sup-list"))
        assertTrue(list.success)
        val get = api.execute(authRequest("supplier.get", "sup-get", mapOf("id" to 1)))
        assertTrue(get.success)
    }

    // TEST 012-22
    @Test
    fun allWriteOperationsRemainDisabled() {
        val writes = registry.writes()
        assertEquals(GeneratedOperationCatalog.EXPECTED_WRITE, writes.size)
        writes.forEach { op ->
            @Suppress("UNCHECKED_CAST")
            val required = (op.inputSchema["required"] as? List<*>)?.mapNotNull { it as? String }.orEmpty()
            val params = required.associateWith { "1" as Any? }
            val response = api.execute(authRequest(op.operationId, "w-${op.operationId}", params))
            assertFalse(response.success)
            assertEquals(
                "Expected WRITE_DISABLED for ${op.operationId}, got ${response.error?.code}",
                AgentErrorCode.WRITE_DISABLED,
                response.error?.code
            )
        }
    }

    // TEST 012-23
    @Test
    fun otherUnimplementedOperationsRemainDisabled() {
        val response = api.execute(authRequest("customer.list", "cust-disabled"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
    }

    // TEST 012-24
    @Test
    fun cloudExecutionRemainsRejected() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val response = api.execute(
            authRequest(
                "reservation.list.manage",
                "cloud",
                target = AgentExecutionTarget.CLOUD
            )
        )
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
    }

    // TEST 012-25 / coverage
    @Test
    fun wiredDiscoveryReportsFourExecutableLocalOps() {
        val doc = api.discover()
        assertEquals(4, doc.executableOperations)
        assertEquals(
            setOf(
                "supplier.list",
                "supplier.get",
                "reservation.list.manage",
                "reservation.get"
            ),
            doc.operations.filter { it.executable }.map { it.operationId }.toSet()
        )
        assertEquals(GeneratedOperationCatalog.IMPLEMENTED_LOCAL_READS, api.wiredExecutableOperations.size)
    }

    @Test
    fun reservationOpsAreCatalogImplemented() {
        assertEquals("IMPLEMENTED", registry.get("reservation.list.manage")!!.implementationStatus.name)
        assertEquals("IMPLEMENTED", registry.get("reservation.get")!!.implementationStatus.name)
        assertFalse(registry.get("reservation.list.manage")!!.executable)
        assertFalse(registry.get("reservation.get")!!.executable)
    }

    @Test
    fun autoTargetResolvesToLocal() {
        reservationPort.seed(sample(id = 1, dateFrom = 1_000L))
        val response = api.execute(
            authRequest("reservation.list.manage", "auto", target = AgentExecutionTarget.AUTO)
        )
        assertTrue(response.success)
        assertEquals(AgentExecutionTarget.ANDROID_LOCAL, response.metadata.executionTarget)
    }

    @Suppress("UNCHECKED_CAST")
    private fun items(data: Any?): List<ReservationAgentDto> {
        val map = data as Map<*, *>
        val raw = map["items"] as List<*>
        val gson = Gson()
        val type = object : TypeToken<List<ReservationAgentDto>>() {}.type
        return gson.fromJson(gson.toJson(raw), type)
    }

    @Suppress("UNCHECKED_CAST")
    private fun item(data: Any?): ReservationAgentDto {
        val map = data as Map<*, *>
        return Gson().fromJson(Gson().toJson(map["item"]), ReservationAgentDto::class.java)
    }
}

/**
 * In-memory port mirroring ReservationDao.getAll ORDER BY dateFrom DESC + uid filter.
 */
class InMemoryReservationReadPort : ReservationReadPort {
    private val rows = linkedMapOf<Long, Reservation>()
    var mutationCount: Int = 0
        private set

    fun seed(vararg reservations: Reservation) {
        reservations.forEach { rows[it.id] = it }
    }

    fun snapshot(): Map<Long, Reservation> = rows.toMap()

    override suspend fun listForUser(userUid: String): List<Reservation> =
        rows.values
            .filter { it.userUid == userUid }
            .sortedWith(compareByDescending<Reservation> { it.dateFrom }.thenByDescending { it.id })

    override suspend fun getByIdForUser(id: Long, userUid: String): Reservation? =
        rows[id]?.takeIf { it.userUid == userUid }
}
