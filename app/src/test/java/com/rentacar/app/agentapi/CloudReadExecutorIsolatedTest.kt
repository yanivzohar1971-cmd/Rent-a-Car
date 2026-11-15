package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.cloud.CloudAgentReadExecutor
import com.rentacar.app.agentapi.cloud.CloudReadAllowlist
import com.rentacar.app.agentapi.cloud.NotActivatedCloudReadPort
import com.rentacar.app.agentapi.dto.CustomerAgentDto
import com.rentacar.app.agentapi.dto.ReservationAgentDto
import com.rentacar.app.agentapi.dto.SupplierAgentDto
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * AGENT-107 — ISOLATED tests: every cloud read here is served by [InMemoryIsolatedCloudReadPort],
 * an in-memory test double. Nothing talks to live Firebase.
 */
class CloudReadExecutorIsolatedTest {
    private val uid = InMemoryIsolatedCloudReadPort.UID
    private val port = InMemoryIsolatedCloudReadPort.withDeterministicFixtures()
    private val executor = CloudAgentReadExecutor(port)

    private fun request(
        op: String,
        params: Map<String, Any?> = emptyMap(),
        target: AgentExecutionTarget = AgentExecutionTarget.CLOUD,
        auth: AgentAuthContext? = AgentAuthContext(userUid = uid, permissions = listOf("AUTHENTICATED"))
    ) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "iso-$op",
        target = target,
        parameters = params,
        auth = auth
    )

    @Suppress("UNCHECKED_CAST")
    private fun items(data: Any?): List<Any?> = (data as Map<String, Any?>)["items"] as List<Any?>

    @Suppress("UNCHECKED_CAST")
    private fun item(data: Any?): Any? = (data as Map<String, Any?>)["item"]

    @Test
    fun allowlistIsExactlyTheSixReadOperations() {
        assertEquals(
            setOf("supplier.list", "supplier.get", "customer.list", "customer.get", "reservation.list.manage", "reservation.get"),
            CloudReadAllowlist.OPERATIONS
        )
    }

    @Test
    fun supplierListReturnsSortedUidScopedRowsWithCloudMetadata() {
        val response = executor.execute(request("supplier.list"))
        assertTrue(response.error?.message, response.success)
        assertEquals(
            listOf("Alpha Cloud Supplier", "Beta Cloud Supplier", "Gamma Cloud Supplier"),
            items(response.data).map { (it as SupplierAgentDto).name }
        )
        assertEquals(3, (response.data as Map<*, *>)["totalMatching"])
        assertEquals(AgentDataSource.CLOUD, response.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertEquals(AgentResultCompleteness.COMPLETE, response.metadata.resultCompleteness)
        assertNull(response.metadata.lastSuccessfulSyncEpochMs)
        assertEquals(AgentExecutionTarget.CLOUD, response.metadata.executionTarget)
        assertTrue(response.metadata.warnings.any { it.contains("ISOLATED") })
    }

    @Test
    fun paginatedListIsPartialWithHasMore() {
        val response = executor.execute(request("supplier.list", mapOf("limit" to 2)))
        assertTrue(response.success)
        assertEquals(2, items(response.data).size)
        assertEquals(AgentResultCompleteness.PARTIAL, response.metadata.resultCompleteness)
        assertEquals(true, response.pagination?.hasMore)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
    }

    @Test
    fun supplierQueryAndGet() {
        val filtered = executor.execute(request("supplier.list", mapOf("query" to "gamma")))
        assertEquals(listOf("Gamma Cloud Supplier"), items(filtered.data).map { (it as SupplierAgentDto).name })

        val get = executor.execute(request("supplier.get", mapOf("id" to 1)))
        assertTrue(get.success)
        assertEquals("Alpha Cloud Supplier", (item(get.data) as SupplierAgentDto).name)
        assertEquals(AgentResultCompleteness.COMPLETE, get.metadata.resultCompleteness)
    }

    @Test
    fun customerListAndGet() {
        val list = executor.execute(request("customer.list"))
        assertEquals(3, items(list.data).size)
        val search = executor.execute(request("customer.list", mapOf("query" to "cohen")))
        assertEquals(listOf("Omer"), items(search.data).map { (it as CustomerAgentDto).firstName })
        val get = executor.execute(request("customer.get", mapOf("id" to "3")))
        assertEquals("Noa", (item(get.data) as CustomerAgentDto).firstName)
    }

    @Test
    fun reservationListManageAndGet() {
        val list = executor.execute(request("reservation.list.manage"))
        assertEquals(listOf(1L, 2L, 3L), items(list.data).map { (it as ReservationAgentDto).id })
        val get = executor.execute(request("reservation.get", mapOf("id" to 2)))
        assertEquals(2L, (item(get.data) as ReservationAgentDto).id)
    }

    @Test
    fun autoTargetIsAcceptedAndReportedAsCloud() {
        val response = executor.execute(request("supplier.list", target = AgentExecutionTarget.AUTO))
        assertTrue(response.success)
        assertEquals(AgentDataSource.CLOUD, response.metadata.source)
    }

    @Test
    fun readsAreScopedToTheAuthenticatedUid() {
        val other = executor.execute(
            request("supplier.list", auth = AgentAuthContext("nobody", permissions = listOf("AUTHENTICATED")))
        )
        assertTrue(other.success)
        assertEquals(0, items(other.data).size)
        // A supplier owned by another uid is NOT_FOUND, never leaked.
        val foreign = executor.execute(request("supplier.get", mapOf("id" to 9)))
        assertFalse(foreign.success)
        assertEquals(AgentErrorCode.NOT_FOUND, foreign.error?.code)
        assertEquals(AgentDataSource.CLOUD, foreign.metadata.source)
    }

    @Test
    fun nonAllowlistedOperationsAreRefusedWithoutTouchingThePort() {
        listOf("carSale.list", "supplier.create", "reservation.payment.list", "anything.else").forEach { op ->
            val response = executor.execute(request(op))
            assertFalse(op, response.success)
            assertEquals(op, AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
        }
        assertEquals(0, port.readCount)
    }

    @Test
    fun androidLocalTargetIsRefused() {
        val response = executor.execute(request("supplier.list", target = AgentExecutionTarget.ANDROID_LOCAL))
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
        assertEquals(0, port.readCount)
    }

    @Test
    fun missingAuthIsUnauthorizedAndMissingPermissionIsForbidden() {
        assertEquals(AgentErrorCode.UNAUTHORIZED, executor.execute(request("supplier.list", auth = null)).error?.code)
        assertEquals(
            AgentErrorCode.UNAUTHORIZED,
            executor.execute(request("supplier.list", auth = AgentAuthContext(userUid = " "))).error?.code
        )
        assertEquals(
            AgentErrorCode.FORBIDDEN,
            executor.execute(request("supplier.list", auth = AgentAuthContext(userUid = uid))).error?.code
        )
        assertEquals(0, port.readCount)
    }

    @Test
    fun invalidArgumentsAreRejectedBeforeTheCloudIsCalled() {
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, executor.execute(request("supplier.get")).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, executor.execute(request("supplier.get", mapOf("id" to -4))).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, executor.execute(request("supplier.list", mapOf("limit" to 0))).error?.code)
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, executor.execute(request("supplier.list", mapOf("limit" to 9999))).error?.code)
        assertEquals(0, port.readCount)
    }

    @Test
    fun outageIsCloudUnavailableRetryableNeverSuccess() {
        port.outage = true
        val response = executor.execute(request("supplier.list"))
        assertFalse(response.success)
        assertNull(response.data)
        assertEquals(AgentErrorCode.CLOUD_UNAVAILABLE, response.error?.code)
        assertTrue(response.error!!.retryable)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertEquals(AgentResultCompleteness.UNAVAILABLE, response.metadata.resultCompleteness)
    }

    @Test
    fun portExceptionsBecomeCloudUnavailableWithoutLeakingDetails() {
        port.throwOnRead = true
        val response = executor.execute(request("supplier.list"))
        assertEquals(AgentErrorCode.CLOUD_UNAVAILABLE, response.error?.code)
        assertFalse(response.error!!.message.contains("isolated cloud port failure"))
    }

    @Test
    fun deactivatedPortKeepsExecutionDisabledAndIgnoresThePort() {
        port.activated = false
        val response = executor.execute(request("supplier.list"))
        assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
        assertEquals(0, port.readCount)
        assertFalse(executor.activated)
    }

    @Test
    fun notActivatedPortHasNoReadAndStaysDisabled() {
        assertFalse(NotActivatedCloudReadPort.activated)
        assertNull(NotActivatedCloudReadPort.read("supplier.list", uid, emptyMap()))
        assertEquals(
            AgentErrorCode.EXECUTION_DISABLED,
            CloudAgentReadExecutor(NotActivatedCloudReadPort).execute(request("supplier.list")).error?.code
        )
    }
}
