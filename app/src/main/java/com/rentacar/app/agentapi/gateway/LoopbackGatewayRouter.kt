package com.rentacar.app.agentapi.gateway

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonSyntaxException
import com.google.gson.ToNumberPolicy
import com.google.gson.reflect.TypeToken
import com.rentacar.app.agentapi.AgentApiVersions
import com.rentacar.app.agentapi.transport.AgentGatewayError
import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import com.rentacar.app.agentapi.transport.AuthenticatedAgentGateway
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.DeviceIdentity
import com.rentacar.app.agentapi.transport.DevicePairingService
import com.rentacar.app.agentapi.transport.DeviceTokenSigner
import com.rentacar.app.agentapi.transport.GatewayErrorCodes
import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import java.nio.charset.StandardCharsets

data class GatewayHttpResult(
    val status: Int,
    val body: String,
    val contentType: String = "application/json; charset=utf-8"
)

/**
 * DEVELOPMENT ONLY. Socket-free HTTP-shaped router for the authenticated gateway.
 *
 * This class contains no networking and no Android dependencies. A JVM-only HTTP
 * binding (`LoopbackAgentGatewayServer`, built on `com.sun.net.httpserver`) lives in the
 * unit-test source set and is unavailable on Android. Nothing here is started from
 * `Application.onCreate`, and no production code references this router.
 *
 * Endpoints:
 *  - GET  /v1/health  (unauthenticated, no business data)
 *  - GET  /v1/tools   (Bearer device token)
 *  - POST /v1/execute (Bearer device token)
 *  - POST /v1/pair    (test-only; needs [devPairingSecret] in X-Rentacar-Dev-Pairing-Secret;
 *                      identity comes from [trustedSessionBinder], never from the body)
 */
