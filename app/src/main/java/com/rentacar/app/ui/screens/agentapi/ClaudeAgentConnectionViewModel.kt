package com.rentacar.app.ui.screens.agentapi

import androidx.lifecycle.ViewModel
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
    val revokeResult: RevokeResult? = null
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
    private val source: ClaudeAgentConnectionSource = NotPairedConnectionSource
) : ViewModel() {
    private val _state = MutableStateFlow(buildState())
    val state: StateFlow<ClaudeAgentDiagnosticUiState> = _state.asStateFlow()

    fun refresh() {
        _state.value = buildState()
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
            lastRequest = source.lastRequest(),
            canRevoke = device.state == AgentPairingState.PAIRED && device.tokenId != null
        )
    }
}
