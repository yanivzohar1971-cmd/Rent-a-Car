package com.rentacar.app.ui.screens.agentapi

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.rentacar.app.agentapi.production.PairedClientView
import com.rentacar.app.agentapi.production.PairingStartResult
import com.rentacar.app.agentapi.production.ProductionAgentRuntime
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.rentacar.app.agentapi.mcp.AgentMcpStatus
import com.rentacar.app.agentapi.registry.GeneratedOperationCatalog
import com.rentacar.app.agentapi.transport.ConnectivityState
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DevicePresenceTracker
import com.rentacar.app.agentapi.transport.TokenFailure
import com.rentacar.app.agentapi.transport.TokenValidation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** Navigation route for [ClaudeAgentConnectionScreen] (registered in the app NavGraph). */
object AgentApiRoutes {
    const val CLAUDE_AGENT_CONNECTION: String = "claude_agent_connection"
}

enum class AgentPairingState {
    /** No device token is known to this app process. */
    NOT_PAIRED,
    PAIRED,
    EXPIRED,
    REVOKED
}

/** Non-secret view of the paired device. The presented token itself is never exposed here. */
data class PairedDeviceInfo(
    val state: AgentPairingState,
    val tokenId: String? = null,
    val deviceId: String? = null,
    val expiresAtEpochMs: Long? = null,
    val presence: ConnectivityState = ConnectivityState.UNAVAILABLE,
    val lastSeenEpochMs: Long? = null
)

data class LastAgentRequestInfo(
    val operation: String,
    val atEpochMs: Long,
    val success: Boolean
)

/**
 * Read-only diagnostics seam plus the one control action (revoke). Production wiring to the
 * real pairing service, session binder and persistent token store does not exist yet, so the
 * default source reports [AgentPairingState.NOT_PAIRED].
 */
interface ClaudeAgentConnectionSource {
    fun pairedDevice(): PairedDeviceInfo
    fun lastRequest(): LastAgentRequestInfo? = null

    /** Revokes the token. Returns false when the token id is unknown. */
    fun revoke(tokenId: String): Boolean
}

/** Default: nothing is paired, nothing to revoke. Never touches the network or Room. */
object NotPairedConnectionSource : ClaudeAgentConnectionSource {
    override fun pairedDevice(): PairedDeviceInfo = PairedDeviceInfo(AgentPairingState.NOT_PAIRED)
    override fun revoke(tokenId: String): Boolean = false
}

/**
 * Adapts a [DevicePairingService] for diagnostics: the device's presented token is validated
 * (never logged or shown) to derive the pairing state; revoke delegates to
 * [DevicePairingService.revoke].
 */
class PairingServiceConnectionSource(
    private val pairingService: DevicePairingService,
    private val presentedTokenProvider: () -> String?,
    private val presenceTracker: DevicePresenceTracker? = null,
    private val lastRequestProvider: () -> LastAgentRequestInfo? = { null },
    private val knownTokenId: () -> String? = { null }
) : ClaudeAgentConnectionSource {
    override fun pairedDevice(): PairedDeviceInfo {
        val presented = presentedTokenProvider() ?: return PairedDeviceInfo(AgentPairingState.NOT_PAIRED)
        return when (val validation = pairingService.validate(presented)) {
            is TokenValidation.Valid -> {
                val session = validation.session
                val presence = presenceTracker?.presence(session.deviceId)
                PairedDeviceInfo(
                    state = AgentPairingState.PAIRED,
                    tokenId = session.tokenId,
                    deviceId = session.deviceId,
                    expiresAtEpochMs = session.expiresAtEpochMs,
                    presence = presence?.state ?: ConnectivityState.UNAVAILABLE,
                    lastSeenEpochMs = presence?.lastSeenEpochMs
                )
            }
            is TokenValidation.Invalid -> PairedDeviceInfo(
                state = when (validation.failure) {
                    TokenFailure.EXPIRED -> AgentPairingState.EXPIRED
                    TokenFailure.REVOKED -> AgentPairingState.REVOKED
                    else -> AgentPairingState.NOT_PAIRED
                },
                tokenId = knownTokenId()
            )
        }
    }

    override fun lastRequest(): LastAgentRequestInfo? = lastRequestProvider()

    override fun revoke(tokenId: String): Boolean = pairingService.revoke(tokenId)
}

/**
 * AGENT-125/127: owner controls for Claude access in non-AgentDev builds (enable/disable, pair a
 * client with a one-time code, list/revoke clients). Null in AgentDev builds and in tests that only
 * cover diagnostics.
 */
