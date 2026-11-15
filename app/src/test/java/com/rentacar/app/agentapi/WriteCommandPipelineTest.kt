package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.CommandConfirmationToken
import com.rentacar.app.agentapi.commands.CommandConfirmationTokenService
import com.rentacar.app.agentapi.commands.CommandOutcome
import com.rentacar.app.agentapi.commands.CommandPhase
import com.rentacar.app.agentapi.commands.CommandPrepareOutcome
import com.rentacar.app.agentapi.commands.CommandRisk
import com.rentacar.app.agentapi.commands.ConfirmationCheck
import com.rentacar.app.agentapi.commands.DisabledWriteCommandPipeline
import com.rentacar.app.agentapi.commands.InMemoryCommandAuditLog
import com.rentacar.app.agentapi.commands.InMemoryCommandSandbox
import com.rentacar.app.agentapi.commands.PreparedCommand
import com.rentacar.app.agentapi.commands.PreparingWriteCommandPipeline
import com.rentacar.app.agentapi.commands.PreviewChange
import com.rentacar.app.agentapi.commands.WriteCommandSpec
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.mcp.AgentMcpAdapter
import com.rentacar.app.agentapi.model.AgentAuthContext
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class WriteCommandPipelineTest {
    private val registry = AgentCapabilityRegistry.loadDefault()
    private var now = 5_000_000L
    private val clock: () -> Long = { now }
    private val secret = "command-test-secret-0123456789"
    private val tokens = CommandConfirmationTokenService(secret.toByteArray(), clock)

    private val supplierCreate = WriteCommandSpec(
        operationId = "supplier.create",
        risk = CommandRisk.SOFT,
        validate = { params ->
            buildList {
                if ((params["name"] as? String).isNullOrBlank()) add("name is required")
            }
        },
        preview = { params ->
            listOf(PreviewChange("Supplier", "name", null, params["name"]?.toString(), "Create supplier"))
        }
    )

    private fun request(
        params: Map<String, Any?> = mapOf("name" to "New Supplier"),
        auth: AgentAuthContext? = agentLocalAuth("cmd-user"),
        op: String = "supplier.create"
    ) = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "cmd-req",
        target = AgentExecutionTarget.ANDROID_LOCAL,
        parameters = params,
        auth = auth
    )

    private fun pipeline(
        sandbox: InMemoryCommandSandbox? = null,
        audit: InMemoryCommandAuditLog = InMemoryCommandAuditLog()
    ) = PreparingWriteCommandPipeline(
        registry, listOf(supplierCreate), tokens, audit, sandbox, clock
    )

    private fun prepared(p: PreparingWriteCommandPipeline, req: AgentRequest = request()) =
        p.prepare(req) as CommandPrepareOutcome.Prepared

    // ---- disabled pipeline ----

    @Test
    fun disabledPipelineRejectsPrepareAndCommitWithWriteDisabled() {
        val audit = InMemoryCommandAuditLog()
        val disabled = DisabledWriteCommandPipeline(audit, clock)
        val prepare = disabled.prepare(request()) as CommandPrepareOutcome.Rejected
        assertEquals(AgentErrorCode.WRITE_DISABLED, prepare.receipt.error?.code)
        assertEquals(CommandOutcome.REJECTED, prepare.receipt.outcome)
        val commit = disabled.commit("cmd-1", "token", agentLocalAuth("cmd-user"))
        assertEquals(AgentErrorCode.WRITE_DISABLED, commit.error?.code)
        assertFalse(commit.productionWritePerformed)
        assertEquals(2, audit.records().size)
    }

    // ---- prepare + preview ----

    @Test
    fun prepareAndPreviewWorkWithoutMutatingAnything() {
        val port = InMemorySupplierReadPort()
        port.seed(Supplier(id = 1, name = "Existing", userUid = "cmd-user"))
        val before = port.snapshot()

        val p = pipeline()
        val outcome = prepared(p)

        assertEquals("supplier.create", outcome.command.operationId)
        assertEquals("cmd-user", outcome.command.userUid)
        assertEquals(CommandRisk.SOFT, outcome.command.risk)
        assertTrue(outcome.preview.requiresConfirmation)
        assertEquals("New Supplier", outcome.preview.changes.single().after)
        assertEquals(outcome.command.commandHash, outcome.preview.commandHash)
        assertTrue(outcome.confirmationToken.startsWith("cct1."))
        // Fixture data layer untouched (pipeline has no data-layer dependency at all).
        assertEquals(before, port.snapshot())
        assertEquals(0, port.mutationCount)
    }

    @Test
    fun validationFailureIsRejectedAtValidatePhase() {
        val outcome = pipeline().prepare(request(params = mapOf("name" to " ")))
        outcome as CommandPrepareOutcome.Rejected
        assertEquals(CommandPhase.VALIDATE, outcome.receipt.phase)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, outcome.receipt.error?.code)
    }

    @Test
    fun missingIdentityAndPermissionsAreRejectedAtAuthorize() {
        val noAuth = pipeline().prepare(request(auth = null)) as CommandPrepareOutcome.Rejected
        assertEquals(AgentErrorCode.UNAUTHORIZED, noAuth.receipt.error?.code)
        assertEquals(CommandPhase.AUTHORIZE, noAuth.receipt.phase)

        val noPerm = pipeline().prepare(
            request(auth = AgentAuthContext(userUid = "cmd-user", permissions = emptyList()))
        ) as CommandPrepareOutcome.Rejected
        assertEquals(AgentErrorCode.FORBIDDEN, noPerm.receipt.error?.code)
    }

    @Test
    fun operationsOutsideTheSpecAllowlistAreRejected() {
        val outcome = pipeline().prepare(request(op = "supplier.delete")) as CommandPrepareOutcome.Rejected
        assertEquals(AgentErrorCode.WRITE_DISABLED, outcome.receipt.error?.code)
        val readOp = pipeline().prepare(request(op = "supplier.list")) as CommandPrepareOutcome.Rejected
        assertEquals(AgentErrorCode.WRITE_DISABLED, readOp.receipt.error?.code)
    }

    @Test
    fun specsMustReferenceRegisteredWriteOperations() {
        try {
            PreparingWriteCommandPipeline(
                registry,
                listOf(supplierCreate.copy(operationId = "supplier.list")),
                tokens,
                clock = clock
            )
            fail("read operation must not be accepted as a write spec")
        } catch (_: IllegalArgumentException) {
        }
    }

    // ---- commit: never touches production ----

    @Test
    fun commitWithoutSandboxIsAlwaysWriteDisabled() {
        val audit = InMemoryCommandAuditLog()
        val p = pipeline(sandbox = null, audit = audit)
        val prep = prepared(p)
        val receipt = p.commit(prep.command.commandId, prep.confirmationToken, agentLocalAuth("cmd-user"))
        assertEquals(CommandOutcome.REJECTED, receipt.outcome)
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertFalse(receipt.productionWritePerformed)
        assertTrue(audit.records().any { it.errorCode == "WRITE_DISABLED" })
    }

    @Test
    fun commitWithSandboxOnlyRecordsInMemorySandbox() {
        val sandbox = InMemoryCommandSandbox()
        val p = pipeline(sandbox)
        val prep = prepared(p)
        val receipt = p.commit(prep.command.commandId, prep.confirmationToken, agentLocalAuth("cmd-user"))
        assertEquals(CommandOutcome.SANDBOX_COMMITTED, receipt.outcome)
        assertTrue(receipt.sandboxOnly)
        assertFalse(receipt.productionWritePerformed)
        assertEquals(CommandPhase.VERIFY, receipt.phase)
        assertEquals("New Supplier", sandbox.entries().single().parameters["name"])

        // Single use: a second commit with the same token is refused.
        val again = p.commit(prep.command.commandId, prep.confirmationToken, agentLocalAuth("cmd-user"))
        assertEquals(CommandOutcome.REJECTED, again.outcome)
        assertEquals(1, sandbox.entries().size)
    }

    @Test
    fun commitRequiresValidConfirmationToken() {
        val sandbox = InMemoryCommandSandbox()
        val p = pipeline(sandbox)
        val prep = prepared(p)
        val auth = agentLocalAuth("cmd-user")
        listOf(null, "", "garbage", prep.confirmationToken.dropLast(3) + "AAA").forEach {
            val r = p.commit(prep.command.commandId, it, auth)
            assertEquals(CommandOutcome.REJECTED, r.outcome)
            assertEquals(AgentErrorCode.CONFIRMATION_REQUIRED, r.error?.code)
        }
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun tokenFromAnotherCommandCannotConfirm() {
        val sandbox = InMemoryCommandSandbox()
        val p = pipeline(sandbox)
        val one = prepared(p)
        val two = prepared(p, request(mapOf("name" to "Other")))
        val r = p.commit(one.command.commandId, two.confirmationToken, agentLocalAuth("cmd-user"))
        assertEquals(AgentErrorCode.CONFIRMATION_REQUIRED, r.error?.code)
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun otherUserCannotCommit() {
        val sandbox = InMemoryCommandSandbox()
        val p = pipeline(sandbox)
        val prep = prepared(p)
        val r = p.commit(prep.command.commandId, prep.confirmationToken, agentLocalAuth("intruder"))
        assertEquals(AgentErrorCode.FORBIDDEN, r.error?.code)
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun expiredPreparedCommandCannotCommit() {
        val sandbox = InMemoryCommandSandbox()
        val p = pipeline(sandbox)
        val prep = prepared(p)
        now += PreparingWriteCommandPipeline.DEFAULT_PREPARED_TTL_MS + 1
        val r = p.commit(prep.command.commandId, prep.confirmationToken, agentLocalAuth("cmd-user"))
        assertEquals(AgentErrorCode.TIMEOUT, r.error?.code)
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun unknownCommandIdIsNotFound() {
        val r = pipeline(InMemoryCommandSandbox()).commit("cmd-nope", "x", agentLocalAuth("cmd-user"))
        assertEquals(AgentErrorCode.NOT_FOUND, r.error?.code)
    }

    // ---- confirmation token ----

    @Test
    fun confirmationTokenCannotBeForgedWithoutSecret() {
        val command = prepared(pipeline()).command
        val forgedService = CommandConfirmationTokenService("different-secret-0123456789".toByteArray(), clock)
        val forged = forgedService.issue(command, 60_000).encode()
        assertTrue(tokens.verify(forged, command) is ConfirmationCheck.Invalid)
        assertTrue(tokens.verify(tokens.issue(command, 60_000).encode(), command) is ConfirmationCheck.Valid)
    }

    @Test
    fun confirmationTokenExpiresAndIsBoundToCommandHash() {
        val command = prepared(pipeline()).command
        val token = tokens.issue(command, 1_000)
        assertEquals(command.commandHash, token.commandHash)
        now += 1_000
        val check = tokens.verify(token.encode(), command)
        assertTrue(check is ConfirmationCheck.Invalid)
        assertTrue((check as ConfirmationCheck.Invalid).reason.contains("expired"))
    }

    @Test
    fun confirmationTokenIsBoundToUser() {
        val p = pipeline()
        val command = prepared(p).command
        val sameCommandOtherUser: PreparedCommand = command.copy(userUid = "other-user")
        val token = tokens.issue(command, 60_000).encode()
        assertTrue(tokens.verify(token, sameCommandOtherUser) is ConfirmationCheck.Invalid)
    }

    @Test
    fun commandHashChangesWithParametersOperationAndUser() {
        val base = PreparedCommand.hashOf("supplier.create", "u", CommandRisk.SOFT, mapOf("a" to 1, "b" to 2))
        assertEquals(base, PreparedCommand.hashOf("supplier.create", "u", CommandRisk.SOFT, mapOf("b" to 2, "a" to 1)))
        assertTrue(base != PreparedCommand.hashOf("supplier.create", "u", CommandRisk.SOFT, mapOf("a" to 1, "b" to 3)))
        assertTrue(base != PreparedCommand.hashOf("supplier.update", "u", CommandRisk.SOFT, mapOf("a" to 1, "b" to 2)))
        assertTrue(base != PreparedCommand.hashOf("supplier.create", "v", CommandRisk.SOFT, mapOf("a" to 1, "b" to 2)))
        assertNull(CommandConfirmationToken.parse("nope"))
        assertNotNull(CommandConfirmationToken.parse("cct1.a.b.5.sig"))
    }

    // ---- writes remain disabled on the Agent API ----

    @Test
    fun writesRemainOffTheAgentApiAllowlistAndMcpSurface() {
        val writes = registry.writes().map { it.operationId }.toSet()
        assertTrue(writes.isNotEmpty())
        assertTrue(writes.none { AgentExecutableAllowlist.isLocalReadEnabled(it) })

        val api = RentCarAgentAPI.forAndroidLocalSupplierReads(InMemorySupplierReadPort())
        assertTrue(api.wiredExecutableOperations.none { it in writes })
        assertTrue(AgentMcpAdapter(api).listTools().none { it.operationId in writes })
        assertEquals(0, api.discover().operations.count { it.readOrWrite.name == "WRITE" && it.executable })

        registry.writes().take(25).forEach { def ->
            val op = def.operationId
            val required = (def.inputSchema["required"] as? List<*>)?.filterIsInstance<String>().orEmpty()
            val response = api.execute(
                request(op = op).copy(parameters = required.associateWith { "1" })
            )
            assertFalse(op, response.success)
            assertEquals(op, AgentErrorCode.WRITE_DISABLED, response.error?.code)
        }
    }

    @Test
    fun preparingAWriteDoesNotMakeItExecutableThroughTheApi() {
        val api = RentCarAgentAPI.forAndroidLocalSupplierReads(InMemorySupplierReadPort())
        val p = pipeline(InMemoryCommandSandbox())
        prepared(p)
        val response = api.execute(request(params = emptyMap()))
        assertFalse(response.success)
        assertEquals(AgentErrorCode.WRITE_DISABLED, response.error?.code)
    }
}
