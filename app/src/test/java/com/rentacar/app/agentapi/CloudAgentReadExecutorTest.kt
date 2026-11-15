package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.cloud.CloudAgentReadExecutor
import com.rentacar.app.agentapi.cloud.NotActivatedCloudReadPort
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudAgentReadExecutorTest {
    private val executor = CloudAgentReadExecutor()

    private fun request(op: String, target: AgentExecutionTarget = AgentExecutionTarget.CLOUD) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "cloud-$op",
        target = target,
        auth = agentLocalAuth("cloud-user")
    )

    @Test
    fun everyRequestIsDisabledWithClearMessage() {
        listOf("supplier.list", "reservation.get", "customer.list", "anything.else").forEach { op ->
            val response = executor.execute(request(op))
            assertFalse(op, response.success)
            assertNull(response.data)
            assertEquals(AgentErrorCode.EXECUTION_DISABLED, response.error?.code)
            assertTrue(response.error!!.message.contains("Cloud reads are not activated"))
            assertEquals(false, response.metadata.executable)
            assertEquals(AgentDataSource.CLOUD, response.metadata.source)
        }
    }

    @Test
    fun targetDoesNotChangeOutcome() {
        AgentExecutionTarget.entries.forEach {
            assertEquals(AgentErrorCode.EXECUTION_DISABLED, executor.execute(request("supplier.list", it)).error?.code)
        }
    }

    @Test
    fun portIsNeverActivated() {
        assertFalse(NotActivatedCloudReadPort.activated)
        assertEquals(
            AgentErrorCode.EXECUTION_DISABLED,
            CloudAgentReadExecutor(NotActivatedCloudReadPort).execute(request("supplier.list")).error?.code
        )
    }

    @Test
    fun cloudTargetStaysRejectedOnLocalApi() {
        val api = RentCarAgentAPI.forAndroidLocalSupplierReads(InMemorySupplierReadPort())
        val response = api.execute(request("supplier.list"))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNSUPPORTED_OPERATION, response.error?.code)
    }
}
