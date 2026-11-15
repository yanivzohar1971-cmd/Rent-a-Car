package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.cloud.CloudAgentReadExecutor
import com.rentacar.app.agentapi.execution.AndroidLocalSupplierReadExecutor
import com.rentacar.app.agentapi.execution.DispatchingAgentOperationExecutor
import com.rentacar.app.agentapi.execution.ExecutionAvailability
import com.rentacar.app.agentapi.execution.ExecutionRoute
import com.rentacar.app.agentapi.execution.ExecutionTargetRouter
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-108: target routing. Cloud data comes only from the ISOLATED in-memory port. */
class ExecutionTargetRouterTest {
    private val router = ExecutionTargetRouter()
    private val uid = InMemoryIsolatedCloudReadPort.UID

    private fun route(
        target: AgentExecutionTarget,
        op: String = "supplier.list",
        local: Boolean = true,
        reachable: Boolean = true,
        cloud: Boolean = false
    ) = router.route(target, op, ExecutionAvailability(local, reachable, cloud))

    // ---- pure router: local-only ----

    @Test
    fun localOnlyRoutesLocalForLocalAndAuto() {
        assertEquals(ExecutionRoute.Selected(AgentExecutionTarget.ANDROID_LOCAL), route(AgentExecutionTarget.ANDROID_LOCAL))
        assertEquals(ExecutionRoute.Selected(AgentExecutionTarget.ANDROID_LOCAL), route(AgentExecutionTarget.AUTO))
    }

