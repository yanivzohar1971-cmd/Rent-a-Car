package com.rentacar.app.agentapi

import com.rentacar.app.BuildConfig
import com.rentacar.app.agentapi.commands.AgentDevRoomWriteCommitter
import com.rentacar.app.agentapi.commands.AgentDevWriteGate
import com.rentacar.app.agentapi.commands.CommandConfirmationTokenService
import com.rentacar.app.agentapi.commands.CommandOutcome
import com.rentacar.app.agentapi.commands.CommandRisk
import com.rentacar.app.agentapi.commands.InMemoryCommandAuditLog
import com.rentacar.app.agentapi.commands.PreparedCommand
import com.rentacar.app.agentapi.commands.PreparingWriteCommandPipeline
import com.rentacar.app.agentapi.commands.RoomWriteResult
import com.rentacar.app.agentapi.commands.SandboxWriteSpecs
import com.rentacar.app.agentapi.model.AgentErrorCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-111: gated, idempotent Room writes for customer/supplier/request create (fake data layer). */
class AgentDevRoomWriteTest {
    private val customer = AgentDevWriteFixture.customer
    private val supplier = mapOf("name" to "Hertz IL")
    private val rentalRequest = mapOf("firstName" to "Noa", "lastName" to "Bar", "phone" to "052", "carTypeName" to "SUV")

    // ---- gate ----

    @Test
    fun gateFollowsBuildConfigAndIsOffInTheProductionFlavor() {
        assertEquals(BuildConfig.AGENT_DEV_MODE, AgentDevWriteGate.roomWritesEnabled())
        assertEquals(AgentDevWriteGate.roomWritesEnabled(), AgentDevWriteGate.isEnabled())
    }

