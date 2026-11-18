package com.rentacar.app.agentapi.relay

import com.google.gson.Gson
import com.google.gson.JsonParser
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * AGENT-128: device → relay client over java.net. Production requires `https://` (enforced);
 * plain http is accepted only when [allowCleartextForTests] is true (JVM tests against a local
 * server). TLS trust follows the app's network security config (agentstage trusts only the dev
 * relay CA; standard trusts system CAs).
 *
 * Device credential: `Authorization: Device <deviceId>.<deviceSecret>` — a random per-install
 * secret, separate from the Claude-side device access token, used only to own a relay queue.
 */
class HttpsRelayDeviceClient(
    private val relayBaseUrl: String,
    private val deviceId: String,
    private val deviceSecret: String,
    private val pollTimeoutMs: Int = 25_000,
    allowCleartextForTests: Boolean = false
) : RelayDeviceClient {
    private val gson = Gson()

    init {
        require(relayBaseUrl.startsWith("https://") || (allowCleartextForTests && relayBaseUrl.startsWith("http://"))) {
            "relay URL must use https"
        }
        require(deviceId.matches(Regex("^[A-Za-z0-9-]{8,64}$"))) { "invalid deviceId" }
    }

    private val auth get() = "Device $deviceId.$deviceSecret"

    override fun register(): Boolean {
        val (status, _) = call("POST", "/device/register", "{}", readTimeoutMs = 10_000)
        return status == 200
    }

    override fun poll(): List<RelayEnvelope> {
        val (status, body) = call("POST", "/device/poll", "{}", readTimeoutMs = pollTimeoutMs + 10_000)
        if (status == 204 || body.isBlank()) return emptyList()
        if (status != 200) throw IOException("poll HTTP $status")
        val arr = JsonParser.parseString(body).asJsonObject.getAsJsonArray("requests") ?: return emptyList()
        return arr.map { e ->
            val o = e.asJsonObject
            RelayEnvelope(
                relayId = o.get("relayId").asString,
                kind = o.get("kind").asString,
                authorization = o.get("authorization")?.takeIf { !it.isJsonNull }?.asString,
                body = o.get("body")?.takeIf { !it.isJsonNull }?.asString
            )
        }
    }

    override fun respond(reply: RelayReply) {
        val payload = gson.toJson(mapOf("relayId" to reply.relayId, "status" to reply.status, "body" to reply.bodyJson))
        val (status, _) = call("POST", "/device/respond", payload, readTimeoutMs = 10_000)
        if (status != 200) throw IOException("respond HTTP $status")
    }

    override fun publishPairingOffer(offer: SealedPairingOffer): Boolean {
        val (status, _) = call("POST", "/device/pairing-offer", gson.toJson(offer), readTimeoutMs = 10_000)
        return status == 200
    }

    private fun call(method: String, path: String, json: String, readTimeoutMs: Int): Pair<Int, String> {
        val conn = URL(relayBaseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = readTimeoutMs
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", auth)
            conn.outputStream.use { it.write(json.toByteArray(StandardCharsets.UTF_8)) }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val text = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() } ?: ""
            return status to text
        } finally {
            conn.disconnect()
        }
    }
}