interface ClaudeAgentAccessControl {
    val enabled: Boolean
    fun setEnabled(value: Boolean)
    val signedIn: Boolean
    val relayConfigured: Boolean
    val relayLastPollOkAtEpochMs: Long?
    val relayLastError: String?
    /** Hebrew label of the relay connection state. */
    val connectionLabel: String get() = "—"
    /** Hebrew label of the background mode. */
    val backgroundLabel: String get() = "—"
    val lastSuccessfulRequestAtEpochMs: Long? get() = null
    fun lastRequest(): LastAgentRequestInfo?
    /** Network call: run off the main thread. */
    fun startPairing(): PairingStartResult
    fun clients(): List<PairedClientView>
    fun revoke(tokenId: String): Boolean
}

class RuntimeAccessControl(private val rt: ProductionAgentRuntime) : ClaudeAgentAccessControl {
    override val enabled get() = rt.settings.enabled
    override fun setEnabled(value: Boolean) = rt.setEnabled(value)
    override val signedIn get() = rt.isSignedIn()
    override val relayConfigured get() = rt.relayConfigured
    override val relayLastPollOkAtEpochMs get() = rt.loop?.lastPollOkAtEpochMs
    override val relayLastError get() = rt.loop?.lastError
    override val connectionLabel: String get() = when (rt.connectionState) {
        com.rentacar.app.agentapi.relay.RelayConnectionState.STOPPED -> "לא פעיל"
        com.rentacar.app.agentapi.relay.RelayConnectionState.DISABLED_OR_SIGNED_OUT -> "מושהה (כבוי או לא מחובר)"
        com.rentacar.app.agentapi.relay.RelayConnectionState.CONNECTING -> "מתחבר…"
        com.rentacar.app.agentapi.relay.RelayConnectionState.CONNECTED -> "מחובר לממסר"
        com.rentacar.app.agentapi.relay.RelayConnectionState.RELAY_UNREACHABLE -> "הממסר אינו זמין — ניסיון חוזר"
        com.rentacar.app.agentapi.relay.RelayConnectionState.REGISTRATION_REJECTED -> "הממסר דחה את המכשיר"
    }
    override val backgroundLabel: String get() = when (rt.backgroundMode) {
        com.rentacar.app.agentapi.production.BackgroundMode.OFF -> "כבוי"
        com.rentacar.app.agentapi.production.BackgroundMode.FOREGROUND_SERVICE -> "פעיל ברקע (התראה מוצגת)"
        com.rentacar.app.agentapi.production.BackgroundMode.APP_PROCESS_ONLY -> "רק כשהאפליקציה פעילה"
    }
    override val lastSuccessfulRequestAtEpochMs get() = rt.loop?.lastSuccessfulRequestAtEpochMs
    override fun lastRequest() = rt.loop?.lastRequest?.let { (op, ok) ->
        LastAgentRequestInfo(op, rt.loop?.lastPollOkAtEpochMs ?: System.currentTimeMillis(), ok)
    }
    override fun startPairing() = rt.startPairing()
    override fun clients() = rt.pairedClients()
    override fun revoke(tokenId: String) = rt.revoke(tokenId)
}

data class AccessControlUi(
    val enabled: Boolean,
    val signedIn: Boolean,
    val relayConfigured: Boolean,
    val relayLastPollOkAtEpochMs: Long?,
    val relayLastError: String?,
    val clients: List<PairedClientView>,
    val connectionLabel: String = "—",
    val backgroundLabel: String = "—",
    val lastSuccessfulRequestAtEpochMs: Long? = null,
    val pairingCode: String? = null,
    val pairingCodeExpiresAtEpochMs: Long? = null,
    val pairingError: String? = null,
    val pairingInProgress: Boolean = false
)

data class McpFlagUi(val name: String, val enabled: Boolean)

data class ClaudeAgentDiagnosticUiState(
    val pairingState: AgentPairingState = AgentPairingState.NOT_PAIRED,
    val deviceId: String? = null,
    val tokenId: String? = null,
    val expiresAtEpochMs: Long? = null,
    val presence: ConnectivityState = ConnectivityState.UNAVAILABLE,
    val lastSeenEpochMs: Long? = null,
    val mcpFlags: List<McpFlagUi> = emptyList(),
    /** Always false: the cloud read executor is a disabled stub. */
    val cloudEnabled: Boolean = false,
    val registeredOperations: Int = 0,
    val registeredReads: Int = 0,
    val registeredWrites: Int = 0,
    val localReadsCount: Int = 0,
    /** Always 0: no write is executable on the Agent API. */
    val executableWrites: Int = 0,
    val lastRequest: LastAgentRequestInfo? = null,
    val canRevoke: Boolean = false,
    val revokeResult: RevokeResult? = null,
    /** Null when owner controls are not available (AgentDev build / diagnostics-only). */
    val access: AccessControlUi? = null
)

