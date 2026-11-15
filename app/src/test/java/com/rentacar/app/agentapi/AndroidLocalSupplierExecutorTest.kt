package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.dto.SupplierAgentDto
import com.rentacar.app.agentapi.dto.SupplierAgentDtoMapper
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
import com.rentacar.app.agentapi.supplier.SupplierReadPort
import com.rentacar.app.data.Supplier
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * AGENT-010 tests. Uses an in-memory [SupplierReadPort] that mirrors
 * SupplierDao semantics (uid scope + ORDER BY name).
 */
class AndroidLocalSupplierExecutorTest {

    private lateinit var port: InMemorySupplierReadPort
    private lateinit var api: RentCarAgentAPI
    private lateinit var registry: AgentCapabilityRegistry

    private val uid = "test-user-uid"

    @Before
    fun setUp() {
        registry = AgentCapabilityRegistry.loadDefault()
        port = InMemorySupplierReadPort()
        api = RentCarAgentAPI.forAndroidLocalSupplierReads(port, registry)
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

    // TEST 010-01
    @Test
    fun supplierListReturnsRepositoryBackedRecords() {
        port.seed(
            Supplier(id = 1, name = "Beta Cars", userUid = uid),
            Supplier(id = 2, name = "Alpha Rent", userUid = uid)
        )
        val response = api.execute(authRequest("supplier.list", "list-1"))
        assertTrue(response.success)
        val items = items(response.data)
        assertEquals(2, items.size)
        assertEquals("Alpha Rent", items[0].name)
        assertEquals("Beta Cars", items[1].name)
    }

    // TEST 010-02
    @Test
    fun supplierGetReturnsCorrectSupplierById() {
        port.seed(Supplier(id = 7, name = "Shagrir", phone = "03-123", userUid = uid))
        val response = api.execute(authRequest("supplier.get", "get-1", mapOf("id" to 7)))
        assertTrue(response.success)
        val item = item(response.data)
        assertEquals(7L, item.id)
        assertEquals("Shagrir", item.name)
        assertEquals("03-123", item.phone)
    }

    // TEST 010-03
    @Test
    fun supplierGetReturnsNotFoundForMissingSupplier() {
        val response = api.execute(authRequest("supplier.get", "get-missing", mapOf("id" to 999)))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.NOT_FOUND, response.error?.code)
        assertEquals("get-missing", response.requestId)
    }

