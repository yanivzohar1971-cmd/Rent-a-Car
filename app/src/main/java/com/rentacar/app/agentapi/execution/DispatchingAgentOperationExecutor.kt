package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentReadOrWrite
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry
import com.rentacar.app.agentapi.validation.AgentRequestValidator

/**
 * Routes allowlisted local reads to the wired Android local executors;
 * everything else stays disabled / write-blocked.
 */
class DispatchingAgentOperationExecutor(
    private val registry: AgentCapabilityRegistry,
    private val localSupplierReadExecutor: AndroidLocalSupplierReadExecutor? = null,
    private val localReservationReadExecutor: AndroidLocalReservationReadExecutor? = null,
    private val localCustomerReadExecutor: AndroidLocalCustomerReadExecutor? = null,
    private val localFinanceExecutor: AndroidLocalFinanceExecutor? = null,
    private val localSalesExecutor: AndroidLocalSalesExecutor? = null,
    private val localFleetExecutor: AndroidLocalFleetExecutor? = null,
    private val localReportingExecutor: AndroidLocalReportingExecutor? = null,
    private val localCatalogReservationExtExecutor: AndroidLocalCatalogAndReservationExtExecutor? = null,
    private val localImportLogExecutor: AndroidLocalImportLogExecutor? = null,
    private val validator: AgentRequestValidator = AgentRequestValidator(registry)
) : AgentOperationExecutor {

    val wiredLocalOperations: Set<String> = buildSet {
        if (localSupplierReadExecutor != null) addAll(AgentExecutableAllowlist.SUPPLIER_LOCAL_READS)
        if (localReservationReadExecutor != null) addAll(AgentExecutableAllowlist.RESERVATION_LOCAL_READS)
        if (localCustomerReadExecutor != null) addAll(AgentExecutableAllowlist.CUSTOMER_LOCAL_READS)
        if (localFinanceExecutor != null) addAll(AgentExecutableAllowlist.FINANCE_LOCAL_READS)
        if (localSalesExecutor != null) addAll(AgentExecutableAllowlist.SALES_LOCAL_READS)
        if (localFleetExecutor != null) addAll(AgentExecutableAllowlist.FLEET_LOCAL_READS)
        if (localReportingExecutor != null) addAll(AgentExecutableAllowlist.REPORTING_LOCAL_READS)
        if (localImportLogExecutor != null) addAll(AgentExecutableAllowlist.IMPORT_LOG_LOCAL_READS)
        if (localCatalogReservationExtExecutor != null) {
            addAll(AgentExecutableAllowlist.CATALOG_RESERVATION_EXT_LOCAL_READS)
        }
    }

    override fun execute(request: AgentRequest): AgentResponse {
        val validationError = validator.validate(request)
        if (validationError != null) {
            return failure(request, validationError)
        }

        val def = registry.get(request.operation)
            ?: return failure(
                request,
                AgentError(
                    code = AgentErrorCode.UNKNOWN_OPERATION,
                    message = "Unknown operation '${request.operation}'",
                    requestId = request.requestId,
                    correlationId = request.correlationId
                )
            )

        if (def.readOrWrite == AgentReadOrWrite.WRITE) {
            return failure(
                request,
                AgentError(
                    code = AgentErrorCode.WRITE_DISABLED,
                    message = "Write operations are disabled",
                    requestId = request.requestId,
                    correlationId = request.correlationId,
                    details = mapOf("operation" to def.operationId)
                ),
                metadata = meta(request, executable = false, status = def.implementationStatus)
            )
        }

        if (AgentExecutableAllowlist.isSupplierLocalRead(request.operation)) {
            val local = localSupplierReadExecutor
                ?: return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.NOT_IMPLEMENTED,
                        message = "Local supplier read executor is not wired",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    ),
                    metadata = meta(request, executable = false, status = AgentImplementationStatus.IMPLEMENTED)
                )
            return local.execute(request, def)
        }

        if (AgentExecutableAllowlist.isReservationLocalRead(request.operation)) {
            val local = localReservationReadExecutor
                ?: return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.NOT_IMPLEMENTED,
                        message = "Local reservation read executor is not wired",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    ),
                    metadata = meta(request, executable = false, status = AgentImplementationStatus.IMPLEMENTED)
                )
            return local.execute(request, def)
        }

        if (AgentExecutableAllowlist.isCustomerLocalRead(request.operation)) {
            val local = localCustomerReadExecutor
                ?: return failure(
                    request,
                    AgentError(
                        code = AgentErrorCode.NOT_IMPLEMENTED,
                        message = "Local customer read executor is not wired",
                        requestId = request.requestId,
                        correlationId = request.correlationId
                    ),
                    metadata = meta(request, executable = false, status = AgentImplementationStatus.IMPLEMENTED)
                )
            return local.execute(request, def)
        }

        if (AgentExecutableAllowlist.isFinanceLocalRead(request.operation)) {
            return localFinanceExecutor?.execute(request, def)
                ?: notWired(request, "finance", def.implementationStatus)
        }
        if (AgentExecutableAllowlist.isSalesLocalRead(request.operation)) {
            return localSalesExecutor?.execute(request, def)
                ?: notWired(request, "sales", def.implementationStatus)
        }
        if (AgentExecutableAllowlist.isFleetLocalRead(request.operation)) {
            return localFleetExecutor?.execute(request, def)
                ?: notWired(request, "fleet", def.implementationStatus)
        }
        if (AgentExecutableAllowlist.isReportingLocalRead(request.operation)) {
            return localReportingExecutor?.execute(request, def)
                ?: notWired(request, "reporting", def.implementationStatus)
        }
        if (AgentExecutableAllowlist.isImportLogLocalRead(request.operation)) {
            return localImportLogExecutor?.execute(request, def)
                ?: notWired(request, "import log", def.implementationStatus)
        }
        if (AgentExecutableAllowlist.isCatalogReservationExtLocalRead(request.operation)) {
            return localCatalogReservationExtExecutor?.execute(request, def)
                ?: notWired(request, "catalog/reservation extension", def.implementationStatus)
        }

        return failure(
            request,
            AgentError(
                code = AgentErrorCode.EXECUTION_DISABLED,
                message = "Operation '${def.operationId}' is registered but not executable yet",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf(
                    "implementationStatus" to def.implementationStatus.name,
                    "executable" to false
                )
            ),
            metadata = meta(request, executable = false, status = def.implementationStatus)
        )
    }

    private fun meta(
        request: AgentRequest,
        executable: Boolean,
        status: AgentImplementationStatus
    ) = AgentResponseMetadata(
        source = AgentDataSource.UNKNOWN,
        syncStatus = AgentSyncStatus.UNKNOWN,
        resultCompleteness = AgentResultCompleteness.UNKNOWN,
        lastSuccessfulSyncEpochMs = null,
        warnings = listOf("Operation was not executed against business data"),
        executionTarget = request.target,
        implementationStatus = status,
        executable = executable
    )

    private fun failure(
        request: AgentRequest,
        error: AgentError,
        metadata: AgentResponseMetadata = meta(
            request,
            executable = false,
            status = AgentImplementationStatus.REGISTERED
        )
    ): AgentResponse = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = metadata,
        error = error
    )

    private fun notWired(
        request: AgentRequest,
        domain: String,
        status: AgentImplementationStatus
    ) = failure(
        request,
        AgentError(
            code = AgentErrorCode.EXECUTION_DISABLED,
            message = "Local $domain read executor is not wired",
            requestId = request.requestId,
            correlationId = request.correlationId
        ),
        metadata = meta(request, executable = false, status = status)
    )
}
