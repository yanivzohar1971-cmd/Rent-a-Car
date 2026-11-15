package com.rentacar.app.agentdev

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.rentacar.app.agentapi.InMemorySupplierReadPort
import com.rentacar.app.agentapi.RentCarAgentAPI
import com.rentacar.app.data.Supplier
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** JVM-only checks of the AgentDev gateway wiring and loopback HTTP server (no emulator). */
class AgentDevLoopbackServerTest {
    private data class Http(val status: Int, val body: JsonObject)

    private val devUid = "agent-dev-uid"
    private val secret = "rentacar-agentdev-local-only"
    private lateinit var runtime: AgentDevGatewayRuntime
    private lateinit var server: AgentDevLoopbackServer

    @Before
    fun setUp() {
        val port = InMemorySupplierReadPort().also {
            it.seed(
                Supplier(id = 1, name = "Alpha Rentals", userUid = devUid),
                Supplier(id = 2, name = "Someone Else", userUid = "other-uid")
            )
        }
        runtime = AgentDevGatewayRuntime(RentCarAgentAPI.forAndroidLocalSupplierReads(port), devUid, secret)
        server = AgentDevLoopbackServer(runtime.router, port = 0).start()
    }

    @After
    fun tearDown() = server.stop()

    private fun call(method: String, path: String, body: String? = null, headers: Map<String, String> = emptyMap()): Http {
        val conn = URL("http://127.0.0.1:${server.boundPort}$path").openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 5_000
        conn.readTimeout = 5_000
        headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val status = conn.responseCode
        val stream = if (status >= 400) conn.errorStream else conn.inputStream
        return Http(status, JsonParser.parseString(stream.use { it.readBytes().toString(Charsets.UTF_8) }).asJsonObject)
    }

    @Test
    fun bindsToLoopbackOnly() {
        val field = AgentDevLoopbackServer::class.java.getDeclaredField("serverSocket").apply { isAccessible = true }
        val socket = field.get(server) as java.net.ServerSocket
        assertTrue(socket.inetAddress.isLoopbackAddress)
        assertEquals("127.0.0.1", socket.inetAddress.hostAddress)
        assertFalse(socket.inetAddress.isAnyLocalAddress)
        assertEquals("127.0.0.1", AgentDevLoopbackServer.HOST)
    }

    @Test
    fun healthIsPublicAndAutoPairedTokenReadsOnlyTheDevUidsRows() {
        assertEquals(200, call("GET", "/v1/health").status)

        val token = runtime.autoPair().presentedToken
        assertFalse("token must not embed the uid", token.contains(devUid))
        val r = call(
            "POST", "/v1/execute",
            """{"operation":"supplier.list","requestId":"dev-1"}""",
            mapOf("Authorization" to "Bearer $token")
        )
        assertEquals(200, r.status)
        val items = r.body["data"].asJsonObject["items"].asJsonArray
        assertEquals(1, items.size())
        assertEquals("Alpha Rentals", items[0].asJsonObject["name"].asString)
    }

    @Test
    fun bodyUserUidIsRejectedAndMissingTokenIs401() {
        val token = runtime.autoPair().presentedToken
        val forged = call(
            "POST", "/v1/execute",
            """{"operation":"supplier.list","requestId":"dev-2","userUid":"other-uid"}""",
            mapOf("Authorization" to "Bearer $token")
        )
        assertEquals(400, forged.status)
        assertEquals(401, call("GET", "/v1/tools").status)
    }

    @Test
    fun pairEndpointNeedsSecretAndBindsTheFixedUidNotTheBody() {
        val body = """{"deviceId":"adb-host","ttlMs":60000}"""
        assertEquals(403, call("POST", "/v1/pair", body).status)
        val paired = call("POST", "/v1/pair", body, mapOf("X-Rentacar-Dev-Pairing-Secret" to secret))
        assertEquals(200, paired.status)
        val validated = runtime.pairingService.validate(paired.body["token"].asString)
        assertEquals(
            devUid,
            (validated as com.rentacar.app.agentapi.transport.TokenValidation.Valid).session.session.userUid
        )
        assertEquals(
            400,
            call(
                "POST", "/v1/pair", """{"deviceId":"x","userUid":"other-uid"}""",
                mapOf("X-Rentacar-Dev-Pairing-Secret" to secret)
            ).status
        )
    }

    @Test
    fun oversizedBodyIsRejectedWithoutReachingTheGateway() {
        val big = "x".repeat(70 * 1024)
        val r = call("POST", "/v1/execute", """{"operation":"a","requestId":"b","parameters":{"p":"$big"}}""")
        assertEquals(413, r.status)
    }

    @Test
    fun agentDevSourcesNeverBindWildcardAddress() {
        val root = listOf("src/main/java", "app/src/main/java").map(::File).first { it.exists() }
        val dir = File(root, "com/rentacar/app/agentdev")
        val text = dir.walkTopDown().filter { it.extension == "kt" }.joinToString("\n") { it.readText() }
        assertFalse(text.contains("0.0.0.0"))
        assertFalse(text.contains("InetSocketAddress(port"))
        assertFalse(Regex("""ServerSocket\(\s*\w+\s*\)""").containsMatchIn(text))
    }
}
