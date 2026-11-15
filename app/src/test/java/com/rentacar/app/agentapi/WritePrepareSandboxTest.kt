package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.commands.CommandConfirmationTokenService
import com.rentacar.app.agentapi.commands.CommandOutcome
import com.rentacar.app.agentapi.commands.CommandPhase
import com.rentacar.app.agentapi.commands.CommandPrepareOutcome
import com.rentacar.app.agentapi.commands.InMemoryCommandAuditLog
import com.rentacar.app.agentapi.commands.InMemoryCommandSandbox
import com.rentacar.app.agentapi.commands.PreparingWriteCommandPipeline
import com.rentacar.app.agentapi.commands.SandboxWriteSpecs
import com.rentacar.app.agentapi.execution.AgentExecutableAllowlist
import com.rentacar.app.agentapi.execution.agentLocalAuth
import com.rentacar.app.agentapi.mcp.AgentMcpAdapter
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-051: customer.create / supplier.create / request.create PREPARE + PREVIEW, sandbox-only commit. */
class WritePrepareSandboxTest {
    private val registry = AgentCapabilityRegistry.loadDefault()
    private var now = 9_000_000L
    private val clock: () -> Long = { now }
    private val tokens = CommandConfirmationTokenService("sandbox-secret-0123456789abcdef".toByteArray(), clock)
    private val audit = InMemoryCommandAuditLog()
    private val sandbox = InMemoryCommandSandbox()
    private val pipeline = PreparingWriteCommandPipeline(registry, SandboxWriteSpecs.all(), tokens, audit, sandbox, clock)
    private val auth = agentLocalAuth("sb-user")

    private fun request(op: String, params: Map<String, Any?>, uid: String? = "sb-user") = AgentRequest(
        apiVersion = AgentApiVersions.API_VERSION,
        operation = op,
        requestId = "sb-req",
        target = AgentExecutionTarget.ANDROID_LOCAL,
        parameters = params,
        auth = uid?.let(::agentLocalAuth)
    )

    private val customer = mapOf("firstName" to "  Dana ", "lastName" to "Levi", "phone" to " 050-123 ")
    private val supplier = mapOf("name" to " Hertz IL ")
    private val rentalRequest = mapOf(
        "firstName" to "Noa", "lastName" to "Bar", "phone" to "052-9", "carTypeName" to "SUV"
    )

    private fun prepared(op: String, params: Map<String, Any?>) =
        pipeline.prepare(request(op, params)) as CommandPrepareOutcome.Prepared

    private fun rejected(op: String, params: Map<String, Any?>, uid: String? = "sb-user") =
        pipeline.prepare(request(op, params, uid)) as CommandPrepareOutcome.Rejected

    // ---- PREPARE + PREVIEW ----

    @Test
    fun customerCreatePreviewIsNormalizedAndNotApplied() {
        val out = prepared("customer.create", customer)
        assertEquals("customer.create", out.command.operationId)
        assertEquals(mapOf("firstName" to "Dana", "lastName" to "Levi", "phone" to "050-123"), out.command.parameters)
        assertEquals(
            listOf("firstName", "lastName", "phone"),
            out.preview.changes.map { it.field }
        )
        assertTrue(out.preview.changes.all { it.entity == "Customer" && it.before == null })
        assertEquals("Dana", out.preview.changes.first().after)
        assertTrue(out.preview.requiresConfirmation)
        assertTrue(out.preview.warnings.any { it.contains("no data has been changed") })
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun customerCreateRequiresFirstNameLastNameAndPhone() {
        listOf("firstName", "lastName", "phone").forEach { missing ->
            val out = rejected("customer.create", customer - missing)
            assertEquals(missing, CommandPhase.VALIDATE, out.receipt.phase)
            assertEquals(missing, AgentErrorCode.VALIDATION_FAILED, out.receipt.error?.code)
            assertTrue(missing, out.receipt.message.contains("$missing is required"))
        }
        val blank = rejected("customer.create", customer + ("phone" to "   "))
        assertEquals(AgentErrorCode.VALIDATION_FAILED, blank.receipt.error?.code)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("customer.create", emptyMap()).receipt.error?.code)
    }

    @Test
    fun customerCreateAcceptsOptionalEmailAndCompanyFlagOnly() {
        val ok = prepared("customer.create", customer + mapOf("email" to "d@x.io", "isCompany" to true))
        assertEquals(true, ok.command.parameters["isCompany"])
        assertEquals("d@x.io", ok.command.parameters["email"])

        // tzId/address are excluded from the Agent API (privacy-minimized), userUid is identity.
        listOf("tzId", "address", "userUid", "id", "active", "createdAt").forEach { key ->
            val out = rejected("customer.create", customer + (key to "x"))
            assertEquals(key, AgentErrorCode.VALIDATION_FAILED, out.receipt.error?.code)
            assertTrue(key, out.receipt.message.contains("unknown parameters"))
        }
        assertEquals(
            AgentErrorCode.VALIDATION_FAILED,
            rejected("customer.create", customer + ("isCompany" to "yes")).receipt.error?.code
        )
    }

