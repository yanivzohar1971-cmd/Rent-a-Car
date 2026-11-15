package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.execution.DisabledAgentOperationExecutor
import com.rentacar.app.agentapi.json.AgentApiJson
import com.rentacar.app.agentapi.model.AgentConfirmationPolicy
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentOperationRisk
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.registry.GeneratedOperationCatalog
import com.rentacar.app.agentapi.validation.AgentRequestValidator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AgentApiContractTest {

    private lateinit var registry: AgentCapabilityRegistry
    private lateinit var api: RentCarAgentAPI
    private lateinit var executor: DisabledAgentOperationExecutor

    @Before
    fun setUp() {
        registry = AgentCapabilityRegistry.loadDefault()
        executor = DisabledAgentOperationExecutor(registry)
        api = RentCarAgentAPI(registry = registry, executor = executor)
    }

    // TEST 001 / 005
    @Test
    fun everyOperationHasUniqueRegistryEntry() {
        val ids = registry.all().map { it.operationId }
        assertEquals(ids.size, ids.toSet().size)
        assertEquals(GeneratedOperationCatalog.EXPECTED_TOTAL, ids.size)
    }

    // TEST 002
    @Test
    fun readOperationsClassifiedCorrectly() {
        assertEquals(GeneratedOperationCatalog.EXPECTED_READ, registry.reads().size)
        assertTrue(registry.reads().all { it.readOrWrite == AgentReadOrWrite.READ })
    }

    // TEST 003
    @Test
    fun writeOperationsClassifiedCorrectly() {
        assertEquals(GeneratedOperationCatalog.EXPECTED_WRITE, registry.writes().size)
        assertTrue(registry.writes().all { it.readOrWrite == AgentReadOrWrite.WRITE })
    }

    // TEST 004 — reconciled inventory counts (not the outdated 196/98/98 claim)
    @Test
    fun registryCountMatchesReconciledPhase0Inventory() {
        assertEquals(GeneratedOperationCatalog.EXPECTED_TOTAL, registry.size())
        assertEquals(GeneratedOperationCatalog.EXPECTED_READ, registry.reads().size)
        assertEquals(GeneratedOperationCatalog.EXPECTED_WRITE, registry.writes().size)
        assertEquals(204, GeneratedOperationCatalog.EXPECTED_TOTAL)
        assertEquals(105, GeneratedOperationCatalog.EXPECTED_READ)
        assertEquals(99, GeneratedOperationCatalog.EXPECTED_WRITE)
        // Document the Phase 0 summary drift explicitly.
        assertEquals(196, GeneratedOperationCatalog.PHASE0_SUMMARY_CLAIM_TOTAL)
        assertNotNull(registry.reconciliationNote)
    }

    // TEST 006
    @Test
    fun invalidRequestSchemasAreRejected() {
        val validator = AgentRequestValidator(registry)
        val missingVersion = AgentRequest(
            apiVersion = "",
            operation = "reservation.get",
            requestId = "r1",
            parameters = mapOf("id" to 1)
        )
        assertEquals(AgentErrorCode.INVALID_REQUEST, validator.validate(missingVersion)?.code)

        val badVersion = missingVersion.copy(apiVersion = "9.9")
        assertEquals(AgentErrorCode.INVALID_REQUEST, validator.validate(badVersion)?.code)

        val unknownParam = AgentRequest(
            apiVersion = AgentApiVersions.API_VERSION,
            operation = "reservation.get",
            requestId = "r2",
            parameters = mapOf("id" to 1, "notDeclared" to "x")
        )
        assertEquals(AgentErrorCode.INVALID_ARGUMENT, validator.validate(unknownParam)?.code)
    }

    // TEST 007
    @Test
    fun unknownOperationsReturnUnknownOperation() {
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = "does.not.exist",
                requestId = "u1"
            )
        )
        assertFalse(response.success)
        assertEquals(AgentErrorCode.UNKNOWN_OPERATION, response.error?.code)
    }

    // TEST 008
    @Test
    fun unimplementedOperationsCannotBeExecuted() {
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = "supplier.list",
                requestId = "r-read"
            )
        )
        assertFalse(response.success)
        assertTrue(
            response.error?.code == AgentErrorCode.EXECUTION_DISABLED ||
                response.error?.code == AgentErrorCode.NOT_IMPLEMENTED
        )
        assertNull(response.data)
    }

    // TEST 009
    @Test
    fun writeOperationsRemainDisabled() {
        val writeOp = registry.writes().first()
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = writeOp.operationId,
                requestId = "w1",
                parameters = emptyMap()
            )
        )
        assertFalse(response.success)
        assertEquals(AgentErrorCode.WRITE_DISABLED, response.error?.code)
    }

    // TEST 010
    @Test
    fun responseStructuresSerializeAndDeserialize() {
        val original = AgentResponse(
            success = false,
            apiVersion = AgentApiVersions.API_VERSION,
            operation = "supplier.list",
            requestId = "s1",
            correlationId = "c1",
            data = null,
            metadata = AgentResponseMetadata(
                source = AgentDataSource.UNKNOWN,
                syncStatus = AgentSyncStatus.UNKNOWN,
                resultCompleteness = AgentResultCompleteness.UNKNOWN,
                lastSuccessfulSyncEpochMs = null,
                warnings = listOf("test")
            ),
            error = AgentError(
                code = AgentErrorCode.EXECUTION_DISABLED,
                message = "disabled",
                requestId = "s1"
            )
        )
        val json = AgentApiJson.toJson(original)
        val roundTrip = AgentApiJson.responseFromJson(json)
        assertEquals(original.success, roundTrip.success)
        assertEquals(original.operation, roundTrip.operation)
        assertEquals(original.requestId, roundTrip.requestId)
        assertEquals(original.metadata.syncStatus, roundTrip.metadata.syncStatus)
        assertEquals(original.error?.code, roundTrip.error?.code)
    }

    // TEST 011
    @Test
    fun errorStructuresSerializeAndDeserialize() {
        val error = AgentError(
            code = AgentErrorCode.VALIDATION_FAILED,
            message = "missing id",
            requestId = "e1",
            correlationId = "corr",
            retryable = false,
            details = mapOf("missing" to listOf("id"))
        )
        val json = AgentApiJson.toJson(error)
        val roundTrip = AgentApiJson.errorFromJson(json)
        assertEquals(error.code, roundTrip.code)
        assertEquals(error.message, roundTrip.message)
        assertEquals(error.requestId, roundTrip.requestId)
    }

    // TEST 012
    @Test
    fun unknownSynchronizationStateIsExplicit() {
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = "supplier.list",
                requestId = "sync1"
            )
        )
        assertEquals(AgentSyncStatus.UNKNOWN, response.metadata.syncStatus)
        assertEquals(AgentDataSource.UNKNOWN, response.metadata.source)
        assertEquals(AgentResultCompleteness.UNKNOWN, response.metadata.resultCompleteness)
        assertNull(response.metadata.lastSuccessfulSyncEpochMs)
    }

    // TEST 013
    @Test
    fun riskAndConfirmationPoliciesAreConsistent() {
        registry.all().forEach { op ->
            assertNotNull(op.risk)
            assertNotNull(op.confirmationPolicy)
            assertTrue(op.risk in AgentOperationRisk.entries.toTypedArray())
            assertTrue(op.confirmationPolicy in AgentConfirmationPolicy.entries.toTypedArray())
            if (op.confirmationPolicy == AgentConfirmationPolicy.CRITICAL) {
                assertTrue(
                    op.risk == AgentOperationRisk.CRITICAL || op.risk == AgentOperationRisk.HIGH
                )
            }
        }
    }

    // TEST 014
    @Test
    fun registryCannotExposeUnrestrictedSqlExecution() {
        assertTrue(registry.all().none { it.operationId.contains("sql", ignoreCase = true) })
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = "supplier.list",
                requestId = "sql1",
                parameters = mapOf("sql" to "SELECT * FROM reservations")
            )
        )
        assertEquals(AgentErrorCode.SQL_NOT_ALLOWED, response.error?.code)
    }

    // TEST 015
    @Test
    fun registryCannotInvokeArbitraryApplicationMethods() {
        val response = api.execute(
            AgentRequest(
                apiVersion = AgentApiVersions.API_VERSION,
                operation = "supplier.list",
                requestId = "m1",
                parameters = mapOf("methodName" to "Runtime.getRuntime")
            )
        )
        assertEquals(AgentErrorCode.ARBITRARY_METHOD_NOT_ALLOWED, response.error?.code)
    }

    // TEST 016
    @Test
    fun noOperationBypassesExecutionDisabledViaMissingPolicyMetadata() {
        assertEquals(0, registry.executableCount())
        registry.all().forEach { op ->
            assertFalse(op.executable)
            assertNotNull(op.confirmationPolicy)
            assertNotNull(op.risk)
            assertTrue(op.requiredPermissions.isNotEmpty())
            val response = api.execute(
                AgentRequest(
                    apiVersion = AgentApiVersions.API_VERSION,
                    operation = op.operationId,
                    requestId = "all-${op.operationId}",
                    target = AgentExecutionTarget.AUTO,
                    parameters = emptyMap()
                )
            )
            assertFalse("Operation ${op.operationId} must not succeed", response.success)
            assertNull(response.data)
        }
    }

    @Test
    fun discoveryNeverAdvertisesExecutableOperations() {
        val doc = api.discover()
        assertEquals(GeneratedOperationCatalog.EXPECTED_TOTAL, doc.registeredOperations)
        assertEquals(0, doc.executableOperations)
        assertTrue(doc.operations.none { it.executable })
    }

    @Test
    fun requestRoundTripSerialization() {
        val request = AgentRequest(
            apiVersion = AgentApiVersions.API_VERSION,
            operation = "reservation.get",
            requestId = "req-1",
            target = AgentExecutionTarget.ANDROID_LOCAL,
            parameters = mapOf("id" to 42),
            correlationId = "corr-1",
            idempotencyKey = "idem-1"
        )
        val json = AgentApiJson.toJson(request)
        val parsed = AgentApiJson.requestFromJson(json)
        assertEquals(request.operation, parsed.operation)
        assertEquals(request.requestId, parsed.requestId)
        assertEquals(request.target, parsed.target)
        assertEquals(42.0, parsed.parameters["id"]) // Gson numbers become Double
    }
}
