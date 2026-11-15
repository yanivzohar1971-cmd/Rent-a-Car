package com.rentacar.app.agentapi

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.rentacar.app.agentapi.customer.CustomerReadPort
import com.rentacar.app.agentapi.dto.CustomerAgentDto
import com.rentacar.app.agentapi.dto.CustomerAgentDtoMapper
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
import com.rentacar.app.data.Customer
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
 * AGENT-013 tests. Uses an in-memory [CustomerReadPort] mirroring
 * CustomerDao list/search/get semantics (uid scope + lastName/firstName order).
 */
class AndroidLocalCustomerExecutorTest {

    private lateinit var customerPort: InMemoryCustomerReadPort
    private lateinit var supplierPort: InMemorySupplierReadPort
    private lateinit var reservationPort: InMemoryReservationReadPort
    private lateinit var api: RentCarAgentAPI
    private lateinit var registry: AgentCapabilityRegistry

    private val uid = "test-user-uid"

    @Before
    fun setUp() {
        registry = AgentCapabilityRegistry.loadDefault()
        customerPort = InMemoryCustomerReadPort()
        supplierPort = InMemorySupplierReadPort()
        reservationPort = InMemoryReservationReadPort()
        api = RentCarAgentAPI.forAndroidLocalReads(
            supplierReadPort = supplierPort,
            reservationReadPort = reservationPort,
            customerReadPort = customerPort,
            registry = registry
        )
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
        firstName: String,
        lastName: String,
        phone: String = "050-0000000",
        email: String? = null,
        tzId: String? = null,
        address: String? = null,
        active: Boolean = true,
        isCompany: Boolean = false,
        userUid: String = uid
    ) = Customer(
        id = id,
        firstName = firstName,
        lastName = lastName,
        phone = phone,
        tzId = tzId,
        address = address,
        email = email,
        isCompany = isCompany,
        active = active,
        userUid = userUid
    )

    // TEST 013-01
    @Test
    fun customerListReturnsRepositoryBackedRecords() {
        customerPort.seed(
            sample(id = 1, firstName = "Dana", lastName = "Cohen"),
            sample(id = 2, firstName = "Avi", lastName = "Levi")
        )
        val response = api.execute(authRequest("customer.list", "list-1"))
        assertTrue(response.success)
        val listed = items(response.data)
        assertEquals(2, listed.size)
        assertEquals("Cohen", listed[0].lastName)
        assertEquals("Levi", listed[1].lastName)
    }

    // TEST 013-02
    @Test
    fun customerGetReturnsCorrectCustomerByInternalId() {
        customerPort.seed(
            sample(id = 7, firstName = "Noa", lastName = "Bar", phone = "052-111", email = "n@ex.com")
        )
        val response = api.execute(authRequest("customer.get", "get-1", mapOf("id" to 7)))
        assertTrue(response.success)
        val item = item(response.data)
        assertEquals(7L, item.id)
        assertEquals("Noa", item.firstName)
        assertEquals("Bar", item.lastName)
        assertEquals("052-111", item.phone)
        assertEquals("n@ex.com", item.email)
    }

