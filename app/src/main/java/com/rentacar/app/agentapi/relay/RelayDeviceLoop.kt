package com.rentacar.app.agentapi.relay

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.rentacar.app.agentapi.production.ProductionAgentGateway
import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import kotlin.random.Random

/** One request forwarded by the relay to this device. [body] is the client's sealed E2E envelope. */
data class RelayEnvelope(
    val relayId: String,
    /** Only "sealed" is served (AGENT-138); anything else is rejected. */
    val kind: String,
    val clientId: String?,
    val body: String?
)

data class RelayReply(val relayId: String, val status: Int, val bodyJson: String)

/** A paired client's E2E channel as stored on the phone. */
data class ClientChannel(val clientId: String, val key: ByteArray, val secretHashHex: String)

/** Device-side HTTP calls to the relay (HTTPS in every non-test build). */
interface RelayDeviceClient {
    /** Registers this device and (re)announces its active clients. False = credential rejected. */
    fun register(activeClients: List<Pair<String, String>>): Boolean
    /** Long-polls for pending requests; empty on timeout. Throws on transport failure. */
    fun poll(): List<RelayEnvelope>
    fun respond(reply: RelayReply)
    fun publishPairingOffer(offer: SealedPairingOffer, clientId: String, clientSecretHashHex: String): Boolean
    fun removeClient(clientId: String): Boolean
}

/** Connection state shown to the owner (AGENT-137). */
enum class RelayConnectionState { STOPPED, DISABLED_OR_SIGNED_OUT, CONNECTING, CONNECTED, RELAY_UNREACHABLE, REGISTRATION_REJECTED }

/**
 * AGENT-128/137/138: device side of the outbound relay.
 *
 * The phone never listens on a socket: it long-polls the relay over TLS. Each request is an
 * end-to-end sealed envelope from a paired client; the phone decrypts it with that client's channel
 * key, enforces request expiry + replay protection, executes it through [ProductionAgentGateway]
 * (opt-in, live session, token, read-only — re-checked per request) and seals the reply.
 *
 * Reconnection: bounded exponential backoff with full jitter (2 s → 60 s); [wake] cuts a pending
 * backoff short (e.g. network restored). No business request is ever retried by the loop.
 */
