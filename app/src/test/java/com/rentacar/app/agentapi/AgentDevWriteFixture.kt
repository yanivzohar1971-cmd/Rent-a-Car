package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.AgentDevRoomWriteCommitter
import com.rentacar.app.agentapi.commands.AgentDevWriteSpecs
import com.rentacar.app.agentapi.commands.CommandConfirmationTokenService
import com.rentacar.app.agentapi.commands.CommandPrepareOutcome
import com.rentacar.app.agentapi.commands.CommandReceipt
import com.rentacar.app.agentapi.commands.InMemoryCommandAuditLog
import com.rentacar.app.agentapi.commands.InMemoryCommandSandbox
import com.rentacar.app.agentapi.commands.PreparingWriteCommandPipeline
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry

/** Wires the real pipeline + AgentDev committer over [FakeAgentDevWritePorts] with an injectable gate. */
class AgentDevWriteFixture(
    var gateOpen: Boolean = true,
    withCommitter: Boolean = true,
    withSandbox: Boolean = false
) {
    val registry: AgentCapabilityRegistry = AgentCapabilityRegistry.loadDefault()
    var now = 20_000_000L
    private val clock: () -> Long = { now }
    val ports = FakeAgentDevWritePorts()
    val audit = InMemoryCommandAuditLog()
    val sandbox = InMemoryCommandSandbox().takeIf { withSandbox }
    val committer = AgentDevRoomWriteCommitter(ports, gate = { gateOpen }, clock = clock)
    val uid = "dev-user"
    val auth = agentLocalAuth(uid)
    private val tokens = CommandConfirmationTokenService("fixture-secret-0123456789abcdef".toByteArray(), clock)

    val pipeline = PreparingWriteCommandPipeline(
        registry = registry,
        specs = AgentDevWriteSpecs.all(),
        tokenService = tokens,
        auditLog = audit,
        sandbox = sandbox,
        clock = clock,
        roomCommitter = committer.takeIf { withCommitter },
        roomWritesEnabled = { gateOpen }
    )

    fun request(op: String, params: Map<String, Any?>, idempotencyKey: String? = null) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "req-${op}",
        target = AgentExecutionTarget.ANDROID_LOCAL,
        parameters = params,
        idempotencyKey = idempotencyKey,
        auth = auth
    )

    fun prepare(op: String, params: Map<String, Any?>, idempotencyKey: String? = null): CommandPrepareOutcome =
        pipeline.prepare(request(op, params, idempotencyKey))

    fun prepared(op: String, params: Map<String, Any?>, idempotencyKey: String? = null) =
        prepare(op, params, idempotencyKey) as CommandPrepareOutcome.Prepared

    /** prepare + commit with the issued confirmation token. */
    fun run(op: String, params: Map<String, Any?>, idempotencyKey: String? = null): CommandReceipt {
        val p = prepared(op, params, idempotencyKey)
        return pipeline.commit(p.command.commandId, p.confirmationToken, auth)
    }

    companion object {
        val customer = mapOf("firstName" to "Dana", "lastName" to "Levi", "phone" to "050-123")
    }
}