    @Test
    fun defaultPipelineWiringNeverWritesWhenTheBuildIsNotAgentDev() {
        if (BuildConfig.AGENT_DEV_MODE) return // only meaningful for the production-like standard flavor
        val fx = AgentDevWriteFixture()
        // Same wiring but relying on the DEFAULT gate (BuildConfig) instead of the injected one.
        val clock = { fx.now }
        val pipeline = PreparingWriteCommandPipeline(
            fx.registry, SandboxWriteSpecs.all(),
            CommandConfirmationTokenService("default-gate-secret-0123456789".toByteArray(), clock),
            InMemoryCommandAuditLog(), null, clock, roomCommitter = AgentDevRoomWriteCommitter(fx.ports)
        )
        val p = pipeline.prepare(fx.request("customer.create", customer)) as com.rentacar.app.agentapi.commands.CommandPrepareOutcome.Prepared
        val receipt = pipeline.commit(p.command.commandId, p.confirmationToken, fx.auth)
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun closedGateWithCommitterAndNoSandboxIsWriteDisabledAndWritesNothing() {
        val fx = AgentDevWriteFixture(gateOpen = false)
        val receipt = fx.run("customer.create", customer)
        assertEquals(CommandOutcome.REJECTED, receipt.outcome)
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertFalse(receipt.productionWritePerformed)
        assertFalse(receipt.developmentOnly)
        assertEquals(0, fx.ports.writeCalls)
        assertEquals(0, fx.committer.committedCount())
    }

    @Test
    fun closedGateFallsBackToTheSandbox() {
        val fx = AgentDevWriteFixture(gateOpen = false, withSandbox = true)
        val receipt = fx.run("customer.create", customer)
        assertEquals(CommandOutcome.SANDBOX_COMMITTED, receipt.outcome)
        assertTrue(receipt.sandboxOnly)
        assertFalse(receipt.developmentOnly)
        assertEquals(1, fx.sandbox!!.entries().size)
        assertEquals(0, fx.ports.writeCalls)
        assertTrue(fx.audit.records().last { it.outcome == CommandOutcome.SANDBOX_COMMITTED }.sandboxOnly)
    }

    @Test
    fun openGateWithoutACommitterStillNeverWritesRoom() {
        val fx = AgentDevWriteFixture(gateOpen = true, withCommitter = false)
        val receipt = fx.run("customer.create", customer)
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun committerRefusesByItselfWhenTheGateIsClosed() {
        val fx = AgentDevWriteFixture(gateOpen = false)
        val command = preparedCommand("customer.create", mapOf("firstName" to "A", "lastName" to "B", "phone" to "1"))
        val result = fx.committer.commit(command) as RoomWriteResult.Rejected
        assertEquals(AgentErrorCode.WRITE_DISABLED, result.code)
        assertEquals(0, fx.ports.writeCalls)
    }

    // ---- real Room commit (AgentDev) ----

    @Test
    fun openGateCommitsToRoomWithDevelopmentOnlyReceiptAndAudit() {
        val fx = AgentDevWriteFixture(gateOpen = true, withSandbox = true)
        val receipt = fx.run("customer.create", customer + ("isCompany" to true))

        assertEquals(CommandOutcome.ROOM_COMMITTED, receipt.outcome)
        assertTrue(receipt.developmentOnly)
        assertFalse(receipt.sandboxOnly)
        assertFalse(receipt.productionWritePerformed)
        assertEquals("Customer", receipt.committedEntityType)
        assertEquals(fx.ports.customers.single().id, receipt.committedEntityId)
        assertEquals("dev-user", fx.ports.customers.single().userUid)
        assertEquals("Dana", fx.ports.customers.single().firstName)
        assertTrue(fx.ports.customers.single().isCompany)
        // Room wins over the sandbox when both are present.
        assertTrue(fx.sandbox!!.entries().isEmpty())

        val record = fx.audit.records().last { it.outcome == CommandOutcome.ROOM_COMMITTED }
        assertTrue(record.developmentOnly)
        assertFalse(record.sandboxOnly)
        assertFalse(record.productionWritePerformed)
        assertTrue(fx.audit.records().none { it.detail.contains("Dana") })
        assertNull(record.errorCode)
    }

    @Test
    fun supplierAndRequestCreateCommitThroughRepositoriesOnlyAfterConfirmation() {
        val fx = AgentDevWriteFixture()
        val prepared = fx.prepared("supplier.create", supplier + mapOf("phone" to "03", "taxId" to "515"))
        assertEquals(0, fx.ports.writeCalls) // preparing never writes
        assertEquals(AgentErrorCode.CONFIRMATION_REQUIRED, fx.pipeline.commit(prepared.command.commandId, null, fx.auth).error?.code)
        assertEquals(0, fx.ports.writeCalls)

        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.pipeline.commit(prepared.command.commandId, prepared.confirmationToken, fx.auth).outcome)
        assertEquals("Hertz IL", fx.ports.suppliers.single().name)
        assertEquals("515", fx.ports.suppliers.single().taxId)

        val r = fx.run("request.create", rentalRequest + ("isQuote" to true))
        assertEquals("Request", r.committedEntityType)
        assertTrue(fx.ports.requests.single().isQuote)
        assertEquals("dev-user", fx.ports.requests.single().userUid)
    }

    @Test
    fun supplierCreateDoesNotOverwriteAnExistingSupplierWithTheSameName() {
        val fx = AgentDevWriteFixture()
        fx.ports.seedSupplier("dev-user", name = "Hertz IL")
        val receipt = fx.run("supplier.create", supplier)
        assertEquals(AgentErrorCode.CONFLICT, receipt.error?.code)
        assertEquals(1, fx.ports.suppliers.size)
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun preparedCommandIsSingleUse() {
        val fx = AgentDevWriteFixture()
        val p = fx.prepared("customer.create", customer)
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.pipeline.commit(p.command.commandId, p.confirmationToken, fx.auth).outcome)
        val again = fx.pipeline.commit(p.command.commandId, p.confirmationToken, fx.auth)
        assertEquals(CommandOutcome.REJECTED, again.outcome)
        assertEquals(1, fx.ports.customers.size)
    }

    @Test
    fun unsupportedOperationReachingTheCommitterIsRejectedWithoutWriting() {
        val fx = AgentDevWriteFixture()
        val result = fx.committer.commit(preparedCommand("supplier.delete", emptyMap())) as RoomWriteResult.Rejected
        assertEquals(AgentErrorCode.WRITE_DISABLED, result.code)
        assertEquals(0, fx.ports.writeCalls)
    }

    @Test
    fun committerFailuresBecomeInternalErrorReceiptsAndAreRetryable() {
        val fx = AgentDevWriteFixture()
        fx.ports.failNextInsertWith = IllegalStateException("boom: secret details")
        val failed = fx.run("customer.create", customer)
        assertEquals(CommandOutcome.REJECTED, failed.outcome)
        assertEquals(AgentErrorCode.INTERNAL_ERROR, failed.error?.code)
        assertFalse(failed.error!!.message.contains("secret")) // only the exception type leaks
        assertEquals(0, fx.ports.customers.size)
        assertEquals(0, fx.committer.committedCount())

        // Nothing was recorded, so the corrected/retried command can still commit.
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run("customer.create", customer).outcome)
        assertEquals(1, fx.ports.customers.size)
    }