    // TEST 013-03
    @Test
    fun customerGetReturnsNotFoundForMissing() {
        val response = api.execute(authRequest("customer.get", "get-missing", mapOf("id" to 999)))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.NOT_FOUND, response.error?.code)
        assertEquals("get-missing", response.requestId)
    }

    // TEST 013-04
    @Test
    fun customerGetRejectsInvalidIdentifiers() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.get", "bad-id", mapOf("id" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.get", "bad-id2", mapOf("id" to "abc"))).error?.code
        )
        assertEquals(
            AgentErrorCode.VALIDATION_FAILED,
            api.execute(authRequest("customer.get", "missing-id")).error?.code
        )
    }

    // TEST 013-05
    @Test
    fun customerListReturnsEmptySuccess() {
        val response = api.execute(authRequest("customer.list", "empty"))
        assertTrue(response.success)
        assertEquals(0, items(response.data).size)
        assertEquals(0, response.pagination?.totalHint)
    }

    // TEST 013-06
    @Test
    fun customerSortingIsDeterministic() {
        customerPort.seed(
            sample(id = 3, firstName = "B", lastName = "Alpha"),
            sample(id = 1, firstName = "A", lastName = "Alpha"),
            sample(id = 2, firstName = "C", lastName = "Beta")
        )
        val ids = items(api.execute(authRequest("customer.list", "sort")).data).map { it.id }
        assertEquals(listOf(1L, 3L, 2L), ids)
    }

    // TEST 013-07
    @Test
    fun paginationReturnsCorrectRecords() {
        customerPort.seed(
            sample(id = 1, firstName = "A", lastName = "A"),
            sample(id = 2, firstName = "B", lastName = "B"),
            sample(id = 3, firstName = "C", lastName = "C")
        )
        val page = api.execute(
            authRequest("customer.list", "page", mapOf("limit" to 1, "offset" to 1))
        )
        assertTrue(page.success)
        assertEquals(listOf(2L), items(page.data).map { it.id })
        assertEquals(true, page.pagination!!.hasMore)
        assertEquals(3, page.pagination!!.totalHint)
    }

    // TEST 013-08
    @Test
    fun invalidPaginationRejected() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.list", "neg-off", mapOf("offset" to -1))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.list", "bad-lim", mapOf("limit" to 0))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.list", "huge", mapOf("limit" to 201))).error?.code
        )
    }

    // TEST 013-09
    @Test
    fun supportedQueryFilterReturnsCorrectResults() {
        customerPort.seed(
            sample(id = 10, firstName = "Yael", lastName = "Mizrahi", phone = "050-999", email = "yael@ex.com"),
            sample(id = 11, firstName = "Other", lastName = "Person", phone = "050-111", active = false),
            sample(id = 12, firstName = "Active", lastName = "Match", phone = "050-222", tzId = "123456789")
        )
        val byName = items(
            api.execute(authRequest("customer.list", "q1", mapOf("query" to "yael"))).data
        )
        assertEquals(listOf(10L), byName.map { it.id })

        val byPhone = items(
            api.execute(authRequest("customer.list", "q2", mapOf("query" to "050-999"))).data
        )
        assertEquals(listOf(10L), byPhone.map { it.id })

        // Search is active-only (CustomerDao.search); inactive "Other" must not match.
        val inactive = items(
            api.execute(authRequest("customer.list", "q3", mapOf("query" to "Other"))).data
        )
        assertTrue(inactive.isEmpty())

        // Empty query still returns inactive (listAll path).
        val all = items(api.execute(authRequest("customer.list", "all")).data)
        assertEquals(3, all.size)
    }

    // TEST 013-10
    @Test
    fun unsupportedFiltersAreRejected() {
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.list", "bad-active", mapOf("active" to true))).error?.code
        )
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(authRequest("customer.list", "bad-tz", mapOf("tzId" to "123"))).error?.code
        )
    }

    // TEST 013-11
    @Test
    fun internalIdDistinctFromPhoneAndTzId() {
        customerPort.seed(
            sample(
                id = 42,
                firstName = "Id",
                lastName = "Check",
                phone = "99",
                tzId = "42"
            )
        )
        assertTrue(api.execute(authRequest("customer.get", "id-ok", mapOf("id" to 42))).success)

        // Looking up by phone digits as id finds nothing (or wrong row).
        val byPhoneAsId = api.execute(authRequest("customer.get", "not-phone", mapOf("id" to 99)))
        assertEquals(AgentErrorCode.NOT_FOUND, byPhoneAsId.error?.code)

        // Undeclared phone/tzId params rejected on get.
        assertEquals(
            AgentErrorCode.INVALID_ARGUMENT,
            api.execute(
                authRequest("customer.get", "wrong-param", mapOf("id" to 42, "phone" to "99"))
            ).error?.code
        )
    }

    // TEST 013-12
    @Test
    fun unauthorizedCallersCannotAccessCustomers() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        var queried = false
        val tracking = object : CustomerReadPort {
            override suspend fun listForUser(userUid: String): List<Customer> {
                queried = true
                return emptyList()
            }

            override suspend fun searchForUser(query: String, userUid: String): List<Customer> {
                queried = true
                return emptyList()
            }

            override suspend fun getByIdForUser(id: Long, userUid: String): Customer? {
                queried = true
                return null
            }
        }
        val secured = RentCarAgentAPI.forAndroidLocalCustomerReads(tracking, registry)
        val noAuth = secured.execute(authRequest("customer.list", "no-auth", auth = null))
        assertEquals(AgentErrorCode.UNAUTHORIZED, noAuth.error?.code)
        assertFalse(queried)

        val noPerm = secured.execute(
            authRequest(
                "customer.list",
                "no-perm",
                auth = AgentAuthContext(userUid = uid, permissions = emptyList())
            )
        )
        assertEquals(AgentErrorCode.FORBIDDEN, noPerm.error?.code)
        assertFalse(queried)
    }

    // TEST 013-13
    @Test
    fun otherScopeRecordsAreNotReturned() {
        customerPort.seed(
            sample(id = 1, firstName = "Mine", lastName = "User", userUid = uid),
            sample(id = 2, firstName = "Other", lastName = "Tenant", userUid = "other-uid")
        )
        val list = items(api.execute(authRequest("customer.list", "iso")).data)
        assertEquals(listOf(1L), list.map { it.id })
        val missing = api.execute(authRequest("customer.get", "iso-get", mapOf("id" to 2)))
        assertEquals(AgentErrorCode.NOT_FOUND, missing.error?.code)
    }

    // TEST 013-14 / 013-15 / 013-16
    @Test
    fun listAndGetExposeOnlyApprovedFieldsAndOmitSensitive() {
        customerPort.seed(
            sample(
                id = 1,
                firstName = "Secure",
                lastName = "Person",
                phone = "050-1",
                email = "a@b.com",
                tzId = "987654321",
                address = "Secret St 1"
            )
        )
        val listJson = Gson().toJson(api.execute(authRequest("customer.list", "fields-list")).data)
        val getJson = Gson().toJson(
            api.execute(authRequest("customer.get", "fields-get", mapOf("id" to 1))).data
        )
        CustomerAgentDtoMapper.restrictedFieldNames().forEach { field ->
            assertFalse("List leaked $field", listJson.contains(field, ignoreCase = true))
            assertFalse("Get leaked $field", getJson.contains(field, ignoreCase = true))
        }
        assertFalse(listJson.contains("987654321"))
        assertFalse(getJson.contains("987654321"))
        assertFalse(listJson.contains("Secret St"))
        assertFalse(getJson.contains("Secret St"))
        assertFalse(listJson.contains(uid))
        assertFalse(getJson.contains(uid))

        val item = item(api.execute(authRequest("customer.get", "fields-ok", mapOf("id" to 1))).data)
        assertEquals("Secure", item.firstName)
        assertEquals("050-1", item.phone)
        assertEquals("a@b.com", item.email)
    }

    // TEST 013-17
    @Test
    fun bothOperationsReturnSourceLocal() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        assertEquals(
            AgentDataSource.LOCAL,
            api.execute(authRequest("customer.list", "src-list")).metadata.source
        )
        assertEquals(
            AgentDataSource.LOCAL,
            api.execute(authRequest("customer.get", "src-get", mapOf("id" to 1))).metadata.source
        )
    }

    // TEST 013-18
    @Test
    fun unknownSyncStatusIsAccurate() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        val response = api.execute(authRequest("customer.get", "sync", mapOf("id" to 1)))
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertNull(response.metadata.lastSuccessfulSyncEpochMs)
    }

    // TEST 013-19
    @Test
    fun repositoryFailuresReturnStructuredErrors() {
        val failing = object : CustomerReadPort {
            override suspend fun listForUser(userUid: String): List<Customer> = error("boom")
            override suspend fun searchForUser(query: String, userUid: String): List<Customer> = error("boom")
            override suspend fun getByIdForUser(id: Long, userUid: String): Customer? = error("boom")
        }
        val failingApi = RentCarAgentAPI.forAndroidLocalCustomerReads(failing, registry)
        val response = failingApi.execute(authRequest("customer.list", "fail"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.INTERNAL_ERROR, response.error?.code)
        assertEquals("fail", response.requestId)
        assertNull(response.data)
    }

    // TEST 013-20
    @Test
    fun requestCorrelationIdsPreserved() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        val response = api.execute(authRequest("customer.get", "corr-req", mapOf("id" to 1)))
        assertEquals("corr-req", response.requestId)
        assertEquals("corr-corr-req", response.correlationId)
    }

    // TEST 013-21
    @Test
    fun customerDtoSerializesCorrectly() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B", email = "x@y.com"))
        val response = api.execute(authRequest("customer.get", "ser", mapOf("id" to 1)))
        val json = AgentApiJson.toJson(response)
        val roundTrip = AgentApiJson.responseFromJson(json)
        assertTrue(roundTrip.success)
        assertNotNull(roundTrip.data)
    }

    // TEST 013-22
    @Test
    fun readsDoNotModifyDatabaseRecords() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        val before = customerPort.snapshot()
        api.execute(authRequest("customer.list", "no-mutate"))
        api.execute(authRequest("customer.get", "no-mutate-get", mapOf("id" to 1)))
        assertEquals(before, customerPort.snapshot())
        assertEquals(0, customerPort.mutationCount)
    }

    // TEST 013-23
    @Test
    fun existingSupplierOperationsStillWork() {
        supplierPort.seed(Supplier(id = 1, name = "Alpha Rent", userUid = uid))
        assertTrue(api.execute(authRequest("supplier.list", "sup-list")).success)
        assertTrue(api.execute(authRequest("supplier.get", "sup-get", mapOf("id" to 1))).success)
    }

    // TEST 013-24
    @Test
    fun existingReservationOperationsStillWork() {
        reservationPort.seed(
            Reservation(
                id = 1,
                customerId = 10,
                supplierId = 20,
                branchId = 30,
                carTypeId = 40,
                dateFrom = 1_000L,
                dateTo = 2_000L,
                agreedPrice = 100.0,
                kmIncluded = 100,
                requiredHoldAmount = 500,
                status = ReservationStatus.Confirmed,
                userUid = uid
            )
        )
        assertTrue(api.execute(authRequest("reservation.list.manage", "res-list")).success)
        assertTrue(api.execute(authRequest("reservation.get", "res-get", mapOf("id" to 1))).success)
    }

    // TEST 013-25
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

    // TEST 013-26
    @Test
    fun otherUnimplementedOperationsRemainDisabled() {
        val response = api.execute(authRequest("branch.list", "still-disabled"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
    }

    // TEST 013-27
    @Test
    fun cloudExecutionRemainsRejected() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        val response = api.execute(
            authRequest("customer.list", "cloud", target = AgentExecutionTarget.CLOUD)
        )
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
    }

    // TEST 013-28 coverage
    @Test
    fun wiredDiscoveryReportsSixExecutableLocalOps() {
        val doc = api.discover()
        assertEquals(6, doc.executableOperations)
        assertEquals(
            setOf(
                "supplier.list",
                "supplier.get",
                "reservation.list.manage",
                "reservation.get",
                "customer.list",
                "customer.get"
            ),
            doc.operations.filter { it.executable }.map { it.operationId }.toSet()
        )
        assertEquals(GeneratedOperationCatalog.IMPLEMENTED_LOCAL_READS, api.wiredExecutableOperations.size)
    }

    @Test
    fun customerOpsAreCatalogImplemented() {
        assertEquals("IMPLEMENTED", registry.get("customer.list")!!.implementationStatus.name)
        assertEquals("IMPLEMENTED", registry.get("customer.get")!!.implementationStatus.name)
        assertFalse(registry.get("customer.list")!!.executable)
        assertFalse(registry.get("customer.get")!!.executable)
    }

    @Test
    fun autoTargetResolvesToLocal() {
        customerPort.seed(sample(id = 1, firstName = "A", lastName = "B"))
        val response = api.execute(
            authRequest("customer.list", "auto", target = AgentExecutionTarget.AUTO)
        )
        assertTrue(response.success)
        assertEquals(AgentExecutionTarget.ANDROID_LOCAL, response.metadata.executionTarget)
    }

    @Suppress("UNCHECKED_CAST")
    private fun items(data: Any?): List<CustomerAgentDto> {
        val map = data as Map<*, *>
        val raw = map["items"] as List<*>
        val gson = Gson()
        val type = object : TypeToken<List<CustomerAgentDto>>() {}.type
        return gson.fromJson(gson.toJson(raw), type)
    }

    @Suppress("UNCHECKED_CAST")
    private fun item(data: Any?): CustomerAgentDto {
        val map = data as Map<*, *>
        return Gson().fromJson(Gson().toJson(map["item"]), CustomerAgentDto::class.java)
    }
}

