package com.rentacar.app.agentapi

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.rentacar.app.agentapi.production.InMemoryAgentAccessSettings
import com.rentacar.app.agentapi.production.ProductionAgentGateway
import com.rentacar.app.agentapi.relay.ClientChannel
import com.rentacar.app.agentapi.relay.E2EReplayCache
import com.rentacar.app.agentapi.relay.HttpsRelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayConnectionState
import com.rentacar.app.agentapi.relay.RelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayDeviceLoop
import com.rentacar.app.agentapi.relay.RelayE2E
import com.rentacar.app.agentapi.relay.RelayEnvelope
import com.rentacar.app.agentapi.relay.RelayPairingCrypto
import com.rentacar.app.agentapi.relay.RelayReply
import com.rentacar.app.agentapi.relay.SealedPairingOffer
import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import kotlin.concurrent.thread
import kotlin.random.Random

/** AGENT-127/128/137/138: pairing + E2E crypto interop, sealed device loop, lifecycle, HTTP client. */
class RelayDeviceTest {
    private val gson = Gson()
    private val dev = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

    // ---------- shared vectors (tools/relay/test/relay.test.mjs) ----------
    @Test
    fun pairingCryptoMatchesNodeVector() {
        val salt = (0 until 16).map { it.toByte() }.toByteArray()
        val iv = (0xa0 until 0xac).map { it.toByte() }.toByteArray()
        val o = RelayPairingCrypto.seal("7KQ4M-ZX9TC", dev, "{\"token\":\"rac1.abc.def\"}", 1000, salt, iv)
        assertEquals("ea30aa1caafae4ed8cf04d6513b72257", o.codeId)
        assertEquals("qxScKCF9NL0U3JGlPF+C67640fagICdyRBGg6Xy1mTgkySJxqTEbxw==", o.ciphertextB64)
        assertEquals("{\"token\":\"rac1.abc.def\"}", RelayPairingCrypto.open("7kq4mzx9tc", o))
        assertThrows(Exception::class.java) { RelayPairingCrypto.open("7KQ4M-ZX9TD", o) }
        assertThrows(Exception::class.java) { RelayPairingCrypto.open("7KQ4M-ZX9TC", o.copy(deviceId = "other")) }
    }

    @Test
    fun e2eEnvelopeMatchesNodeVectorAndBindsContext() {
        val key = ByteArray(32) { 7 }
        val iv = (0xb0 until 0xbc).map { it.toByte() }.toByteArray()
        val aad = RelayE2E.aad("c2d", dev, "claude-1234abcd", "msg-00000001")
        val (ivB64, ct) = RelayE2E.seal(key, aad, "{\"kind\":\"tools\"}", iv)
        assertEquals("Cz1BoYhhTQzQDhB4lJGEtN+3KM47l+avtJ6ovCwCHek=", ct)
        assertEquals("{\"kind\":\"tools\"}", RelayE2E.open(key, aad, ivB64, ct))
        assertThrows(Exception::class.java) { RelayE2E.open(key, RelayE2E.aad("d2c", dev, "claude-1234abcd", "msg-00000001"), ivB64, ct) }
        assertThrows(Exception::class.java) { RelayE2E.open(key, RelayE2E.aad("c2d", dev, "claude-1234abcd", "msg-00000002"), ivB64, ct) }
    }

    @Test
    fun codesAreWellFormedDistinctAndReplayCacheWorks() {
        val codes = (1..200).map { RelayPairingCrypto.newCode() }.toSet()
        assertEquals(200, codes.size)
        assertTrue(codes.all { RelayPairingCrypto.isWellFormed(it) })
        assertNotEquals(RelayPairingCrypto.codeId("AAAAA-AAAAA"), RelayPairingCrypto.codeId("AAAAA-AAAAB"))
        val cache = E2EReplayCache(maxEntries = 3, ttlMs = 1000)
        assertTrue(cache.firstSeen("a", 0))
        assertFalse(cache.firstSeen("a", 10))
        assertTrue(cache.firstSeen("a", 2000)) // expired entry
    }

