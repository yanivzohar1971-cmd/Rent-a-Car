package com.rentacar.app.agentapi

import com.google.gson.Gson
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.mcp.AgentMcpAdapter
import com.rentacar.app.agentapi.mcp.AgentMcpStatus
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AgentMcpAdapterTest {
    private lateinit var port: InMemorySupplierReadPort
    private lateinit var api: RentCarAgentAPI
    private lateinit var adapter: AgentMcpAdapter

    @Before
    fun setUp() {
        port = InMemorySupplierReadPort()
        api = RentCarAgentAPI.forAndroidLocalSupplierReads(port)
        adapter = AgentMcpAdapter(api) { "mcp-test-request" }
    }

    @Test
    fun discoveryContainsOnlyWiredExecutableTools() {
        val tools = adapter.listTools()
        assertEquals(setOf("supplier.list", "supplier.get"), tools.map { it.name }.toSet())
        assertTrue(tools.all { it.operationId in api.wiredExecutableOperations })
        assertTrue(tools.all { AgentExecutableAllowlist.isLocalReadEnabled(it.operationId) })
    }

    @Test
    fun supplierListCallSucceedsWithInMemoryPort() {
        port.seed(Supplier(id = 1, name = "Fixture Supplier", userUid = "mcp-user"))

        val result = adapter.callTool(
            name = "supplier.list",
            arguments = emptyMap(),
            authContext = agentLocalAuth("mcp-user")
        )

        assertTrue(result.success)
        assertEquals("supplier.list", result.operationId)
        assertEquals(AgentDataSource.LOCAL, result.metadata?.source)
        assertNotNull(result.result)
        assertTrue(Gson().toJson(result).contains("Fixture Supplier"))
    }

    @Test
    fun writeToolsAreNeverDiscovered() {
        val writes = api.registry.writes().map { it.operationId }.toSet()
        assertTrue(adapter.listTools().none { it.operationId in writes })
    }

    @Test
    fun unknownToolReturnsStructuredError() {
        val result = adapter.callTool(
            name = "not.a.real.tool",
            arguments = emptyMap(),
            authContext = agentLocalAuth("mcp-user")
        )

        assertFalse(result.success)
        assertEquals("UNKNOWN_TOOL", result.error?.code)
        assertEquals(null, result.result)
        assertNotNull(Gson().toJson(result))
    }

    @Test
    fun unwiredCloudOperationsAreNotExposed() {
        val exposed = adapter.listTools().map { it.operationId }.toSet()
        assertEquals(api.wiredExecutableOperations, exposed)
        assertFalse(exposed.contains("auth.session.current"))
        assertFalse(AgentMcpStatus.MCP_CONNECTED_TO_REAL_ANDROID.enabled)
        assertFalse(AgentMcpStatus.MCP_CONNECTED_TO_CLAUDE_CODE.enabled)
    }
}