/**
 * In-memory port mirroring CustomerDao list/search/get + uid filter.
 * Search matches active-only LIKE semantics used by CustomerRepository.searchForUser.
 */
class InMemoryCustomerReadPort : CustomerReadPort {
    private val rows = linkedMapOf<Long, Customer>()
    var mutationCount: Int = 0
        private set

    fun seed(vararg customers: Customer) {
        customers.forEach { rows[it.id] = it }
    }

    fun snapshot(): Map<Long, Customer> = rows.toMap()

    override suspend fun listForUser(userUid: String): List<Customer> =
        rows.values
            .filter { it.userUid == userUid }
            .sortedWith(
                compareBy<Customer> { it.lastName.lowercase() }
                    .thenBy { it.firstName.lowercase() }
                    .thenBy { it.id }
            )

    override suspend fun searchForUser(query: String, userUid: String): List<Customer> {
        val q = query.lowercase()
        return rows.values
            .filter { it.userUid == userUid && it.active }
            .filter { c ->
                c.firstName.lowercase().contains(q) ||
                    c.lastName.lowercase().contains(q) ||
                    c.phone.lowercase().contains(q) ||
                    (c.tzId?.lowercase()?.contains(q) == true) ||
                    (c.email?.lowercase()?.contains(q) == true)
            }
            .sortedWith(
                compareBy<Customer> { it.lastName.lowercase() }
                    .thenBy { it.firstName.lowercase() }
                    .thenBy { it.id }
            )
    }

    override suspend fun getByIdForUser(id: Long, userUid: String): Customer? =
        rows[id]?.takeIf { it.userUid == userUid }
}
