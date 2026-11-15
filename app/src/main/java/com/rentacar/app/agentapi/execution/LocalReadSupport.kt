package com.rentacar.app.agentapi.execution

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.model.AgentDataSource
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentExecutionTarget
import com.rentacar.app.agentapi.model.AgentImplementationStatus
import com.rentacar.app.agentapi.model.AgentOperationDefinition
import com.rentacar.app.agentapi.model.AgentPaginationMetadata
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.model.AgentResponse
import com.rentacar.app.agentapi.model.AgentResponseMetadata
import com.rentacar.app.agentapi.model.AgentResultCompleteness
import com.rentacar.app.agentapi.model.AgentSyncStatus

/**
 * Shared helpers for Android local read executors (AGENT-019 extraction).
 * Does not enable operations by itself — callers remain allowlist-gated.
 */
object LocalReadSupport {
    const val DEFAULT_LIMIT: Int = 50
    const val MAX_LIMIT: Int = 200

    fun authorize(
        request: AgentRequest,
        definition: AgentOperationDefinition,
        readDomain: String? = null
    ): AgentError? {
        val auth = request.auth
        if (auth == null || auth.userUid.isNullOrBlank()) {
            return AgentError(
                code = AgentErrorCode.UNAUTHORIZED,
                message = if (readDomain == null) {
                    "Authenticated userUid is required for local reads"
                } else {
                    "Authenticated userUid is required for local $readDomain reads"
                },
                requestId = request.requestId,
                correlationId = request.correlationId
            )
        }
        val granted = auth.permissions.map { it.uppercase() }.toSet()
        val missing = definition.requiredPermissions.filter { it.uppercase() !in granted }
        if (missing.isNotEmpty()) {
            return AgentError(
                code = AgentErrorCode.FORBIDDEN,
                message = "Missing required permissions: ${missing.joinToString()}",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("missing" to missing)
            )
        }
        return null
    }

    fun validateLocalOrAutoTarget(request: AgentRequest, agentLabel: String): AgentError? =
        when (request.target) {
            AgentExecutionTarget.ANDROID_LOCAL,
            AgentExecutionTarget.AUTO -> null
            AgentExecutionTarget.CLOUD -> AgentError(
                code = AgentErrorCode.UNSUPPORTED_OPERATION,
                message = "CLOUD execution is disabled for $agentLabel",
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = mapOf("target" to request.target.name)
            )
        }

    fun rejectUnknownParams(
        request: AgentRequest,
        allowed: Set<String>
    ): AgentError? {
        val unknown = request.parameters.keys.filter { it !in allowed }
        if (unknown.isEmpty()) return null
        return AgentError(
            code = AgentErrorCode.INVALID_ARGUMENT,
            message = "Unsupported parameter(s): ${unknown.sorted().joinToString()}",
            requestId = request.requestId,
            correlationId = request.correlationId,
            details = mapOf("unsupported" to unknown.sorted(), "supported" to allowed.sorted())
        )
    }

    data class PageParams(val limit: Int, val offset: Int)

    fun parsePagination(request: AgentRequest): Result<PageParams> {
        val limit = parsePositiveInt(request.parameters["limit"], DEFAULT_LIMIT)
            ?: return Result.failure(IllegalArgumentException("Invalid limit"))
        if (limit > MAX_LIMIT) {
            return Result.failure(IllegalArgumentException("limit must be <= $MAX_LIMIT"))
        }
        val offset = parseNonNegativeInt(request.parameters["offset"], 0)
            ?: return Result.failure(IllegalArgumentException("Invalid offset"))
        return Result.success(PageParams(limit, offset))
    }

    fun <T> paginate(items: List<T>, page: PageParams): Triple<List<T>, Int, Boolean> {
        val slice = items.drop(page.offset).take(page.limit)
        val hasMore = page.offset + slice.size < items.size
        return Triple(slice, items.size, hasMore)
    }