    @Test
    fun localOnlyRejectsCloudTargetWithClearError() {
        val failed = route(AgentExecutionTarget.CLOUD) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.CLOUD_UNAVAILABLE, failed.code)
    }

    // ---- pure router: cloud-only ----

    @Test
    fun cloudOnlyRoutesCloudWithUnverifiedWarning() {
        val selected = route(AgentExecutionTarget.CLOUD, cloud = true) as ExecutionRoute.Selected
        assertEquals(AgentExecutionTarget.CLOUD, selected.target)
        assertTrue(selected.warnings.contains(ExecutionTargetRouter.CLOUD_WARNING))
    }

    @Test
    fun autoFallsBackToCloudWhenNoLocalExecutor() {
        val selected = route(AgentExecutionTarget.AUTO, local = false, cloud = true) as ExecutionRoute.Selected
        assertEquals(AgentExecutionTarget.CLOUD, selected.target)
        assertTrue(selected.warnings.any { it.contains("served from cloud") })
    }

    // ---- pure router: device unavailable ----

    @Test
    fun localTargetWithUnreachableDeviceFailsAndDoesNotFallBackToCloud() {
        val failed = route(AgentExecutionTarget.ANDROID_LOCAL, reachable = false, cloud = true) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.DEVICE_UNAVAILABLE, failed.code)
        assertTrue(failed.retryable)
    }

    @Test
    fun autoWithUnreachableDeviceFallsBackToCloudWhenActivated() {
        val selected = route(AgentExecutionTarget.AUTO, reachable = false, cloud = true) as ExecutionRoute.Selected
        assertEquals(AgentExecutionTarget.CLOUD, selected.target)
        assertTrue(selected.warnings.any { it.contains("Device unavailable") })
    }

    @Test
    fun autoWithUnreachableDeviceAndNoCloudFailsDeviceUnavailable() {
        val failed = route(AgentExecutionTarget.AUTO, reachable = false, cloud = false) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.DEVICE_UNAVAILABLE, failed.code)
    }

    @Test
    fun autoWithUnreachableDeviceFailsForOpsThatCloudCannotServe() {
        val failed = route(AgentExecutionTarget.AUTO, op = "carSale.list", reachable = false, cloud = true) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.DEVICE_UNAVAILABLE, failed.code)
    }

    // ---- pure router: unsupported target ----

    @Test
    fun cloudTargetForNonAllowlistedOperationIsUnsupported() {
        val failed = route(AgentExecutionTarget.CLOUD, op = "carSale.list", cloud = true) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, failed.code)
        assertEquals("CLOUD", failed.details["target"])
    }

    @Test
    fun localTargetWithoutLocalExecutorIsUnsupported() {
        val failed = route(AgentExecutionTarget.ANDROID_LOCAL, local = false, cloud = true) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, failed.code)
    }

    @Test
    fun autoWithNothingAvailableIsUnsupported() {
        val failed = route(AgentExecutionTarget.AUTO, local = false, cloud = false) as ExecutionRoute.Failed
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, failed.code)
    }

    // ---- dispatcher integration ----

    private val localPort = InMemorySupplierReadPort().also {
        it.seed(Supplier(id = 1, name = "Local Supplier", userUid = uid))
    }
    private val cloudPort = InMemoryIsolatedCloudReadPort.withDeterministicFixtures()

    private fun dispatcher(
        withCloud: Boolean = true,
        reachable: () -> Boolean = { true }
    ) = DispatchingAgentOperationExecutor(
        registry = AgentCapabilityRegistry.loadDefault(),
        localSupplierReadExecutor = AndroidLocalSupplierReadExecutor(localPort),
        cloudExecutor = if (withCloud) CloudAgentReadExecutor(cloudPort) else null,
        deviceReachable = reachable
    )

    private fun request(op: String, target: AgentExecutionTarget, params: Map<String, Any?> = emptyMap()) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "route-$op",
        target = target,
        parameters = params,
        auth = agentLocalAuth(uid)
    )

    @Test
    fun defaultDispatcherBehaviorIsUnchangedWhenCloudIsNull() {
        val d = dispatcher(withCloud = false)
        val cloud = d.execute(request("supplier.list", AgentExecutionTarget.CLOUD))
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, cloud.error?.code)
        val local = d.execute(request("supplier.list", AgentExecutionTarget.AUTO))
        assertTrue(local.success)
        assertEquals(AgentDataSource.LOCAL, local.metadata.source)
        assertEquals(0, cloudPort.readCount)
    }

    @Test
    fun dispatcherServesLocalWhenDeviceReachable() {
        val response = dispatcher().execute(request("supplier.list", AgentExecutionTarget.AUTO))
        assertTrue(response.success)
        assertEquals(AgentDataSource.LOCAL, response.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertEquals(0, cloudPort.readCount)
    }

    @Test
    fun dispatcherServesExplicitCloudTargetFromCloud() {
        val response = dispatcher().execute(request("supplier.list", AgentExecutionTarget.CLOUD))
        assertTrue(response.error?.message, response.success)
        assertEquals(AgentDataSource.CLOUD, response.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertTrue(response.metadata.warnings.contains(ExecutionTargetRouter.CLOUD_WARNING))
        assertNull(response.metadata.lastSuccessfulSyncEpochMs)
    }

    @Test
    fun dispatcherFallsBackToCloudWhenDeviceUnavailableAndSaysSo() {
        val response = dispatcher(reachable = { false }).execute(request("supplier.list", AgentExecutionTarget.AUTO))
        assertTrue(response.error?.message, response.success)
        assertEquals(AgentDataSource.CLOUD, response.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertTrue(response.metadata.warnings.any { it.contains("Device unavailable") })
    }

    @Test
    fun dispatcherFailsDeviceUnavailableForLocalTargetWithMetadata() {
        val response = dispatcher(reachable = { false }).execute(request("supplier.list", AgentExecutionTarget.ANDROID_LOCAL))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.DEVICE_UNAVAILABLE, response.error?.code)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertTrue(response.metadata.warnings.isNotEmpty())
        assertEquals(0, cloudPort.readCount)
    }

    @Test
    fun dispatcherRefusesCloudTargetForNonCloudOperation() {
        val response = dispatcher().execute(request("carSale.list", AgentExecutionTarget.CLOUD))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
        assertEquals(AgentDataSource.CLOUD, response.metadata.source)
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertEquals(0, cloudPort.readCount)
    }

    @Test
    fun dispatcherWithInactiveCloudReportsCloudUnavailable() {
        cloudPort.activated = false
        val response = dispatcher().execute(request("supplier.list", AgentExecutionTarget.CLOUD))
        assertEquals(AgentErrorCode.CLOUD_UNAVAILABLE, response.error?.code)
        assertEquals(0, cloudPort.readCount)
    }

    @Test
    fun writesStayBlockedRegardlessOfRouting() {
        val response = dispatcher().execute(request("supplier.create", AgentExecutionTarget.CLOUD))
        assertFalse(response.success)
        assertTrue(
            response.error?.code == AgentErrorCode.WRITE_DISABLED ||
                response.error?.code == AgentErrorCode.UNKNOWN_OPERATION ||
                response.error?.code == AgentErrorCode.INVALID_REQUEST
        )
        assertEquals(0, cloudPort.readCount)
    }
}
