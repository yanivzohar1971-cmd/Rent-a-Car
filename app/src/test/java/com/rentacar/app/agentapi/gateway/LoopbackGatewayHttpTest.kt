package com.rentacar.app.agentapi.gateway

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.rentacar.app.agentapi.GatewayTestFixture
import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class LoopbackGatewayHttpTest {
    private data class Http(val status: Int, val body: JsonObject)

    private lateinit var fx: GatewayTestFixture
    private lateinit var server: LoopbackAgentGatewayServer
    private val pairingSecret = "dev-pairing-secret-for-tests"
    private val binder = TrustedSessionBinder { VerifiedSessionClaims(GatewayTestFixture.USER_A) }

    @Before
    fun setUp() {
        fx = GatewayTestFixture()
        server = startServer(pairingSecret)
    }

    @After
    fun tearDown() {
        server.stop()
    }

    private fun startServer(secret: String?, trusted: TrustedSessionBinder? = binder) =
        LoopbackAgentGatewayServer(
            LoopbackGatewayRouter(fx.gateway, fx.pairing, trusted, secret)
        ).start()

    private fun call(
        method: String,
        path: String,
        body: String? = null,
        headers: Map<String, String> = emptyMap(),
        base: String = server.baseUrl
    ): Http {
        val conn = URL(base + path).openConnection() as HttpURLConnection
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
        val text = stream.use { it.readBytes().toString(Charsets.UTF_8) }
        return Http(status, JsonParser.parseString(text).asJsonObject)
    }

    private fun bearer(token: String) = mapOf("Authorization" to "Bearer $token")

    private fun execute(token: String, body: String) =
        call("POST", "/v1/execute", body, bearer(token))

    // ---- health / tools ----

    @Test
    fun healthIsPublicAndLabelledDevelopmentOnly() {
        val r = call("GET", "/v1/health")
        assertEquals(200, r.status)
        assertEquals("ok", r.body["status"].asString)
        assertEquals("DEVELOPMENT_ONLY", r.body["mode"].asString)
        assertFalse(r.body.has("data"))
    }

    @Test
    fun toolsRequireBearerToken() {
        assertEquals(401, call("GET", "/v1/tools").status)
        assertEquals(401, call("GET", "/v1/tools", headers = bearer("rac1.nope.nope")).status)
    }

    @Test
    fun toolsListWithBearerToken() {
        val token = fx.pair().presentedToken
        val r = call("GET", "/v1/tools", headers = bearer(token))
        assertEquals(200, r.status)
        val names = r.body["tools"].asJsonArray.map { it.asJsonObject["name"].asString }.toSet()
        assertEquals(setOf("supplier.list", "supplier.get"), names)
        assertTrue(r.body["tools"].asJsonArray[0].asJsonObject.has("inputSchema"))
    }

    // ---- execute ----

    @Test
    fun executeSupplierListOverHttp() {
        val token = fx.pair().presentedToken
        val r = execute(token, """{"operation":"supplier.list","requestId":"http-1","parameters":{"limit":5}}""")
        assertEquals(200, r.status)
        assertTrue(r.body["success"].asBoolean)
        val items = r.body["data"].asJsonObject["items"].asJsonArray
        assertEquals(1, items.size())
        assertEquals("Alpha Supplier", items[0].asJsonObject["name"].asString)
    }

    @Test
    fun executeWithoutOrWithBadTokenIs401() {
        val body = """{"operation":"supplier.list","requestId":"x"}"""
        assertEquals(401, call("POST", "/v1/execute", body).status)
        assertEquals(401, execute("rac1.bad.token", body).status)
    }

    @Test
    fun clientSuppliedUserUidInBodyIsRejected() {
        val token = fx.pair().presentedToken
        val r = execute(
            token,
            """{"operation":"supplier.list","requestId":"uid-1","userUid":"${GatewayTestFixture.USER_B}"}"""
        )
        assertEquals(400, r.status)
        assertEquals("FORBIDDEN_FIELD", r.body["error"].asJsonObject["code"].asString)
        assertFalse(r.body.has("data"))
    }

    @Test
    fun clientSuppliedUserUidInParametersIsRejected() {
        val token = fx.pair().presentedToken
        val r = execute(
            token,
            """{"operation":"supplier.list","requestId":"uid-2","parameters":{"userUid":"${GatewayTestFixture.USER_B}"}}"""
        )
        assertEquals(400, r.status)
        assertEquals("FORBIDDEN_FIELD", r.body["error"].asJsonObject["code"].asString)
    }

    @Test
    fun malformedAndUnknownFieldsAre400() {
        val token = fx.pair().presentedToken
        assertEquals(400, execute(token, "not json").status)
        assertEquals(400, execute(token, """{"requestId":"a"}""").status)
        assertEquals(400, execute(token, """{"operation":"supplier.list","requestId":"b","extra":1}""").status)
        assertEquals(400, execute(token, """{"operation":"supplier.list","requestId":"c","parameters":[1]}""").status)
    }

    @Test
    fun replayedRequestIdIs409AndIdempotentReplayIsCached() {
        val token = fx.pair().presentedToken
        val first = execute(token, """{"operation":"supplier.list","requestId":"rp-1"}""")
        assertEquals(200, first.status)
        assertEquals(409, execute(token, """{"operation":"supplier.list","requestId":"rp-1"}""").status)

        val a = execute(token, """{"operation":"supplier.list","requestId":"i-1","idempotencyKey":"k1"}""")
        val b = execute(token, """{"operation":"supplier.list","requestId":"i-2","idempotencyKey":"k1"}""")
        assertEquals(200, a.status)
        assertEquals(200, b.status)
        assertTrue(b.body["replayed"].asBoolean)
    }

    @Test
    fun expiredRequestIs408() {
        val token = fx.pair().presentedToken
        val r = execute(
            token,
            """{"operation":"supplier.list","requestId":"exp","expiresAtEpochMs":${fx.now - 1}}"""
        )
        assertEquals(408, r.status)
    }

    @Test
    fun revokedTokenIs401OverHttp() {
        val paired = fx.pair()
        fx.pairing.revoke(paired.token.tokenId)
        val r = execute(paired.presentedToken, """{"operation":"supplier.list","requestId":"rv"}""")
        assertEquals(401, r.status)
        assertEquals("TOKEN_REVOKED", r.body["error"].asJsonObject["code"].asString)
    }

    @Test
    fun writeOperationIsDisabledOverHttp() {
        val token = fx.pair().presentedToken
        val write = fx.api.registry.writes().first().operationId
        val r = execute(token, """{"operation":"$write","requestId":"wr"}""")
        assertEquals(200, r.status)
        assertFalse(r.body["success"].asBoolean)
        assertEquals("WRITE_DISABLED", r.body["error"].asJsonObject["code"].asString)
    }

    // ---- routing ----

    @Test
    fun unknownPathAndWrongMethod() {
        assertEquals(404, call("GET", "/v1/nope").status)
        assertEquals(405, call("POST", "/v1/health", "{}").status)
        assertEquals(405, call("GET", "/v1/execute").status)
    }

    // ---- dev pairing ----

    @Test
    fun pairRequiresSharedSecretHeader() {
        val body = """{"deviceId":"http-dev","displayName":"HTTP"}"""
        assertEquals(403, call("POST", "/v1/pair", body).status)
        assertEquals(
            403,
            call("POST", "/v1/pair", body, mapOf("X-Rentacar-Dev-Pairing-Secret" to "wrong")).status
        )
    }

    @Test
    fun pairWithSecretIssuesWorkingTokenBoundToTrustedSession() {
        val r = call(
            "POST", "/v1/pair",
            """{"deviceId":"http-dev","displayName":"HTTP","ttlMs":60000}""",
            mapOf("X-Rentacar-Dev-Pairing-Secret" to pairingSecret)
        )
        assertEquals(200, r.status)
        val token = r.body["token"].asString
        assertNotNull(token)
        assertFalse(token.contains(GatewayTestFixture.USER_A))
        val exec = execute(token, """{"operation":"supplier.list","requestId":"after-pair"}""")
        assertEquals(200, exec.status)
        assertEquals(
            "Alpha Supplier",
            exec.body["data"].asJsonObject["items"].asJsonArray[0].asJsonObject["name"].asString
        )
    }

    @Test
    fun pairIgnoresAndRejectsClientIdentityFields() {
        val r = call(
            "POST", "/v1/pair",
            """{"deviceId":"http-dev","userUid":"${GatewayTestFixture.USER_B}"}""",
            mapOf("X-Rentacar-Dev-Pairing-Secret" to pairingSecret)
        )
        assertEquals(400, r.status)
        assertEquals("FORBIDDEN_FIELD", r.body["error"].asJsonObject["code"].asString)
    }

    @Test
    fun pairIsDisabledWithoutConfiguredSecretOrBinder() {
        server.stop()
        server = startServer(secret = null)
        val body = """{"deviceId":"x"}"""
        assertEquals(404, call("POST", "/v1/pair", body, mapOf("X-Rentacar-Dev-Pairing-Secret" to "anything")).status)
        server.stop()
        server = startServer(secret = pairingSecret, trusted = null)
        assertEquals(404, call("POST", "/v1/pair", body, mapOf("X-Rentacar-Dev-Pairing-Secret" to pairingSecret)).status)
    }

    @Test
    fun pairWithNoAuthenticatedAppSessionIs401() {
        server.stop()
        server = startServer(pairingSecret, trusted = TrustedSessionBinder { null })
        val r = call(
            "POST", "/v1/pair", """{"deviceId":"x"}""",
            mapOf("X-Rentacar-Dev-Pairing-Secret" to pairingSecret)
        )
        assertEquals(401, r.status)
    }

    // ---- safety: dev-only server must not be reachable from production code ----

    @Test
    fun loopbackServerIsNotReferencedFromProductionSources() {
        val mainRoot = listOf("src/main/java", "app/src/main/java").map(::File).first { it.exists() }
        val offenders = mainRoot.walkTopDown()
            .filter { it.isFile && (it.extension == "kt" || it.extension == "java") }
            .filter {
                val text = it.readText()
                text.contains("LoopbackAgentGatewayServer(") || text.contains("import com.sun.net.httpserver")
            }
            .map { it.path }
            .toList()
        assertTrue("Production sources must not reference the dev server: $offenders", offenders.isEmpty())

        // Application.onCreate must not touch any agent gateway/transport class.
        val appFile = mainRoot.walkTopDown().first { it.name == "App.kt" }
        val text = appFile.readText()
        assertFalse(text.contains("LoopbackGatewayRouter"))
        assertFalse(text.contains("agentapi.gateway"))
        assertFalse(text.contains("AuthenticatedAgentGateway"))
    }
}
