package com.rentacar.app.agentapi.relay

import com.google.gson.Gson
import com.google.gson.JsonParser
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * AGENT-128/138: device → relay client over java.net. Production requires `https://` (enforced);
 * plain http is accepted only when [allowCleartextForTests] is true (JVM tests against a local
 * server). TLS trust is the platform's (system CAs; the agentstage build additionally trusts only the
 * dev relay certificate for 10.0.2.2). There is no custom TrustManager / HostnameVerifier anywhere.
 *
 * Device credential: `Authorization: Device <deviceId>.<deviceSecret>` — a random per-install
 * secret, separate from Claude-side device access tokens, used only to own a relay queue.
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

    override fun register(activeClients: List<Pair<String, String>>): Boolean {
        val body = gson.toJson(mapOf("clients" to activeClients.map { mapOf("clientId" to it.first, "secretHash" to it.second) }))
        val (status, _) = call("POST", "/device/register", body, readTimeoutMs = 10_000)
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
                clientId = o.get("clientId")?.takeIf { !it.isJsonNull }?.asString,
                body = o.get("body")?.takeIf { !it.isJsonNull }?.asString
            )
        }
    }

    override fun respond(reply: RelayReply) {
        val payload = gson.toJson(mapOf("relayId" to reply.relayId, "status" to reply.status, "body" to reply.bodyJson))
        val (status, _) = call("POST", "/device/respond", payload, readTimeoutMs = 10_000)
        if (status != 200 && status != 404) throw IOException("respond HTTP $status")
    }

    override fun publishPairingOffer(offer: SealedPairingOffer, clientId: String, clientSecretHashHex: String): Boolean {
        val body = gson.toJson(
            mapOf(
                "codeId" to offer.codeId, "deviceId" to offer.deviceId, "saltB64" to offer.saltB64,
                "ivB64" to offer.ivB64, "ciphertextB64" to offer.ciphertextB64, "expiresAtEpochMs" to offer.expiresAtEpochMs,
                "clientId" to clientId, "clientSecretHash" to clientSecretHashHex
            )
        )
        val (status, _) = call("POST", "/device/pairing-offer", body, readTimeoutMs = 10_000)
        return status == 200
    }

    override fun removeClient(clientId: String): Boolean {
        val (status, _) = call("POST", "/device/clients/remove", gson.toJson(mapOf("clientId" to clientId)), readTimeoutMs = 10_000)
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
