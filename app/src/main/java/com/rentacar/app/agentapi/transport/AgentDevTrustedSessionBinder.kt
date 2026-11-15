package com.rentacar.app.agentapi.transport

import com.rentacar.app.BuildConfig

/**
 * AGENT-103 (AgentDev only): binds the fixed AgentDev uid.
 *
 * Returns claims ONLY when [agentDevMode] is true (defaults to `BuildConfig.AGENT_DEV_MODE`);
 * otherwise it returns null so no pairing can ever bind the dev identity in production.
 */
class AgentDevTrustedSessionBinder(
    private val agentDevMode: Boolean = BuildConfig.AGENT_DEV_MODE,
    private val devUid: String = BuildConfig.AGENT_DEV_UID
) : TrustedSessionBinder {

    override fun currentSession(): VerifiedSessionClaims? {
        if (!agentDevMode) return null
        if (devUid.isBlank()) return null
        SessionBindingPolicy.assertProductionSafe(agentDevMode, devUid)
        return VerifiedSessionClaims(devUid)
    }
}