    // ---- idempotency ----

    @Test
    fun sameIdempotencyKeyAndCommandNeverDoubleInserts() {
        val fx = AgentDevWriteFixture()
        val first = fx.run("customer.create", customer, idempotencyKey = "idem-1")
        val second = fx.run("customer.create", customer, idempotencyKey = "idem-1")

        assertEquals(CommandOutcome.ROOM_COMMITTED, first.outcome)
        assertFalse(first.idempotentReplay)
        assertEquals(CommandOutcome.ROOM_COMMITTED, second.outcome)
        assertTrue(second.idempotentReplay)
        assertEquals(first.committedEntityId, second.committedEntityId)
        assertEquals(1, fx.ports.customers.size)
        assertEquals(1, fx.ports.writeCalls)
        assertTrue(second.developmentOnly)
    }

    @Test
    fun reusingAnIdempotencyKeyForADifferentCommandIsAConflict() {
        val fx = AgentDevWriteFixture()
        fx.run("customer.create", customer, idempotencyKey = "idem-2")
        val other = fx.run("customer.create", customer + ("lastName" to "Cohen"), idempotencyKey = "idem-2")
        assertEquals(CommandOutcome.REJECTED, other.outcome)
        assertEquals(AgentErrorCode.CONFLICT, other.error?.code)
        assertEquals(1, fx.ports.customers.size)
    }

    @Test
    fun identicalCommandWithoutAKeyIsRejectedAsDuplicateByCommandHash() {
        val fx = AgentDevWriteFixture()
        val first = fx.run("request.create", rentalRequest)
        val duplicate = fx.run("request.create", rentalRequest)
        assertEquals(CommandOutcome.ROOM_COMMITTED, first.outcome)
        assertEquals(CommandOutcome.REJECTED, duplicate.outcome)
        assertEquals(AgentErrorCode.CONFLICT, duplicate.error?.code)
        assertEquals(1, fx.ports.requests.size)
        // A genuinely different command is still allowed.
        assertEquals(CommandOutcome.ROOM_COMMITTED, fx.run("request.create", rentalRequest + ("carTypeName" to "Mini")).outcome)
        assertEquals(2, fx.ports.requests.size)
    }

    @Test
    fun idempotencyIsScopedPerUser() {
        val fx = AgentDevWriteFixture()
        val a = preparedCommand("customer.create", mapOf("firstName" to "A", "lastName" to "B", "phone" to "1"), uid = "u1", key = "k")
        val b = preparedCommand("customer.create", mapOf("firstName" to "A", "lastName" to "B", "phone" to "1"), uid = "u2", key = "k")
        assertTrue(fx.committer.commit(a) is RoomWriteResult.Committed)
        val rb = fx.committer.commit(b)
        assertTrue(rb is RoomWriteResult.Committed)
        assertFalse((rb as RoomWriteResult.Committed).idempotentReplay)
        assertEquals(2, fx.ports.customers.size)
        assertEquals(setOf("u1", "u2"), fx.ports.customers.map { it.userUid }.toSet())
    }

    // ---- helpers ----

    private fun preparedCommand(
        op: String, params: Map<String, Any?>, uid: String = "dev-user", key: String? = null
    ): PreparedCommand = PreparedCommand(
        commandId = "cmd-direct-${System.nanoTime()}",
        operationId = op,
        parameters = params,
        userUid = uid,
        deviceId = null,
        risk = CommandRisk.SOFT,
        idempotencyKey = key,
        preparedAtEpochMs = 0,
        expiresAtEpochMs = Long.MAX_VALUE,
        commandHash = PreparedCommand.hashOf(op, uid, CommandRisk.SOFT, params)
    )
}
