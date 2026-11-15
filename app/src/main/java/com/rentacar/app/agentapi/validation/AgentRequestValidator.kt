package com.rentacar.app.agentapi.validation

import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.model.AgentError
import com.rentacar.app.agentapi.model.AgentErrorCode
import com.rentacar.app.agentapi.model.AgentRequest
import com.rentacar.app.agentapi.registry.AgentCapabilityRegistry

/**
 * Structural request validation. Does not authorize or execute.
 */
class AgentRequestValidator(
    private val registry: AgentCapabilityRegistry
) {
    fun validate(request: AgentRequest): AgentError? {
        if (request.requestId.isBlank()) {
            return error(request, AgentErrorCode.INVALID_REQUEST, "requestId is required")
        }
        if (request.operation.isBlank()) {
            return error(request, AgentErrorCode.INVALID_REQUEST, "operation is required")
        }
        if (request.apiVersion.isBlank()) {
            return error(request, AgentErrorCode.INVALID_REQUEST, "apiVersion is required")
        }
        if (request.apiVersion != AgentApiVersions.API_VERSION) {
            return error(
                request,
                AgentErrorCode.INVALID_REQUEST,
                "Unsupported apiVersion '${request.apiVersion}'. Supported: ${AgentApiVersions.API_VERSION}"
            )
        }

        // Reject SQL / arbitrary method invocation vectors in parameters.
        val forbidden = detectForbiddenParameters(request.parameters)
        if (forbidden != null) {
            return forbidden.let { (code, message) ->
                error(request, code, message)
            }
        }

        val def = registry.get(request.operation)
            ?: return error(
                request,
                AgentErrorCode.UNKNOWN_OPERATION,
                "Unknown operation '${request.operation}'"
            )

        // Declared required params (from schema metadata).
        @Suppress("UNCHECKED_CAST")
        val required = (def.inputSchema["required"] as? List<*>)?.mapNotNull { it as? String }.orEmpty()
        val missing = required.filter { key ->
            val value = request.parameters[key]
            value == null || (value is String && value.isBlank())
        }
        if (missing.isNotEmpty()) {
            return error(
                request,
                AgentErrorCode.VALIDATION_FAILED,
                "Missing required parameters: ${missing.joinToString()}",
                mapOf("missing" to missing)
            )
        }

        // Reject undeclared parameters when schema lists properties.
        @Suppress("UNCHECKED_CAST")
        val properties = def.inputSchema["properties"] as? Map<*, *>
        if (properties != null) {
            val allowed = properties.keys.map { it.toString() }.toSet()
            val unknown = request.parameters.keys.filterNot { it in allowed }
            if (unknown.isNotEmpty()) {
                return error(
                    request,
                    AgentErrorCode.INVALID_ARGUMENT,
                    "Unknown parameters: ${unknown.joinToString()}",
                    mapOf("unknown" to unknown)
                )
            }
        }

        return null
    }

    private fun detectForbiddenParameters(parameters: Map<String, Any?>): Pair<AgentErrorCode, String>? =
        Companion.detectForbiddenParameters(parameters)

    companion object {
        private val BANNED_KEYS =
            setOf("sql", "querySql", "rawSql", "statement", "method", "methodName", "jvmMethod", "reflect")

        /**
         * Rejects SQL / arbitrary-method vectors in parameter keys and values. Shared with the
         * write command pipeline so prepared commands get the same screening as reads.
         */
        fun detectForbiddenParameters(parameters: Map<String, Any?>): Pair<AgentErrorCode, String>? {
            parameters.forEach { (key, value) ->
                val keyNorm = key.lowercase()
                if (keyNorm in BANNED_KEYS || keyNorm.contains("sql")) {
                    return AgentErrorCode.SQL_NOT_ALLOWED to "Parameter '$key' is not allowed"
                }
                if (keyNorm.contains("method") || keyNorm.contains("reflect")) {
                    return AgentErrorCode.ARBITRARY_METHOD_NOT_ALLOWED to "Parameter '$key' is not allowed"
                }
                val asText = value?.toString()?.lowercase().orEmpty()
                val sqlLike = asText.replace(Regex("\\s+"), " ")
                if ((sqlLike.contains("select ") && sqlLike.contains(" from ")) ||
                    SQL_STATEMENT_MARKERS.any { sqlLike.contains(it) }
                ) {
                    return AgentErrorCode.SQL_NOT_ALLOWED to "SQL strings are not allowed in parameters"
                }
            }
            return null
        }

        /** Destructive / injection statement fragments that are never valid business parameters. */
        private val SQL_STATEMENT_MARKERS = listOf(
            "drop table", "drop database", "truncate table", "delete from", "insert into", "union select"
        )
    }

    private fun error(
        request: AgentRequest,
        code: AgentErrorCode,
        message: String,
        details: Map<String, Any?> = emptyMap()
    ): AgentError = AgentError(
        code = code,
        message = message,
        requestId = request.requestId.ifBlank { null },
        correlationId = request.correlationId,
        retryable = false,
        details = details
    )
}