class LoopbackGatewayRouter(
    private val gateway: AuthenticatedAgentGateway,
    private val pairingService: DevicePairingService,
    private val trustedSessionBinder: TrustedSessionBinder? = null,
    private val devPairingSecret: String? = null,
    private val maxPairingTtlMs: Long = DEFAULT_PAIRING_TTL_MS
) {
    fun handle(
        method: String,
        path: String,
        headers: Map<String, String>,
        body: String?
    ): GatewayHttpResult {
        val h = headers.entries.associate { it.key.lowercase() to it.value }
        val cleanPath = path.substringBefore('?').trimEnd('/').ifEmpty { "/" }
        return try {
            when (cleanPath) {
                "/v1/health" -> only(method, "GET") { health() }
                "/v1/tools" -> only(method, "GET") { tools(h) }
                "/v1/execute" -> only(method, "POST") { execute(h, body) }
                "/v1/pair" -> only(method, "POST") { pair(h, body) }
                else -> error(404, GatewayErrorCodesHttp.NOT_FOUND, "Not found")
            }
        } catch (_: Throwable) {
            error(500, GatewayErrorCodes.INTERNAL_ERROR, "Gateway failure")
        }
    }

    private fun only(method: String, expected: String, block: () -> GatewayHttpResult) =
        if (method.equals(expected, ignoreCase = true)) block()
        else error(405, GatewayErrorCodesHttp.METHOD_NOT_ALLOWED, "Method not allowed")

    private fun health() = ok(
        mapOf(
            "status" to "ok",
            "mode" to "DEVELOPMENT_ONLY",
            "apiVersion" to AgentApiVersions.API_VERSION
        )
    )

    private fun tools(headers: Map<String, String>): GatewayHttpResult {
        val response = gateway.listTools(bearer(headers))
        if (!response.success) {
            return error(401, response.error!!.code, response.error.message)
        }
        return ok(
            mapOf(
                "tools" to response.tools.map {
                    mapOf(
                        "name" to it.name,
                        "description" to it.description,
                        "inputSchema" to it.inputSchema
                    )
                }
            )
        )
    }

    private fun execute(headers: Map<String, String>, body: String?): GatewayHttpResult {
        val parsed = parseObject(body) ?: return error(400, GatewayErrorCodes.INVALID_REQUEST, "Body must be a JSON object")
        val identityKey = parsed.keys.firstOrNull { it.lowercase() in AuthenticatedAgentGateway.FORBIDDEN_IDENTITY_KEYS }
        if (identityKey != null) {
            return error(
                400,
                GatewayErrorCodes.FORBIDDEN_FIELD,
                "Field '$identityKey' is not accepted: identity is derived from the device token"
            )
        }
        val unknown = parsed.keys.filter { it !in EXECUTE_FIELDS }
        if (unknown.isNotEmpty()) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "Unsupported field(s): ${unknown.sorted().joinToString()}")
        }
        val operation = parsed["operation"] as? String
            ?: return error(400, GatewayErrorCodes.INVALID_REQUEST, "operation (string) is required")
        val requestId = parsed["requestId"] as? String
            ?: return error(400, GatewayErrorCodes.INVALID_REQUEST, "requestId (string) is required")
        val rawParams = parsed["parameters"]
        if (rawParams != null && rawParams !is Map<*, *>) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "parameters must be an object")
        }
        @Suppress("UNCHECKED_CAST")
        val parameters = (rawParams as? Map<String, Any?>) ?: emptyMap()
        val expiresAt = parsed["expiresAtEpochMs"]
        if (expiresAt != null && expiresAt !is Number) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "expiresAtEpochMs must be a number")
        }
        val request = AgentGatewayRequest(
            operation = operation,
            parameters = parameters,
            requestId = requestId,
            correlationId = parsed["correlationId"] as? String,
            idempotencyKey = parsed["idempotencyKey"] as? String,
            expiresAtEpochMs = (expiresAt as? Number)?.toLong()
        )
        val response = gateway.execute(bearer(headers), request)
        val status = when (response.error?.code) {
            null -> 200
            GatewayErrorCodes.UNAUTHORIZED, GatewayErrorCodes.TOKEN_EXPIRED,
            GatewayErrorCodes.TOKEN_REVOKED -> 401
            GatewayErrorCodes.FORBIDDEN_FIELD, GatewayErrorCodes.INVALID_REQUEST -> 400
            GatewayErrorCodes.REQUEST_EXPIRED -> 408
            GatewayErrorCodes.REPLAY_DETECTED -> 409
            else -> 200 // executed by the Agent API; outcome is in `success` / `error`
        }
        return GatewayHttpResult(status, gson.toJson(response))
    }

    private fun pair(headers: Map<String, String>, body: String?): GatewayHttpResult {
        val expected = devPairingSecret
        val binder = trustedSessionBinder
        if (expected.isNullOrEmpty() || binder == null) {
            return error(404, GatewayErrorCodesHttp.NOT_FOUND, "Not found")
        }
        val presented = headers[PAIRING_SECRET_HEADER.lowercase()].orEmpty()
        if (!DeviceTokenSigner.constantTimeEquals(presented, expected)) {
            return error(403, GatewayErrorCodesHttp.FORBIDDEN, "Invalid pairing secret")
        }
        val parsed = parseObject(body) ?: return error(400, GatewayErrorCodes.INVALID_REQUEST, "Body must be a JSON object")
        val identityKey = parsed.keys.firstOrNull { it.lowercase() in PAIR_FORBIDDEN_KEYS }
        if (identityKey != null) {
            return error(
                400,
                GatewayErrorCodes.FORBIDDEN_FIELD,
                "Field '$identityKey' is not accepted: pairing binds the app's authenticated session"
            )
        }
        val unknown = parsed.keys.filter { it !in PAIR_FIELDS }
        if (unknown.isNotEmpty()) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "Unsupported field(s): ${unknown.sorted().joinToString()}")
        }
        val deviceId = parsed["deviceId"] as? String
        if (deviceId.isNullOrBlank()) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "deviceId (string) is required")
        }
        val ttl = (parsed["ttlMs"] as? Number)?.toLong() ?: maxPairingTtlMs
        if (ttl <= 0 || ttl > maxPairingTtlMs) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "ttlMs must be in 1..$maxPairingTtlMs")
        }
        val session = BoundSessionIdentity.fromTrustedBinder(binder)
            ?: return error(401, GatewayErrorCodes.UNAUTHORIZED, "No authenticated app session to bind")
        val device = try {
            DeviceIdentity(deviceId, (parsed["displayName"] as? String).orEmpty().ifBlank { deviceId })
        } catch (_: IllegalArgumentException) {
            return error(400, GatewayErrorCodes.INVALID_REQUEST, "Invalid deviceId")
        }
        val result = pairingService.pair(device, session, ttl)
        return ok(
            mapOf(
                "token" to result.presentedToken,
                "tokenId" to result.token.tokenId,
                "deviceId" to device.deviceId,
                "expiresAtEpochMs" to result.token.expiresAtEpochMs
            )
        )
    }

    private fun bearer(headers: Map<String, String>): String? {
        val value = headers["authorization"]?.trim() ?: return null
        if (!value.regionMatches(0, "Bearer ", 0, 7, ignoreCase = true)) return null
        return value.substring(7).trim().ifEmpty { null }
    }

    private fun parseObject(body: String?): Map<String, Any?>? {
        if (body.isNullOrBlank()) return null
        if (body.toByteArray(StandardCharsets.UTF_8).size > MAX_BODY_BYTES) return null
        return try {
            gson.fromJson<Map<String, Any?>>(body, MAP_TYPE)
        } catch (_: JsonSyntaxException) {
            null
        } catch (_: RuntimeException) {
            null
        }
    }

    private fun ok(payload: Any) = GatewayHttpResult(200, gson.toJson(payload))

    private fun error(status: Int, code: String, message: String) = GatewayHttpResult(
        status,
        gson.toJson(
            mapOf(
                "success" to false,
                "error" to AgentGatewayError(code = code, message = message)
            )
        )
    )

    private object GatewayErrorCodesHttp {
        const val NOT_FOUND = "NOT_FOUND"
        const val METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
        const val FORBIDDEN = "FORBIDDEN"
    }

    companion object {
        const val PAIRING_SECRET_HEADER: String = "X-Rentacar-Dev-Pairing-Secret"
        const val MAX_BODY_BYTES: Int = 64 * 1024
        const val DEFAULT_PAIRING_TTL_MS: Long = 24L * 60 * 60 * 1000

        private val EXECUTE_FIELDS = setOf(
            "operation", "parameters", "requestId", "correlationId", "idempotencyKey", "expiresAtEpochMs"
        )
        private val PAIR_FIELDS = setOf("deviceId", "displayName", "ttlMs")

        /** Identity keys a client may never send to /v1/pair (deviceId is the device's own id). */
        private val PAIR_FORBIDDEN_KEYS = AuthenticatedAgentGateway.FORBIDDEN_IDENTITY_KEYS - "deviceid"
        private val MAP_TYPE = object : TypeToken<Map<String, Any?>>() {}.type

        private val gson: Gson = GsonBuilder()
            .serializeNulls()
            .setObjectToNumberStrategy(ToNumberPolicy.LONG_OR_DOUBLE)
            .setNumberToNumberStrategy(ToNumberPolicy.LONG_OR_DOUBLE)
            .create()
    }
}
