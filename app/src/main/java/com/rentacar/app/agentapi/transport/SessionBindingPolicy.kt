package com.rentacar.app.agentapi.transport

/**
 * AGENT-103: guards the AgentDev identity so it can never be bound in a production build.
 *
 * The fixed AgentDev uid is only a legal identity when the offline `agentdev` flavor is running.
 */
object SessionBindingPolicy {
    const val AGENT_DEV_UID: String = "agent-dev-uid"

    fun isAgentDevUidAllowed(agentDevMode: Boolean, uid: String): Boolean =
        if (uid == AGENT_DEV_UID) agentDevMode else true

    fun assertProductionSafe(agentDevMode: Boolean, uid: String) {
        require(isAgentDevUidAllowed(agentDevMode, uid)) {
            "uid '$AGENT_DEV_UID' is only allowed when AGENT_DEV_MODE is enabled"
        }
    }
}