    // ---------- sealed device loop over the real ProductionAgentGateway ----------
    private val fx = GatewayTestFixture()
    private val settings = InMemoryAgentAccessSettings(enabled = true)
    private var liveUid: String? = GatewayTestFixture.USER_A
    private val binder = TrustedSessionBinder { liveUid?.let { VerifiedSessionClaims(it) } }
    private val channel = ClientChannel("claude-1234abcd", ByteArray(32) { 3 }, "0".repeat(64))
    private var channels = listOf(channel)
    private fun gateway() = ProductionAgentGateway.createOrNull(settings, binder, fx.pairing, fx.api, fx.gateway, false)
    private fun loop(client: RelayDeviceClient = FakeClient()) =
        RelayDeviceLoop(client, { gateway() }, { channels }, dev, clock = { fx.now }, random = Random(1))

    private var seq = 0
    private fun sealedEnvelope(
        kind: String, token: String?, body: String? = null, ch: ClientChannel = channel,
        msgId: String = "msg-%08d".format(++seq), issuedAt: Long = fx.now, ttl: Long = 60_000
    ): RelayEnvelope {
        val inner = gson.toJson(mapOf("kind" to kind, "token" to token, "body" to body, "issuedAt" to issuedAt, "expiresAt" to issuedAt + ttl))
        val (iv, ct) = RelayE2E.seal(ch.key, RelayE2E.aad("c2d", dev, ch.clientId, msgId), inner)
        val wire = gson.toJson(mapOf("v" to 1, "clientId" to ch.clientId, "msgId" to msgId, "ivB64" to iv, "ctB64" to ct))
        return RelayEnvelope("r-$msgId", "sealed", ch.clientId, wire)
    }

    /** Opens a sealed reply → (status, inner body). */
    private fun openReply(r: RelayReply, ch: ClientChannel = channel): Pair<Int, String> {
        val w = JsonParser.parseString(r.bodyJson).asJsonObject
        val msgId = w.get("msgId").asString
        val p = JsonParser.parseString(RelayE2E.open(ch.key, RelayE2E.aad("d2c", dev, ch.clientId, msgId), w.get("ivB64").asString, w.get("ctB64").asString)).asJsonObject
        return p.get("status").asInt to p.get("body").asString
    }