    @Test
    fun supplierCreateRequiresNameAndPreviewsIt() {
        val out = prepared("supplier.create", supplier)
        assertEquals(mapOf("name" to "Hertz IL"), out.command.parameters)
        assertEquals("Supplier", out.preview.changes.single().entity)
        assertEquals("Hertz IL", out.preview.changes.single().after)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("supplier.create", emptyMap()).receipt.error?.code)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("supplier.create", mapOf("name" to " ")).receipt.error?.code)
    }

    @Test
    fun requestCreateHasAClearSchemaFromTheRoomEntity() {
        val out = prepared("request.create", rentalRequest + ("isQuote" to true))
        assertEquals("Request", out.preview.changes.first().entity)
        assertEquals(true, out.command.parameters["isQuote"])
        listOf("firstName", "lastName", "phone", "carTypeName").forEach { missing ->
            assertEquals(
                missing, AgentErrorCode.VALIDATION_FAILED,
                rejected("request.create", rentalRequest - missing).receipt.error?.code
            )
        }
    }

    @Test
    fun overlongAndControlCharacterValuesAreRejected() {
        val long = "x".repeat(SandboxWriteSpecs.MAX_TEXT_LENGTH + 1)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("customer.create", customer + ("firstName" to long)).receipt.error?.code)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("customer.create", customer + ("firstName" to "a\u0000b")).receipt.error?.code)
        assertEquals(AgentErrorCode.VALIDATION_FAILED, rejected("customer.create", customer + ("phone" to 123)).receipt.error?.code)
    }

    @Test
    fun sqlLikeValuesAndKeysAreRejectedBeforeSpecValidation() {
        val sql = rejected("supplier.create", mapOf("name" to "x'; DROP TABLE supplier; --"))
        assertEquals(AgentErrorCode.SQL_NOT_ALLOWED, sql.receipt.error?.code)
        assertEquals(CommandPhase.VALIDATE, sql.receipt.phase)
        assertEquals(
            AgentErrorCode.SQL_NOT_ALLOWED,
            rejected("customer.create", customer + ("rawSql" to "x")).receipt.error?.code
        )
    }

    @Test
    fun clientCannotSelfConfirmOrSmuggleTokensIntoPrepare() {
        val out = rejected("customer.create", customer + ("confirmationToken" to "cct1.a.b.1.c"))
        assertEquals(AgentErrorCode.VALIDATION_FAILED, out.receipt.error?.code)
    }

    @Test
    fun idempotencyKeyParameterDoesNotAffectTheCommandHash() {
        val a = prepared("supplier.create", supplier)
        val b = prepared("supplier.create", supplier + ("idempotencyKey" to "k-1"))
        assertEquals(a.command.commandHash, b.command.commandHash)
        assertFalse(b.command.parameters.containsKey("idempotencyKey"))
    }

    @Test
    fun differentWhitespaceCollapsesToTheSameCommandHash() {
        val a = prepared("supplier.create", mapOf("name" to "Alpha"))
        val b = prepared("supplier.create", mapOf("name" to "  Alpha  "))
        assertEquals(a.command.commandHash, b.command.commandHash)
    }

    @Test
    fun identityMustComeFromAuthContext() {
        assertEquals(AgentErrorCode.UNAUTHORIZED, rejected("customer.create", customer, uid = null).receipt.error?.code)
        assertEquals(
            AgentErrorCode.FORBIDDEN,
            pipeline.prepare(
                request("customer.create", customer).copy(
                    auth = com.rentacar.app.agentapi.model.AgentAuthContext(userUid = "sb-user", permissions = emptyList())
                )
            ).let { (it as CommandPrepareOutcome.Rejected).receipt.error?.code }
        )
    }

    // ---- commit lands only in the in-memory sandbox ----

    @Test
    fun commitRecordsOnlyInTheSandboxAndIsSingleUse() {
        listOf(
            "customer.create" to customer,
            "supplier.create" to supplier,
            "request.create" to rentalRequest
        ).forEach { (op, params) ->
            val out = prepared(op, params)
            val receipt = pipeline.commit(out.command.commandId, out.confirmationToken, auth)
            assertEquals(op, CommandOutcome.SANDBOX_COMMITTED, receipt.outcome)
            assertTrue(op, receipt.sandboxOnly)
            assertFalse(op, receipt.productionWritePerformed)
            assertEquals(op, CommandPhase.VERIFY, receipt.phase)
            assertEquals(op, CommandOutcome.REJECTED, pipeline.commit(out.command.commandId, out.confirmationToken, auth).outcome)
        }
        assertEquals(
            setOf("customer.create", "supplier.create", "request.create"),
            sandbox.entries().map { it.operationId }.toSet()
        )
        assertEquals(3, sandbox.entries().size)
        assertTrue(sandbox.entries().all { it.userUid == "sb-user" })
    }

    @Test
    fun withoutASandboxEvenAValidConfirmationIsWriteDisabled() {
        val noSandbox = PreparingWriteCommandPipeline(registry, SandboxWriteSpecs.all(), tokens, audit, null, clock)
        val out = noSandbox.prepare(request("customer.create", customer)) as CommandPrepareOutcome.Prepared
        val receipt = noSandbox.commit(out.command.commandId, out.confirmationToken, auth)
        assertEquals(AgentErrorCode.WRITE_DISABLED, receipt.error?.code)
        assertFalse(receipt.productionWritePerformed)
    }

    @Test
    fun commitNeedsTheConfirmationTokenAndExpires() {
        val out = prepared("supplier.create", supplier)
        assertEquals(AgentErrorCode.CONFIRMATION_REQUIRED, pipeline.commit(out.command.commandId, null, auth).error?.code)
        now += PreparingWriteCommandPipeline.DEFAULT_PREPARED_TTL_MS + 1
        assertEquals(AgentErrorCode.TIMEOUT, pipeline.commit(out.command.commandId, out.confirmationToken, auth).error?.code)
        assertTrue(sandbox.entries().isEmpty())
    }

    @Test
    fun otherUserCannotCommitAPreparedCreate() {
        val out = prepared("customer.create", customer)
        val receipt = pipeline.commit(out.command.commandId, out.confirmationToken, agentLocalAuth("intruder"))
        assertEquals(AgentErrorCode.FORBIDDEN, receipt.error?.code)
        assertTrue(sandbox.entries().isEmpty())
    }

    // ---- nothing becomes executable / mutating ----

    @Test
    fun specsOnlyCoverRegisteredWriteOperationsOffTheAllowlist() {
        val specIds = SandboxWriteSpecs.all().map { it.operationId }
        assertEquals(listOf("customer.create", "supplier.create", "request.create"), specIds)
        specIds.forEach { op ->
            assertEquals(op, "WRITE", registry.get(op)!!.readOrWrite.name)
            assertFalse(op, AgentExecutableAllowlist.isLocalReadEnabled(op))
        }
    }

    @Test
    fun preparedWritesStayNonExecutableOnApiGatewayAndMcp() {
        val supplierPort = InMemorySupplierReadPort().also { it.seed(Supplier(id = 1, name = "Existing", userUid = "sb-user")) }
        val customerPort = InMemoryCustomerReadPort().also {
            it.seed(Customer(id = 1, firstName = "Old", lastName = "Timer", phone = "1", userUid = "sb-user"))
        }
        val suppliersBefore = supplierPort.snapshot()
        val customersBefore = customerPort.snapshot()
        val api = RentCarAgentAPI.forAndroidLocalReads(supplierPort, EmptyReservationPort, customerReadPort = customerPort)

        listOf("customer.create" to customer, "supplier.create" to supplier, "request.create" to rentalRequest).forEach { (op, params) ->
            val out = prepared(op, params)
            pipeline.commit(out.command.commandId, out.confirmationToken, auth)
            // Business parameters are not part of the catalog schema, so they are refused outright...
            val withParams = api.execute(request(op, params))
            assertFalse(op, withParams.success)
            assertEquals(op, AgentErrorCode.INVALID_ARGUMENT, withParams.error?.code)
            // ...and a schema-conformant call is WRITE_DISABLED: preparing never made it executable.
            val bare = api.execute(request(op, emptyMap()))
            assertFalse(op, bare.success)
            assertEquals(op, AgentErrorCode.WRITE_DISABLED, bare.error?.code)
        }
        assertTrue(api.wiredExecutableOperations.none { it in SandboxWriteSpecs.all().map { s -> s.operationId } })
        assertTrue(AgentMcpAdapter(api).listTools().none { it.operationId.endsWith(".create") })
        // Fixture "data layer" untouched: sandbox commits never reach the read ports.
        assertEquals(suppliersBefore, supplierPort.snapshot())
        assertEquals(customersBefore, customerPort.snapshot())
        assertEquals(0, supplierPort.mutationCount)
        assertEquals(0, customerPort.mutationCount)
    }

    @Test
    fun auditTrailRecordsPrepareAndSandboxCommitWithoutParameterValues() {
        val out = prepared("customer.create", customer)
        pipeline.commit(out.command.commandId, out.confirmationToken, auth)
        val records = pipeline.auditRecords()
        assertTrue(records.any { it.outcome == CommandOutcome.PREPARED && it.userUid == "sb-user" })
        assertTrue(records.any { it.outcome == CommandOutcome.SANDBOX_COMMITTED })
        assertTrue(records.none { it.detail.contains("Dana") || it.detail.contains("050") })
        assertNull(records.first().errorCode)
    }
}
