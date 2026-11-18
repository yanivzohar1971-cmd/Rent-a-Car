package com.rentacar.app.agentapi

import com.google.gson.JsonParser
import com.rentacar.app.agentapi.production.InMemoryAgentAccessSettings
import com.rentacar.app.agentapi.production.ProductionAgentGateway
import com.rentacar.app.agentapi.relay.HttpsRelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayDeviceClient
import com.rentacar.app.agentapi.relay.RelayDeviceLoop
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

/** AGENT-127/128: pairing crypto interop, device loop behaviour, device HTTP client. */
class RelayDeviceTest {

    // Same vector as tools/relay/test/relay.test.mjs.
    private val vectorCode = "7KQ4M-ZX9TC"
    private val vectorDevice = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    private val vectorPlain = "{\"token\":\"rac1.abc.def\"}"
    private val salt = (0 until 16).map { it.toByte() }.toByteArray()
    private val iv = (0xa0 until 0xac).map { it.toByte() }.toByteArray()

    @Test
    fun pairingCryptoMatchesNodeVector() {
        val o = RelayPairingCrypto.seal(vectorCode, vectorDevice, vectorPlain, 1000, salt, iv)
        assertEquals("ea30aa1caafae4ed8cf04d6513b72257", o.codeId)
        assertEquals("qxScKCF9NL0U3JGlPF+C67640fagICdyRBGg6Xy1mTgkySJxqTEbxw==", o.ciphertextB64)
        assertEquals(vectorPlain, RelayPairingCrypto.open("7kq4mzx9tc", o))
        assertThrows(Exception::class.java) { RelayPairingCrypto.open("7KQ4M-ZX9TD", o) }
        assertThrows(Exception::class.java) { RelayPairingCrypto.open(vectorCode, o.copy(deviceId = "other")) }
    }

    @Test
    fun generatedCodesAreWellFormedAndDistinct() {
        val codes = (1..200).map { RelayPairingCrypto.newCode() }.toSet()
        assertEquals(200, codes.size)
        assertTrue(codes.all { RelayPairingCrypto.isWellFormed(it) })
        assertEquals(11, RelayPairingCrypto.display(codes.first()).length)
    }

    private val fx = GatewayTestFixture()
    private val settings = InMemoryAgentAccessSettings(enabled = true)
    private var liveUid: String? = GatewayTestFixture.USER_A
    private val binder = TrustedSessionBinder { liveUid?.let { VerifiedSessionClaims(it) } }
    private fun gateway() = ProductionAgentGateway.createOrNull(settings, binder, fx.pairing, fx.api, fx.gateway, false)

    private fun envelope(kind: String, token: String?, body: String? = null) =
        RelayEnvelope("r-${System.nanoTime()}", kind, token?.let { "Bearer $it" }, body)

    @Test
    fun loopServesReadsThroughProductionGatewayOnly() {
        val loop = RelayDeviceLoop(FakeClient(), { gateway() })
        val token = fx.pair().presentedToken

        val tools = loop.handle(envelope("tools", token))
        assertEquals(200, tools.status)
        assertTrue(tools.bodyJson.contains("supplier.list"))

        val exec = loop.handle(envelope("execute", token, """{"operation":"supplier.list","parameters":{"limit":5},"requestId":"q1"}"""))
        val body = JsonParser.parseString(exec.bodyJson).asJsonObject
        assertTrue(body.get("success").asBoolean)
        assertTrue(exec.bodyJson.contains("Alpha Supplier"))
        assertFalse(exec.bodyJson.contains("Beta Supplier"))
        assertEquals("supplier.list" to true, loop.lastRequest)
    }

    @Test
    fun loopRejectsBadTokenIdentityFieldsMalformedBodyAndDisabledAccess() {
        val loop = RelayDeviceLoop(FakeClient(), { gateway() })
        val token = fx.pair().presentedToken
        assertTrue(loop.handle(envelope("execute", "rac1.bad.sig", """{"operation":"supplier.list","requestId":"q2"}""")).bodyJson.contains("UNAUTHORIZED"))
        assertEquals(400, loop.handle(envelope("execute", token, """{"operation":"supplier.list","requestId":"q3","userUid":"user-b"}""")).status)
        assertTrue(loop.handle(envelope("execute", token, """{"operation":"supplier.list","requestId":"q4","parameters":{"userUid":"user-b"}}""")).bodyJson.contains("FORBIDDEN_FIELD"))
        assertEquals(400, loop.handle(envelope("execute", token, "not json")).status)
        assertEquals(400, loop.handle(envelope("bogus", token)).status)
        settings.enabled = false
        val off = loop.handle(envelope("execute", token, """{"operation":"supplier.list","requestId":"q5"}"""))
        assertEquals(503, off.status)
        assertFalse(off.bodyJson.contains("Alpha"))
        settings.enabled = true
        liveUid = null
        assertEquals(503, loop.handle(envelope("tools", token)).status)
    }

