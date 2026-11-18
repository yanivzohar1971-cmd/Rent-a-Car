package com.rentacar.app.ui.screens.agentapi

import com.rentacar.app.agentapi.production.PairedClientView
import com.rentacar.app.agentapi.production.PairingStartResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * Regression (AGENT-137 emulator acceptance, 2026-11-18): the screen's 3-second status refresh rebuilt
 * the state and erased the one-time pairing code before the owner could read it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ClaudeAgentPairingCodeRefreshTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private class FakeAccess(var expiresAt: Long) : ClaudeAgentAccessControl {
        private var on = true
        override val enabled get() = on
        override fun setEnabled(value: Boolean) { on = value }
        override val signedIn = true
        override val relayConfigured = true
        override val relayLastPollOkAtEpochMs: Long? = null
        override val relayLastError: String? = null
        override fun lastRequest(): LastAgentRequestInfo? = null
        override fun startPairing() = PairingStartResult.CodeReady("ABCDE-12345", expiresAt)
        override fun clients(): List<PairedClientView> = emptyList()
        override fun revoke(tokenId: String) = true
    }

    @Test
    fun pairingCodeSurvivesPeriodicRefreshUntilItExpires() {
        val access = FakeAccess(System.currentTimeMillis() + 300_000)
        val vm = ClaudeAgentConnectionViewModel(access = access, io = dispatcher)
        vm.startPairing()
        assertEquals("ABCDE-12345", vm.state.value.access?.pairingCode)
        repeat(3) { vm.refresh() }
        assertEquals("code still visible after refreshes", "ABCDE-12345", vm.state.value.access?.pairingCode)
    }

    @Test
    fun expiredPairingCodeIsClearedOnRefresh() {
        val access = FakeAccess(System.currentTimeMillis() - 1)
        val vm = ClaudeAgentConnectionViewModel(access = access, io = dispatcher)
        vm.startPairing()
        vm.refresh()
        assertNull(vm.state.value.access?.pairingCode)
    }
}