enum class RevokeResult { REVOKED, NOT_FOUND, NOTHING_TO_REVOKE }

/**
 * Diagnostics for the Claude AI connection screen.
 *
 * Deliberately does NOT start any gateway/listener (e.g. LoopbackAgentGatewayServer), open
 * sockets, read Room, or contact Firebase. It only reads static status/catalog constants and
 * whatever the injected [ClaudeAgentConnectionSource] reports. [refresh] is synchronous so no
 * coroutine dispatcher is required.
 */
class ClaudeAgentConnectionViewModel(
    private val source: ClaudeAgentConnectionSource = NotPairedConnectionSource,
    private val access: ClaudeAgentAccessControl? = null,
    private val io: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {
    private val _state = MutableStateFlow(buildState())
    val state: StateFlow<ClaudeAgentDiagnosticUiState> = _state.asStateFlow()

    fun refresh() {
        // Keep the transient pairing result (code shown to the owner, or its error) across periodic
        // refreshes until the code expires; only the live status fields are rebuilt.
        val prev = _state.value.access
        val next = buildState()
        val keepCode = prev?.pairingCode != null &&
            (prev.pairingCodeExpiresAtEpochMs ?: 0L) > System.currentTimeMillis()
        _state.value = next.copy(
            access = next.access?.copy(
                pairingCode = if (keepCode) prev?.pairingCode else null,
                pairingCodeExpiresAtEpochMs = if (keepCode) prev?.pairingCodeExpiresAtEpochMs else null,
                pairingError = prev?.pairingError,
                pairingInProgress = prev?.pairingInProgress ?: false
            )
        )
    }

    /** Conceptually `DevicePairingService.revoke(tokenId)` for the currently paired device. */
    fun revokeAccess() {
        val tokenId = _state.value.tokenId
        val result = when {
            tokenId == null || _state.value.pairingState != AgentPairingState.PAIRED -> RevokeResult.NOTHING_TO_REVOKE
            source.revoke(tokenId) -> RevokeResult.REVOKED
            else -> RevokeResult.NOT_FOUND
        }
        _state.value = buildState().copy(revokeResult = result)
    }

    fun dismissRevokeResult() {
        _state.update { it.copy(revokeResult = null) }
    }

    fun setAccessEnabled(value: Boolean) {
        access?.setEnabled(value) ?: return
        refresh()
    }

    fun startPairing() {
        val control = access ?: return
        _state.update { s -> s.copy(access = s.access?.copy(pairingInProgress = true, pairingError = null, pairingCode = null)) }
        viewModelScope.launch {
            val result = withContext(io) { control.startPairing() }
            val base = buildState()
            _state.value = when (result) {
                is PairingStartResult.CodeReady -> base.copy(
                    access = base.access?.copy(pairingCode = result.displayCode, pairingCodeExpiresAtEpochMs = result.expiresAtEpochMs)
                )
                is PairingStartResult.Failed -> base.copy(access = base.access?.copy(pairingError = result.reason))
            }
        }
    }

    fun revokeClient(tokenId: String) {
        access?.revoke(tokenId) ?: return
        refresh()
    }

    private fun buildState(): ClaudeAgentDiagnosticUiState {
        val device = source.pairedDevice()
        return ClaudeAgentDiagnosticUiState(
            pairingState = device.state,
            deviceId = device.deviceId,
            tokenId = device.tokenId,
            expiresAtEpochMs = device.expiresAtEpochMs,
            presence = device.presence,
            lastSeenEpochMs = device.lastSeenEpochMs,
            mcpFlags = AgentMcpStatus.entries.map { McpFlagUi(it.name, it.enabled) },
            cloudEnabled = false,
            registeredOperations = GeneratedOperationCatalog.EXPECTED_TOTAL,
            registeredReads = GeneratedOperationCatalog.EXPECTED_READ,
            registeredWrites = GeneratedOperationCatalog.EXPECTED_WRITE,
            localReadsCount = GeneratedOperationCatalog.IMPLEMENTED_LOCAL_READS,
            executableWrites = 0,
            lastRequest = access?.lastRequest() ?: source.lastRequest(),
            canRevoke = device.state == AgentPairingState.PAIRED && device.tokenId != null,
            access = access?.let {
                AccessControlUi(
                    enabled = it.enabled,
                    signedIn = it.signedIn,
                    relayConfigured = it.relayConfigured,
                    relayLastPollOkAtEpochMs = it.relayLastPollOkAtEpochMs,
                    relayLastError = it.relayLastError,
                    clients = it.clients(),
                    connectionLabel = it.connectionLabel,
                    backgroundLabel = it.backgroundLabel,
                    lastSuccessfulRequestAtEpochMs = it.lastSuccessfulRequestAtEpochMs
                )
            }
        )
    }
}