    @Test
    fun runLoopPollsRespondsAndBacksOffOnErrors() {
        val token = fx.pair().presentedToken
        val client = FakeClient(
            batches = ArrayDeque(
                listOf(
                    { throw java.io.IOException("network down") },
                    { listOf(RelayEnvelope("a", "execute", "Bearer $token", """{"operation":"supplier.list","requestId":"q6"}""")) }
                )
            )
        )
        val sleeps = mutableListOf<Long>()
        var rounds = 0
        RelayDeviceLoop(client, { gateway() }, sleep = { sleeps += it }).run { rounds++ < 3 }
        assertTrue(client.registered)
        assertEquals(listOf("a"), client.replies.map { it.relayId })
        assertTrue(client.replies.single().bodyJson.contains("Alpha Supplier"))
        assertEquals(2_000L, sleeps.first())
    }

    @Test
    fun httpClientSpeaksDeviceProtocolAndRequiresHttps() {
        assertThrows(IllegalArgumentException::class.java) {
            HttpsRelayDeviceClient("http://127.0.0.1:1", "3f2504e0-4f89-11d3-9a0c-0305e82c3301", "s")
        }
        val seen = java.util.Collections.synchronizedList(mutableListOf<Pair<String, String?>>())
        val socket = ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        val serverThread = thread(isDaemon = true) {
            while (!socket.isClosed) {
                val conn = try { socket.accept() } catch (_: Exception) { break }
                conn.use { sock ->
                    val input = sock.getInputStream().bufferedReader()
                    val requestLine = input.readLine() ?: return@use
                    val path = requestLine.split(" ")[1]
                    var auth: String? = null
                    var length = 0
                    while (true) {
                        val h = input.readLine() ?: break
                        if (h.isEmpty()) break
                        val (k, v) = h.split(":", limit = 2).map { it.trim() }
                        if (k.equals("Authorization", true)) auth = v
                        if (k.equals("Content-Length", true)) length = v.toInt()
                    }
                    repeat(length) { input.read() }
                    seen += path to auth
                    val body = (if (path == "/device/poll")
                        """{"requests":[{"relayId":"r1","kind":"tools","authorization":"Bearer rac1.t.s","body":null}]}"""
                    else """{"ok":true}""").toByteArray()
                    val out = sock.getOutputStream()
                    val crlf = String(charArrayOf('\r', '\n'))
                    val head = "HTTP/1.1 200 OK${crlf}Content-Type: application/json${crlf}" +
                        "Content-Length: ${body.size}${crlf}Connection: close${crlf}${crlf}"
                    out.write(head.toByteArray())
                    out.write(body)
                    out.flush()
                }
            }
        }
        try {
            val c = HttpsRelayDeviceClient(
                "http://127.0.0.1:${socket.localPort}", "3f2504e0-4f89-11d3-9a0c-0305e82c3301", "f".repeat(64),
                allowCleartextForTests = true
            )
            assertTrue(c.register())
            val got = c.poll()
            assertEquals("r1", got.single().relayId)
            c.respond(RelayReply("r1", 200, "{}"))
            assertTrue(c.publishPairingOffer(SealedPairingOffer("x", "d", "s", "i", "c", 1)))
            assertTrue(seen.all { it.second == "Device 3f2504e0-4f89-11d3-9a0c-0305e82c3301.${"f".repeat(64)}" })
            assertEquals(listOf("/device/register", "/device/poll", "/device/respond", "/device/pairing-offer"), seen.map { it.first })
        } finally {
            socket.close()
            serverThread.join(1000)
        }
    }

    private class FakeClient(
        val batches: ArrayDeque<() -> List<RelayEnvelope>> = ArrayDeque()
    ) : RelayDeviceClient {
        var registered = false
        val replies = mutableListOf<RelayReply>()
        override fun register(): Boolean { registered = true; return true }
        override fun poll(): List<RelayEnvelope> = batches.removeFirstOrNull()?.invoke() ?: emptyList()
        override fun respond(reply: RelayReply) { replies += reply }
        override fun publishPairingOffer(offer: SealedPairingOffer) = true
    }

    @Test
    fun distinctRandomCodesProduceDistinctCodeIds() {
        assertNotEquals(RelayPairingCrypto.codeId("AAAAA-AAAAA"), RelayPairingCrypto.codeId("AAAAA-AAAAB"))
    }
}