    fun parseRequiredPositiveLong(
        raw: Any?,
        @Suppress("UNUSED_PARAMETER") field: String = "id"
    ): Long? {
        val value = when (raw) {
            null -> return null
            is Number -> raw.toLong()
            is String -> raw.trim().toLongOrNull() ?: return null
            else -> return null
        }
        return if (value > 0L) value else null
    }

    fun parseOptionalPositiveLong(raw: Any?): Long? {
        if (raw == null) return null
        return parseRequiredPositiveLong(raw)
    }

    fun parsePositiveInt(raw: Any?, default: Int): Int? {
        if (raw == null) return default
        val value = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.trim().toIntOrNull() ?: return null
            else -> return null
        }
        return if (value >= 1) value else null
    }

    fun parseNonNegativeInt(raw: Any?, default: Int): Int? {
        if (raw == null) return default
        val value = when (raw) {
            is Number -> raw.toInt()
            is String -> raw.trim().toIntOrNull() ?: return null
            else -> return null
        }
        return if (value >= 0) value else null
    }

    fun localMeta(request: AgentRequest, warnings: List<String>): AgentResponseMetadata =
        AgentResponseMetadata(
            source = AgentDataSource.LOCAL,
            syncStatus = AgentSyncStatus.UNKNOWN,
            resultCompleteness = AgentResultCompleteness.UNKNOWN,
            lastSuccessfulSyncEpochMs = null,
            warnings = warnings,
            executionTarget = when (request.target) {
                AgentExecutionTarget.AUTO -> AgentExecutionTarget.ANDROID_LOCAL
                else -> request.target
            },
            implementationStatus = AgentImplementationStatus.EXECUTABLE,
            executable = true
        )

    fun success(
        request: AgentRequest,
        data: Map<String, Any?>,
        warnings: List<String>,
        pagination: AgentPaginationMetadata? = null
    ): AgentResponse = AgentResponse(
        success = true,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = data,
        metadata = localMeta(request, warnings),
        error = null,
        pagination = pagination
    )

    fun failure(
        request: AgentRequest,
        error: AgentError,
        warnings: List<String> = listOf("Local read did not return business data"),
        metadata: AgentResponseMetadata? = null
    ): AgentResponse = AgentResponse(
        success = false,
        apiVersion = AgentApiVersions.API_VERSION,
        operation = request.operation,
        requestId = request.requestId,
        correlationId = request.correlationId,
        data = null,
        metadata = metadata ?: AgentResponseMetadata(
            source = AgentDataSource.LOCAL,
            syncStatus = AgentSyncStatus.UNKNOWN,
            resultCompleteness = AgentResultCompleteness.UNKNOWN,
            warnings = warnings,
            executionTarget = request.target,
            implementationStatus = AgentImplementationStatus.IMPLEMENTED,
            executable = true
        ),
        error = error
    )

    fun invalidArgument(
        request: AgentRequest,
        message: String,
        details: Map<String, Any?> = emptyMap(),
        warnings: List<String> = listOf("Local read did not return business data")
    ) =
        failure(
            request,
            AgentError(
                code = AgentErrorCode.INVALID_ARGUMENT,
                message = message,
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = details
            ),
            warnings = warnings
        )

    fun notFound(request: AgentRequest, message: String, details: Map<String, Any?> = emptyMap()) =
        failure(
            request,
            AgentError(
                code = AgentErrorCode.NOT_FOUND,
                message = message,
                requestId = request.requestId,
                correlationId = request.correlationId,
                details = details
            ),
            warnings = listOf("Read from local Room; record not found in authorized scope")
        )

    fun internalError(request: AgentRequest, safeMessage: String) =
        failure(
            request,
            AgentError(
                code = AgentErrorCode.INTERNAL_ERROR,
                message = safeMessage,
                requestId = request.requestId,
                correlationId = request.correlationId,
                retryable = true
            )
        )
}