class RelayDeviceLoop(
    private val client: RelayDeviceClient,
    private val gatewayProvider: () -> ProductionAgentGateway?,
    private val channels: () -> List<ClientChannel>,
    private val deviceId: String,
    private val clock: () -> Long = System::currentTimeMillis,
    private val random: Random = Random.Default,
    private val log: (String) -> Unit = {}
) {
    private val gson = Gson()
    private val replay = E2EReplayCache()
    private val wakeLock = Object()
    @Volatile private var woken = false

    @Volatile var state: RelayConnectionState = RelayConnectionState.STOPPED
        private set
    @Volatile var lastPollOkAtEpochMs: Long? = null
        private set
    @Volatile var lastSuccessfulRequestAtEpochMs: Long? = null
        private set
    @Volatile var lastRequest: Pair<String, Boolean>? = null
        private set
    @Volatile var lastError: String? = null
        private set
    /** Bumped by the runtime whenever pairings change so the relay is re-synced. */
    @Volatile var clientsDirty: Boolean = true

    /** Interrupts a backoff/idle wait (network change, owner action). */
    fun wake() {
        synchronized(wakeLock) {
            woken = true
            wakeLock.notifyAll()
        }
    }

    internal fun pause(ms: Long) {
        synchronized(wakeLock) {
            if (!woken) wakeLock.wait(ms)
            woken = false
        }
    }

    /** Next backoff with full jitter in [base/2, base], base doubling 2 s → 60 s. */
    internal fun jittered(base: Long): Long = base / 2 + (random.nextDouble() * (base / 2)).toLong()

    /** Handles one envelope. Never throws; every failure becomes a structured (unsealed, data-free) reply. */
    fun handle(envelope: RelayEnvelope): RelayReply {
        if (envelope.kind != "sealed") return plain(envelope, 400, "E2E_REQUIRED", "only end-to-end sealed requests are accepted")
        val clientId = envelope.clientId ?: return plain(envelope, 400, "INVALID_REQUEST", "missing client id")
        val channel = channels().firstOrNull { it.clientId == clientId }
            ?: return plain(envelope, 401, "UNKNOWN_CLIENT", "client is not paired with this device")
        val wire = try {
            JsonParser.parseString(envelope.body ?: "").asJsonObject
        } catch (_: Exception) {
            return plain(envelope, 400, "INVALID_REQUEST", "malformed sealed envelope")
        }
        val msgId = wire.str("msgId") ?: return plain(envelope, 400, "INVALID_REQUEST", "missing msgId")
        if (wire.str("clientId") != clientId || !msgId.matches(Regex("^[A-Za-z0-9-]{8,64}$"))) {
            return plain(envelope, 400, "INVALID_REQUEST", "envelope header mismatch")
        }
        val inner = try {
            JsonParser.parseString(
                RelayE2E.open(channel.key, RelayE2E.aad("c2d", deviceId, clientId, msgId), wire.str("ivB64")!!, wire.str("ctB64")!!)
            ).asJsonObject
        } catch (_: Exception) {
            return plain(envelope, 401, "E2E_AUTH_FAILED", "envelope could not be authenticated")
        }
        val now = clock()
        val issuedAt = inner.get("issuedAt")?.asLong ?: 0L
        val expiresAt = inner.get("expiresAt")?.asLong ?: 0L
        if (expiresAt < now - CLOCK_SKEW_MS || expiresAt - issuedAt > MAX_REQUEST_LIFETIME_MS || issuedAt > now + CLOCK_SKEW_MS) {
            return sealed(envelope, channel, msgId, 408, errorJson("REQUEST_EXPIRED", "request expired or has an invalid lifetime"))
        }
        if (!replay.firstSeen("$clientId|$msgId", now)) {
            return sealed(envelope, channel, msgId, 409, errorJson("REPLAY_DETECTED", "duplicate message id"))
        }
        val gateway = gatewayProvider()
            ?: return sealed(envelope, channel, msgId, 503, errorJson("AGENT_ACCESS_DISABLED", "Agent access is disabled or no user is signed in"))
        val token = inner.str("token")
        return try {
            when (inner.str("kind")) {
                "tools" -> {
                    val r = gateway.listTools(token)
                    sealed(envelope, channel, msgId, if (r.success) 200 else 401, gson.toJson(r))
                }
                "execute" -> {
                    val req = parseRequestJson(inner.str("body"))
                        ?: return sealed(envelope, channel, msgId, 400, errorJson("INVALID_REQUEST", "body must be a JSON gateway request"))
                    val r = gateway.execute(token, req)
                    lastRequest = req.operation to r.success
                    if (r.success) lastSuccessfulRequestAtEpochMs = now
                    sealed(envelope, channel, msgId, 200, gson.toJson(r))
                }
                else -> sealed(envelope, channel, msgId, 400, errorJson("INVALID_REQUEST", "unknown request kind"))
            }
        } catch (_: Throwable) {
            sealed(envelope, channel, msgId, 500, errorJson("INTERNAL_ERROR", "device failed to execute the request"))
        }
    }

    /**
     * Runs until [keepRunning] is false. Stops polling entirely (no network use) while access is
     * disabled or no user is signed in; re-checked every round.
     */
    fun run(keepRunning: () -> Boolean) {
        var backoff = MIN_BACKOFF_MS
        var registered = false
        state = RelayConnectionState.CONNECTING // running from here on (first round may initialize slowly)
        try {
            while (keepRunning()) {
                if (gatewayProvider() == null) {
                    state = RelayConnectionState.DISABLED_OR_SIGNED_OUT
                    registered = false
                    pause(IDLE_RECHECK_MS)
                    continue
                }
                try {
                    if (!registered || clientsDirty) {
                        state = RelayConnectionState.CONNECTING
                        clientsDirty = false
                        registered = client.register(channels().map { it.clientId to it.secretHashHex })
                        if (!registered) {
                            state = RelayConnectionState.REGISTRATION_REJECTED
                            lastError = "relay rejected device registration"
                            pause(MAX_BACKOFF_MS)
                            continue
                        }
                    }
                    val batch = client.poll()
                    lastPollOkAtEpochMs = clock()
                    state = RelayConnectionState.CONNECTED
                    lastError = null
                    backoff = MIN_BACKOFF_MS
                    for (env in batch) client.respond(handle(env))
                } catch (t: Throwable) {
                    state = RelayConnectionState.RELAY_UNREACHABLE
                    registered = false
                    lastError = t.javaClass.simpleName
                    log("relay unreachable: ${t.javaClass.simpleName}; retry in ≤${backoff / 1000}s")
                    pause(jittered(backoff))
                    backoff = (backoff * 2).coerceAtMost(MAX_BACKOFF_MS)
                }
            }
        } finally {
            state = RelayConnectionState.STOPPED
        }
    }

    private fun JsonObject.str(name: String): String? = get(name)?.takeIf { it.isJsonPrimitive }?.asString

    private fun parseRequestJson(body: String?): AgentGatewayRequest? {
        if (body == null) return null
        return try {
            val o: JsonObject = JsonParser.parseString(body).asJsonObject
            // Identity fields at the top level are refused; nested ones are rejected by the gateway.
            if (o.has("userUid") || o.has("permissions") || o.has("deviceId")) return null
            @Suppress("UNCHECKED_CAST")
            val params: Map<String, Any?> = if (o.has("parameters") && o.get("parameters").isJsonObject)
                (gson.fromJson(o.get("parameters"), Map::class.java) as Map<String, Any?>).mapValues { (_, v) -> normalizeNumber(v) }
            else emptyMap()
            AgentGatewayRequest(
                operation = o.str("operation").orEmpty(),
                parameters = params,
                requestId = o.str("requestId").orEmpty(),
                correlationId = o.str("correlationId"),
                idempotencyKey = o.str("idempotencyKey"),
                expiresAtEpochMs = o.get("expiresAtEpochMs")?.takeIf { it.isJsonPrimitive }?.asLong
            )
        } catch (_: Exception) {
            null
        }
    }

    /** Gson parses every JSON number as Double; integral values become Long like the loopback router. */
    private fun normalizeNumber(v: Any?): Any? = when {
        v is Double && v % 1.0 == 0.0 && v >= Long.MIN_VALUE && v <= Long.MAX_VALUE -> v.toLong()
        v is Map<*, *> -> v.mapValues { (_, x) -> normalizeNumber(x) }
        v is List<*> -> v.map { normalizeNumber(it) }
        else -> v
    }

    private fun sealed(env: RelayEnvelope, ch: ClientChannel, msgId: String, status: Int, innerBody: String): RelayReply {
        val payload = gson.toJson(mapOf("status" to status, "body" to innerBody))
        val (iv, ct) = RelayE2E.seal(ch.key, RelayE2E.aad("d2c", deviceId, ch.clientId, msgId), payload)
        return RelayReply(env.relayId, 200, gson.toJson(mapOf("v" to RelayE2E.VERSION, "msgId" to msgId, "ivB64" to iv, "ctB64" to ct)))
    }

    private fun plain(env: RelayEnvelope, status: Int, code: String, message: String) =
        RelayReply(env.relayId, status, errorJson(code, message))

    private fun errorJson(code: String, message: String) =
        gson.toJson(mapOf("success" to false, "data" to null, "error" to mapOf("code" to code, "message" to message)))

    companion object {
        const val MIN_BACKOFF_MS = 2_000L
        const val MAX_BACKOFF_MS = 60_000L
        const val IDLE_RECHECK_MS = 5_000L
        const val CLOCK_SKEW_MS = 120_000L
        const val MAX_REQUEST_LIFETIME_MS = 120_000L
    }
}
