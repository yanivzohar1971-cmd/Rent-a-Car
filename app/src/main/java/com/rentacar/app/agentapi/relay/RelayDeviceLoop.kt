package com.rentacar.app.agentapi.relay

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.rentacar.app.agentapi.production.ProductionAgentGateway
import com.rentacar.app.agentapi.transport.AgentGatewayRequest

/** One request forwarded by the relay to this device. */
data class RelayEnvelope(
    val relayId: String,
    /** "tools" or "execute". */
    val kind: String,
    /** Raw Authorization header value the MCP client sent (Bearer rac1.…). Validated on the device. */
    val authorization: String?,
    val body: String?
)

data class RelayReply(val relayId: String, val status: Int, val bodyJson: String)

/** Device-side HTTP calls to the relay (HTTPS in every non-test build). */
interface RelayDeviceClient {
    /** Registers (or re-confirms) this device. Returns false when the relay rejects the credential. */
    fun register(): Boolean

    /** Long-polls for pending requests; returns an empty list on timeout. Throws on transport failure. */
    fun poll(): List<RelayEnvelope>

    fun respond(reply: RelayReply)

    fun publishPairingOffer(offer: SealedPairingOffer): Boolean
}

/**
 * AGENT-128: device side of the outbound relay. The phone never listens on a socket: it long-polls
 * the relay over TLS, executes each request through [ProductionAgentGateway] (which re-checks
 * opt-in, live session, token and read-only rules on EVERY request) and posts the answer back.
 * The relay is a router only; it holds no business authority and never sees an unencrypted
 * pairing token.
 */
class RelayDeviceLoop(
    private val client: RelayDeviceClient,
    private val gatewayProvider: () -> ProductionAgentGateway?,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
    private val log: (String) -> Unit = {}
) {
    private val gson = Gson()

    @Volatile var lastPollOkAtEpochMs: Long? = null
        private set
    @Volatile var lastRequest: Pair<String, Boolean>? = null
        private set
    @Volatile var lastError: String? = null
        private set

    /** Handles one envelope. Never throws; every failure becomes a structured reply. */
    fun handle(envelope: RelayEnvelope): RelayReply {
        val gateway = gatewayProvider()
            ?: return reply(envelope, 503, errorJson("AGENT_ACCESS_DISABLED", "Agent access is disabled or no user is signed in"))
        val token = envelope.authorization?.trim()?.removePrefix("Bearer ")?.trim()
        return try {
            when (envelope.kind) {
                "tools" -> {
                    val r = gateway.listTools(token)
                    val status = if (r.success) 200 else 401
                    reply(envelope, status, gson.toJson(r))
                }
                "execute" -> {
                    val req = parseRequest(envelope.body)
                        ?: return reply(envelope, 400, errorJson("INVALID_REQUEST", "body must be a JSON gateway request"))
                    val r = gateway.execute(token, req)
                    lastRequest = req.operation to r.success
                    reply(envelope, 200, gson.toJson(r))
                }
                else -> reply(envelope, 400, errorJson("INVALID_REQUEST", "unknown relay request kind"))
            }
        } catch (t: Throwable) {
            reply(envelope, 500, errorJson("INTERNAL_ERROR", "device failed to execute the request"))
        }
    }

    /**
     * Runs until [keepRunning] returns false. Backs off on transport errors (2s → 60s); stops polling
     * entirely while access is disabled or no user is signed in (re-checked each round).
     */
    fun run(keepRunning: () -> Boolean) {
        var backoff = 2_000L
        var registered = false
        while (keepRunning()) {
            if (gatewayProvider() == null) {
                registered = false
                sleep(5_000)
                continue
            }
            try {
                if (!registered) {
                    registered = client.register()
                    if (!registered) {
                        lastError = "relay rejected device registration"
                        sleep(60_000)
                        continue
                    }
                }
                val batch = client.poll()
                lastPollOkAtEpochMs = System.currentTimeMillis()
                lastError = null
                backoff = 2_000L
                for (env in batch) client.respond(handle(env))
            } catch (t: Throwable) {
                lastError = t.javaClass.simpleName
                log("relay poll failed: ${t.javaClass.simpleName}")
                sleep(backoff)
                backoff = (backoff * 2).coerceAtMost(60_000L)
            }
        }
    }

    private fun parseRequest(body: String?): AgentGatewayRequest? {
        if (body == null) return null
        return parseRequestJson(body)
    }

    private fun parseRequestJson(body: String): AgentGatewayRequest? = try {
        val o: JsonObject = JsonParser.parseString(body).asJsonObject
        // Reject identity fields anywhere at the top level; nested ones are rejected by the gateway.
        if (o.has("userUid") || o.has("permissions") || o.has("deviceId")) null else {
            val params: Map<String, Any?> = if (o.has("parameters") && o.get("parameters").isJsonObject)
                @Suppress("UNCHECKED_CAST")
                (gson.fromJson(o.get("parameters"), Map::class.java) as Map<String, Any?>).mapValues { (_, v) -> normalizeNumber(v) }
            else emptyMap()
            AgentGatewayRequest(
                operation = o.get("operation")?.takeIf { it.isJsonPrimitive }?.asString.orEmpty(),
                parameters = params,
                requestId = o.get("requestId")?.takeIf { it.isJsonPrimitive }?.asString.orEmpty(),
                correlationId = o.get("correlationId")?.takeIf { it.isJsonPrimitive }?.asString,
                idempotencyKey = o.get("idempotencyKey")?.takeIf { it.isJsonPrimitive }?.asString,
                expiresAtEpochMs = o.get("expiresAtEpochMs")?.takeIf { it.isJsonPrimitive }?.asLong
            )
        }
    } catch (_: Exception) {
        null
    }

    /** Gson parses every JSON number as Double; integral values become Long like the loopback router. */
    private fun normalizeNumber(v: Any?): Any? = when {
        v is Double && v % 1.0 == 0.0 && v >= Long.MIN_VALUE && v <= Long.MAX_VALUE -> v.toLong()
        v is Map<*, *> -> v.mapValues { (_, x) -> normalizeNumber(x) }
        v is List<*> -> v.map { normalizeNumber(it) }
        else -> v
    }

    private fun reply(env: RelayEnvelope, status: Int, body: String) = RelayReply(env.relayId, status, body)

    private fun errorJson(code: String, message: String) =
        gson.toJson(mapOf("success" to false, "data" to null, "error" to mapOf("code" to code, "message" to message)))
}
