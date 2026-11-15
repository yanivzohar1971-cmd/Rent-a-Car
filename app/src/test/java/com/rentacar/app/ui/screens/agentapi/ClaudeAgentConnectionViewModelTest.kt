package com.rentacar.app.ui.screens.agentapi

import com.rentacar.app.agentapi.GatewayTestFixture
import com.rentacar.app.agentapi.mcp.AgentMcpStatus
import com.rentacar.app.agentapi.registry.GeneratedOperationCatalog
import com.rentacar.app.agentapi.transport.ConnectivityState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClaudeAgentConnectionViewModelTest {
    private val fx = GatewayTestFixture()

    @Test
    fun defaultStateIsNotPairedWithStaticDiagnostics() {
        val vm = ClaudeAgentConnectionViewModel()
        val s = vm.state.value
        assertEquals("claude_agent_connection", AgentApiRoutes.CLAUDE_AGENT_CONNECTION)
        assertEquals(AgentPairingState.NOT_PAIRED, s.pairingState)
        assertFalse(s.canRevoke)
        assertFalse(s.cloudEnabled)
        assertEquals(0, s.executableWrites)
        assertNull(s.lastRequest)
        assertEquals(GeneratedOperationCatalog.IMPLEMENTED_LOCAL_READS, s.localReadsCount)
        assertEquals(GeneratedOperationCatalog.EXPECTED_TOTAL, s.registeredOperations)
        assertEquals(AgentMcpStatus.entries.map { it.name to it.enabled }, s.mcpFlags.map { it.name to it.enabled })
        assertTrue(s.mcpFlags.none { it.name == "MCP_CONNECTED_TO_REAL_ANDROID" && it.enabled })
    }

    @Test
    fun revokeWithNothingPairedIsANoOp() {
        val vm = ClaudeAgentConnectionViewModel()
        vm.revokeAccess()
        assertEquals(RevokeResult.NOTHING_TO_REVOKE, vm.state.value.revokeResult)
        vm.dismissRevokeResult()
        assertNull(vm.state.value.revokeResult)
    }

    @Test
    fun pairedDeviceCanBeRevokedThroughThePairingService() {
        val paired = fx.pair("user-a", deviceId = "phone-1")
        fx.presence.heartbeat("phone-1")
        val vm = ClaudeAgentConnectionViewModel(
            PairingServiceConnectionSource(fx.pairing, { paired.presentedToken }, fx.presence, knownTokenId = { paired.token.tokenId })
        )
        val before = vm.state.value
        assertEquals(AgentPairingState.PAIRED, before.pairingState)
        assertEquals("phone-1", before.deviceId)
        assertEquals(ConnectivityState.ONLINE, before.presence)
        assertTrue(before.canRevoke)

        vm.revokeAccess()
        val after = vm.state.value
        assertEquals(RevokeResult.REVOKED, after.revokeResult)
        assertEquals(AgentPairingState.REVOKED, after.pairingState)
        assertFalse(after.canRevoke)
        // The real service now rejects the token.
        assertFalse(fx.gateway.listTools(paired.presentedToken).success)
    }

    @Test
    fun expiredTokenIsReportedAsExpiredAndCannotBeRevokedFromTheUi() {
        val paired = fx.pair("user-a", ttlMs = 1_000)
        val vm = ClaudeAgentConnectionViewModel(PairingServiceConnectionSource(fx.pairing, { paired.presentedToken }))
        fx.now += 1_000
        vm.refresh()
        assertEquals(AgentPairingState.EXPIRED, vm.state.value.pairingState)
        assertFalse(vm.state.value.canRevoke)
    }

    @Test
    fun stateNeverContainsThePresentedToken() {
        val paired = fx.pair("user-a")
        val vm = ClaudeAgentConnectionViewModel(PairingServiceConnectionSource(fx.pairing, { paired.presentedToken }))
        assertFalse(vm.state.value.toString().contains(paired.presentedToken))
    }
}