    @Test
    fun sealedReadsAreServedAndRepliesAreSealed() {
        val l = loop()
        val token = fx.pair().presentedToken
        val tools = l.handle(sealedEnvelope("tools", token))
        assertFalse("reply is ciphertext", tools.bodyJson.contains("supplier.list"))
        assertTrue(openReply(tools).second.contains("supplier.list"))
        val exec = l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.list","parameters":{"limit":5},"requestId":"q1"}"""))
        val (status, body) = openReply(exec)
        assertEquals(200, status)
        assertTrue(body.contains("Alpha Supplier") && !body.contains("Beta Supplier"))
        assertEquals("supplier.list" to true, l.lastRequest)
        assertEquals(fx.now, l.lastSuccessfulRequestAtEpochMs)
    }

    @Test
    fun plaintextUnknownClientForgedReplayedAndExpiredRequestsAreRefused() {
        val l = loop()
        val token = fx.pair().presentedToken
        assertTrue(l.handle(RelayEnvelope("x", "execute", channel.clientId, "{}")).bodyJson.contains("E2E_REQUIRED"))
        val stranger = ClientChannel("claude-99999999", ByteArray(32) { 9 }, "0".repeat(64))
        assertTrue(l.handle(sealedEnvelope("tools", token, ch = stranger)).bodyJson.contains("UNKNOWN_CLIENT"))
        // Encrypted with a wrong key but claiming the paired client id.
        val forged = sealedEnvelope("tools", token, ch = channel.copy(key = ByteArray(32) { 1 }))
        val forgedReply = l.handle(forged)
        assertEquals(401, forgedReply.status)
        assertTrue(forgedReply.bodyJson.contains("E2E_AUTH_FAILED"))

        val env = sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q2"}""")
        assertEquals(200, openReply(l.handle(env)).first)
        val (replayStatus, replayBody) = openReply(l.handle(env))
        assertEquals(409, replayStatus)
        assertTrue(replayBody.contains("REPLAY_DETECTED") && !replayBody.contains("Alpha"))

        val (expStatus, _) = openReply(l.handle(sealedEnvelope("tools", token, issuedAt = fx.now - 600_000)))
        assertEquals(408, expStatus)
        val (longStatus, _) = openReply(l.handle(sealedEnvelope("tools", token, ttl = 3_600_000)))
        assertEquals("request lifetime is bounded", 408, longStatus)
    }

    @Test
    fun ownerOffSignOutRevokeAndIdentityFieldsGiveNoData() {
        val l = loop()
        val paired = fx.pair()
        val token = paired.presentedToken
        assertTrue(openReply(l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q3","userUid":"user-b"}"""))).second.contains("INVALID_REQUEST"))
        assertTrue(openReply(l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q4","parameters":{"userUid":"user-b"}}"""))).second.contains("FORBIDDEN_FIELD"))
        assertTrue(openReply(l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.create","requestId":"q5"}"""))).second.contains("WRITE_NOT_ALLOWED"))
        settings.enabled = false
        assertEquals(503, openReply(l.handle(sealedEnvelope("tools", token))).first)
        settings.enabled = true
        liveUid = null
        assertEquals(503, openReply(l.handle(sealedEnvelope("tools", token))).first)
        liveUid = GatewayTestFixture.USER_B // account switch → token revoked, nothing exposed
        val (_, sw) = openReply(l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q6"}""")))
        assertTrue(sw.contains("SESSION_MISMATCH") && !sw.contains("Alpha") && !sw.contains("Beta"))
        liveUid = GatewayTestFixture.USER_A
        assertTrue(openReply(l.handle(sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q7"}"""))).second.contains("TOKEN_REVOKED"))
        channels = emptyList() // client removed on the phone
        assertTrue(l.handle(sealedEnvelope("tools", token)).bodyJson.contains("UNKNOWN_CLIENT"))
    }

    @Test
    fun runLoopRegistersWithClientsBacksOffWithJitterAndStopsWhenDisabled() {
        val token = fx.pair().presentedToken
        val client = FakeClient(
            batches = ArrayDeque(
                listOf(
                    { throw java.io.IOException("network down") },
                    { throw java.io.IOException("still down") },
                    { listOf(sealedEnvelope("execute", token, """{"operation":"supplier.list","requestId":"q8"}""")) }
                )
            )
        )
        val l = loop(client)
        var rounds = 0
        val waits = mutableListOf<Long>()
        val t = thread { l.run { rounds++ < 4 } }
        // The loop pauses on backoff; wake it so the test does not wait seconds.
        repeat(20) { Thread.sleep(50); l.wake() }
        t.join(5_000)
        assertFalse(t.isAlive)
        assertEquals(listOf(channel.clientId to channel.secretHashHex), client.registeredWith.first())
        assertTrue(client.registeredWith.size >= 2) // re-registers after a transport failure
        assertEquals(1, client.replies.size)
        assertTrue(openReply(client.replies.single()).second.contains("Alpha Supplier"))
        assertEquals(RelayConnectionState.STOPPED, l.state)
        // Full jitter stays within [base/2, base].
        repeat(100) { waits += l.jittered(8_000) }
        assertTrue(waits.all { it in 4_000..8_000 } && waits.toSet().size > 10)

        settings.enabled = false
        val idle = FakeClient()
        val l2 = RelayDeviceLoop(idle, { gateway() }, { channels }, dev)
        var r2 = 0
        val t2 = thread { l2.run { r2++ < 2 } }
        repeat(10) { Thread.sleep(30); l2.wake() }
        t2.join(3_000)
        assertFalse("no relay traffic while disabled", idle.registeredWith.isNotEmpty() || idle.polls > 0)
    }

    @Test
    fun httpClientSpeaksDeviceProtocolAndRequiresHttps() {
        assertThrows(IllegalArgumentException::class.java) { HttpsRelayDeviceClient("http://127.0.0.1:1", dev, "s") }
        val seen = java.util.Collections.synchronizedList(mutableListOf<Triple<String, String?, String>>())
        val socket = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        val serverThread = thread(isDaemon = true) {
            while (!socket.isClosed) {
                val conn = try { socket.accept() } catch (_: Exception) { break }
                conn.use { sock ->
                    val input = sock.getInputStream().bufferedReader()
                    val path = (input.readLine() ?: return@use).split(" ")[1]
                    var auth: String? = null
                    var length = 0
                    while (true) {
                        val h = input.readLine() ?: break
                        if (h.isEmpty()) break
                        val (k, v) = h.split(":", limit = 2).map { it.trim() }
                        if (k.equals("Authorization", true)) auth = v
                        if (k.equals("Content-Length", true)) length = v.toInt()
                    }
                    val bodyChars = CharArray(length)
                    var read = 0
                    while (read < length) { val n = input.read(bodyChars, read, length - read); if (n < 0) break; read += n }
                    seen += Triple(path, auth, String(bodyChars, 0, read))
                    val body = (if (path == "/device/poll")
                        """{"requests":[{"relayId":"r1","kind":"sealed","clientId":"claude-1234abcd","body":"{}"}]}"""
                    else """{"ok":true}""").toByteArray()
                    val crlf = String(charArrayOf('\r', '\n'))
                    val out = sock.getOutputStream()
                    out.write(("HTTP/1.1 200 OK${crlf}Content-Type: application/json${crlf}Content-Length: ${body.size}${crlf}Connection: close${crlf}$crlf").toByteArray())
                    out.write(body)
                    out.flush()
                }
            }
        }
        try {
            val c = HttpsRelayDeviceClient("http://127.0.0.1:${socket.localPort}", dev, "f".repeat(64), allowCleartextForTests = true)
            assertTrue(c.register(listOf("claude-1234abcd" to "a".repeat(64))))
            assertEquals("claude-1234abcd", c.poll().single().clientId)
            c.respond(RelayReply("r1", 200, "{}"))
            assertTrue(c.publishPairingOffer(SealedPairingOffer("x", dev, "s", "i", "c", 1), "claude-1234abcd", "b".repeat(64)))
            assertTrue(c.removeClient("claude-1234abcd"))
            assertTrue(seen.all { it.second == "Device $dev.${"f".repeat(64)}" })
            assertEquals(
                listOf("/device/register", "/device/poll", "/device/respond", "/device/pairing-offer", "/device/clients/remove"),
                seen.map { it.first }
            )
            assertTrue(seen[0].third.contains("claude-1234abcd") && seen[3].third.contains("clientSecretHash"))
        } finally {
            socket.close()
            serverThread.join(1000)
        }
    }

    private class FakeClient(val batches: ArrayDeque<() -> List<RelayEnvelope>> = ArrayDeque()) : RelayDeviceClient {
        val registeredWith = mutableListOf<List<Pair<String, String>>>()
        val replies = mutableListOf<RelayReply>()
        var polls = 0
        override fun register(activeClients: List<Pair<String, String>>): Boolean { registeredWith += activeClients; return true }
        override fun poll(): List<RelayEnvelope> { polls++; return batches.removeFirstOrNull()?.invoke() ?: emptyList() }
        override fun respond(reply: RelayReply) { replies += reply }
        override fun publishPairingOffer(offer: SealedPairingOffer, clientId: String, clientSecretHashHex: String) = true
        override fun removeClient(clientId: String) = true
    }
}