    // TEST 010-04
    @Test
    fun supplierGetRejectsInvalidIdentifiers() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.get", "bad-id", mapOf("id" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.get", "bad-id2", mapOf("id" to "abc"))).error?.code
        )
        assertEquals(
            AgentErrorCode.VALIDATION_FAILED,
            api.execute(authRequest("supplier.get", "missing-id")).error?.code
        )
    }

    // TEST 010-05
    @Test
    fun supplierListReturnsEmptySuccessWhenNoSuppliers() {
        val response = api.execute(authRequest("supplier.list", "empty"))
        assertTrue(response.success)
        assertEquals(0, items(response.data).size)
        assertEquals(0, (response.data as Map<*, *>)["totalMatching"])
    }

    // TEST 010-06
    @Test
    fun supplierListIsDeterministicallyOrdered() {
        port.seed(
            Supplier(id = 3, name = "zeta", userUid = uid),
            Supplier(id = 1, name = "Alpha", userUid = uid),
            Supplier(id = 2, name = "alpha", userUid = uid)
        )
        val names = items(api.execute(authRequest("supplier.list", "order")).data).map { it.name }
        assertEquals(listOf("Alpha", "alpha", "zeta"), names)
    }

    // TEST 010-07
    @Test
    fun supplierListHandlesPagination() {
        port.seed(
            *(1..5).map { Supplier(id = it.toLong(), name = "S$it", userUid = uid) }.toTypedArray()
        )
        val page = api.execute(
            authRequest("supplier.list", "page", mapOf("limit" to 2, "offset" to 1))
        )
        assertTrue(page.success)
        assertEquals(2, items(page.data).size)
        assertEquals(true, page.pagination?.hasMore)
        assertEquals(5, page.pagination?.totalHint)
        assertEquals(2, page.pagination?.limit)
        assertEquals(1, page.pagination?.offset)
    }

    // TEST 010-08
    @Test
    fun supplierListRejectsUnsupportedOrInvalidFilters() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.list", "sid", mapOf("supplierId" to 1))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.list", "bad-limit", mapOf("limit" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.list", "huge", mapOf("limit" to 500))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("supplier.list", "unknown", mapOf("status" to "ACTIVE"))).error?.code
        )
    }

    // TEST 010-09 / 010-10
    @Test
    fun supplierReadsReportLocalSourceAndUnknownSync() {
        port.seed(Supplier(id = 1, name = "A", userUid = uid))
        val list = api.execute(authRequest("supplier.list", "meta-list"))
        val get = api.execute(authRequest("supplier.get", "meta-get", mapOf("id" to 1)))
        assertEquals(AgentDataSource.LOCAL, list.metadata.source)
        assertEquals(AgentDataSource.LOCAL, get.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, list.metadata.syncStatus)
        assertEquals(AgentSyncStatus.UNKNOWN, get.metadata.syncStatus)
        assertNull(list.metadata.lastSuccessfulSyncEpochMs)
        assertNull(get.metadata.lastSuccessfulSyncEpochMs)
    }

    // TEST 010-11
    @Test
    fun repositoryExceptionsReturnStructuredFailures() {
        val failing = object : SupplierReadPort {
            override suspend fun listForUser(userUid: String): List<Supplier> {
                throw IllegalStateException("boom")
            }

            override suspend fun getByIdForUser(id: Long, userUid: String): Supplier? {
                throw IllegalStateException("boom")
            }
        }
        val failingApi = RentCarAgentAPI.forAndroidLocalSupplierReads(failing, registry)
        val response = failingApi.execute(authRequest("supplier.list", "boom"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.INTERNAL_ERROR, response.error?.code)
        assertNull(response.data)
    }

    // TEST 010-12
    @Test
    fun requestIdsArePreserved() {
        val response = api.execute(authRequest("supplier.list", "preserve-id"))
        assertEquals("preserve-id", response.requestId)
        assertEquals("corr-preserve-id", response.correlationId)
    }

    // TEST 010-13
    @Test
    fun unimplementedOperationsRemainDisabled() {
        val response = api.execute(authRequest("branch.list", "still-disabled"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
    }

    // TEST 010-14
    @Test
    fun writeOperationsRemainDisabled() {
        val write = registry.writes().first().operationId
        val response = api.execute(authRequest(write, "write-disabled"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.WRITE_DISABLED, response.error?.code)
    }

    // TEST 010-15
    @Test
    fun cloudExecutionIsRejected() {
        port.seed(Supplier(id = 1, name = "A", userUid = uid))
        val response = api.execute(
            authRequest("supplier.list", "cloud", target = AgentExecutionTarget.CLOUD)
        )
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
    }

    // TEST 010-16
    @Test
    fun unauthorizedRequestsDoNotQueryRepository() {
        var queried = false
        val tracking = object : SupplierReadPort {
            override suspend fun listForUser(userUid: String): List<Supplier> {
                queried = true
                return emptyList()
            }

            override suspend fun getByIdForUser(id: Long, userUid: String): Supplier? {
                queried = true
                return null
            }
        }
        val secured = RentCarAgentAPI.forAndroidLocalSupplierReads(tracking, registry)
        val noAuth = secured.execute(
            authRequest("supplier.list", "no-auth", auth = null)
        )
        assertEquals(AgentErrorCode.UNAUTHORIZED, noAuth.error?.code)
        assertFalse(queried)

        val noPerm = secured.execute(
            authRequest(
                "supplier.list",
                "no-perm",
                auth = AgentAuthContext(userUid = uid, permissions = emptyList())
            )
        )
        assertEquals(AgentErrorCode.FORBIDDEN, noPerm.error?.code)
        assertFalse(queried)
    }

    // TEST 010-17
    @Test
    fun supplierDtoSerializationIsValid() {
        port.seed(Supplier(id = 1, name = "Ser", email = "a@b.com", userUid = uid))
        val response = api.execute(authRequest("supplier.get", "ser", mapOf("id" to 1)))
        val json = AgentApiJson.toJson(response)
        val roundTrip = AgentApiJson.responseFromJson(json)
        assertTrue(roundTrip.success)
        assertNotNull(roundTrip.data)
    }

    // TEST 010-18
    @Test
    fun supplierResponseOmitsRestrictedFields() {
        port.seed(
            Supplier(
                id = 1,
                name = "Secure",
                commissionReportEmail = "secret-mailbox@example.com",
                importFunctionCode = 1,
                userUid = uid
            )
        )
        val response = api.execute(authRequest("supplier.get", "restrict", mapOf("id" to 1)))
        val json = Gson().toJson(response.data)
        SupplierAgentDtoMapper.restrictedFieldNames().forEach { field ->
            assertFalse("Restricted field leaked: $field", json.contains(field, ignoreCase = true))
        }
        assertFalse(json.contains("secret-mailbox@example.com"))
        val item = item(response.data)
        assertEquals("Secure", item.name)
    }

    // TEST 010-19
    @Test
    fun executorDoesNotModifySupplierRecords() {
        port.seed(Supplier(id = 1, name = "Immutable", userUid = uid))
        val before = port.snapshot()
        api.execute(authRequest("supplier.list", "no-mutate"))
        api.execute(authRequest("supplier.get", "no-mutate-get", mapOf("id" to 1)))
        assertEquals(before, port.snapshot())
        assertEquals(0, port.mutationCount)
    }

    // TEST 010-20 covered by AgentApiContractTest still passing in suite

    @Test
    fun wiredDiscoveryReportsTwoExecutableLocalOps() {
        val doc = api.discover()
        assertEquals(2, doc.executableOperations)
        assertEquals(
            setOf("supplier.list", "supplier.get"),
            doc.operations.filter { it.executable }.map { it.operationId }.toSet()
        )
        assertEquals(GeneratedOperationCatalog.AGENT_010_IMPLEMENTED_LOCAL_READS, api.wiredExecutableOperations.size)
    }

    @Test
    fun queryFilterMatchesUiNameContainsSemantics() {
        port.seed(
            Supplier(id = 1, name = "Shagrir Fleet", userUid = uid),
            Supplier(id = 2, name = "Other", userUid = uid)
        )
        val response = api.execute(authRequest("supplier.list", "q", mapOf("query" to "shag")))
        assertEquals(listOf("Shagrir Fleet"), items(response.data).map { it.name })
    }

    @Test
    fun autoTargetResolvesToLocal() {
        port.seed(Supplier(id = 1, name = "A", userUid = uid))
        val response = api.execute(
            authRequest("supplier.list", "auto", target = AgentExecutionTarget.AUTO)
        )
        assertTrue(response.success)
        assertEquals(AgentExecutionTarget.ANDROID_LOCAL, response.metadata.executionTarget)
    }

    @Test
    fun uidIsolationPreventsCrossTenantReads() {
        port.seed(
            Supplier(id = 1, name = "Mine", userUid = uid),
            Supplier(id = 2, name = "OtherUser", userUid = "someone-else")
        )
        val list = items(api.execute(authRequest("supplier.list", "iso")).data)
        assertEquals(listOf("Mine"), list.map { it.name })
        val missing = api.execute(authRequest("supplier.get", "iso-get", mapOf("id" to 2)))
        assertEquals(AgentErrorCode.NOT_FOUND, missing.error?.code)
    }

    @Suppress("UNCHECKED_CAST")
    private fun items(data: Any?): List<SupplierAgentDto> {
        val map = data as Map<*, *>
        val raw = map["items"] as List<*>
        val gson = Gson()
        val type = object : TypeToken<List<SupplierAgentDto>>() {}.type
        return gson.fromJson(gson.toJson(raw), type)
    }

    @Suppress("UNCHECKED_CAST")
    private fun item(data: Any?): SupplierAgentDto {
        val map = data as Map<*, *>
        return Gson().fromJson(Gson().toJson(map["item"]), SupplierAgentDto::class.java)
    }
}

/**
 * In-memory port mirroring SupplierDao.getAll ORDER BY name + uid filter.
 */
class InMemorySupplierReadPort : SupplierReadPort {
    private val rows = linkedMapOf<Long, Supplier>()
    var mutationCount: Int = 0
        private set

    fun seed(vararg suppliers: Supplier) {
        suppliers.forEach { rows[it.id] = it }
    }

    fun snapshot(): Map<Long, Supplier> = rows.toMap()

    override suspend fun listForUser(userUid: String): List<Supplier> =
        rows.values.filter { it.userUid == userUid }.sortedBy { it.name }

    override suspend fun getByIdForUser(id: Long, userUid: String): Supplier? =
        rows[id]?.takeIf { it.userUid == userUid }
}
