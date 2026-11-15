package com.rentacar.app.agentapi.commands

import com.rentacar.app.BuildConfig
import com.rentacar.app.agentapi.model.AgentErrorCode

/**
 * AGENT-111: the only switch that allows a prepared command to reach the real local Room database.
 *
 * Compiled from `BuildConfig.AGENT_DEV_MODE`, which is `false` in the production `standard`
 * flavor and `true` only in the `agentdev` flavor. There is intentionally no runtime override.
 */
object AgentDevWriteGate {
    fun roomWritesEnabled(): Boolean = BuildConfig.AGENT_DEV_MODE

    /** Alias of [roomWritesEnabled]. */
    fun isEnabled(): Boolean = roomWritesEnabled()
}

sealed class RoomWriteResult {
    /** [idempotentReplay] is true when a previously committed identical command was returned without a new write. */
    data class Committed(
        val entityType: String,
        val entityId: Long,
        val idempotentReplay: Boolean = false,
        val details: Map<String, Any?> = emptyMap()
    ) : RoomWriteResult()

    data class Rejected(
        val code: AgentErrorCode,
        val message: String,
        val details: Map<String, Any?> = emptyMap()
    ) : RoomWriteResult()
}

/** Applies an already prepared, validated, authorized AND confirmed command to local Room storage. */
interface RoomWriteCommitter {
    fun commit(command: PreparedCommand): RoomWriteResult
}
