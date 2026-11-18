package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.production.InMemoryAgentAccessSettings
import com.rentacar.app.agentapi.production.ProductionAgentErrorCodes
import com.rentacar.app.agentapi.production.ProductionAgentGateway
import com.rentacar.app.agentapi.transport.AgentGatewayRequest
import com.rentacar.app.agentapi.transport.GatewayErrorCodes
import com.rentacar.app.agentapi.transport.SessionBindingPolicy
import com.rentacar.app.agentapi.transport.TokenValidation
import com.rentacar.app.agentapi.transport.TrustedSessionBinder
import com.rentacar.app.agentapi.transport.VerifiedSessionClaims
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-125/126/134: production-compatible gateway gating (isolated JVM tests, no real data). */
class ProductionAgentGatewayTest {
    private val fx = GatewayTestFixture()
    private val settings = InMemoryAgentAccessSettings(enabled = true)
    private var liveUid: String? = GatewayTestFixture.USER_A
    private val binder = TrustedSessionBinder { liveUid?.let { VerifiedSessionClaims(it) } }

    private fun gateway(agentDevMode: Boolean = false) =
        ProductionAgentGateway.createOrNull(settings, binder, fx.pairing, fx.api, fx.gateway, agentDevMode)

    private fun req(id: String, op: String = "supplier.list", params: Map<String, Any?> = emptyMap()) =
        AgentGatewayRequest(operation = op, parameters = params, requestId = id)

    @Test
    fun disabledByDefaultAndNeverCreatedInAgentDevOrWithoutSession() {
        assertFalse(InMemoryAgentAccessSettings().enabled)
        settings.enabled = false
        assertNull(gateway())
        settings.enabled = true
        assertNull(gateway(agentDevMode = true))
        liveUid = null
        assertNull(gateway())
        liveUid = SessionBindingPolicy.AGENT_DEV_UID
        assertNull("reserved AgentDev uid can never bind in production", gateway())
    }

    @Test
    fun ownerReadsOwnDataOnly() {
        val gw = gateway()!!
        val token = fx.pair(GatewayTestFixture.USER_A).presentedToken
        val r = gw.execute(token, req("r1"))
        assertTrue(r.success)
        val names = ((r.data as Map<*, *>)["items"] as List<*>).map { (it as com.rentacar.app.agentapi.dto.SupplierAgentDto).name }
        assertEquals(listOf("Alpha Supplier"), names)
    }

    @Test
    fun disablingTakesEffectImmediately() {
        val gw = gateway()!!
        val token = fx.pair().presentedToken
        settings.enabled = false
        assertEquals(ProductionAgentErrorCodes.AGENT_ACCESS_DISABLED, gw.execute(token, req("r2")).error?.code)
        assertEquals(ProductionAgentErrorCodes.AGENT_ACCESS_DISABLED, gw.listTools(token).error?.code)
    }

    @Test
    fun signOutBlocksEvenWithValidDeviceToken() {
        val gw = gateway()!!
        val token = fx.pair().presentedToken
        liveUid = null
        val r = gw.execute(token, req("r3"))
        assertFalse(r.success)
        assertEquals(ProductionAgentErrorCodes.NOT_SIGNED_IN, r.error?.code)
        assertNull(r.data)
    }

    @Test
    fun accountSwitchRevokesTokenAndExposesNothing() {
        val gw = gateway()!!
        val paired = fx.pair(GatewayTestFixture.USER_A)
        liveUid = GatewayTestFixture.USER_B
        val r = gw.execute(paired.presentedToken, req("r4"))
        assertEquals(ProductionAgentErrorCodes.SESSION_MISMATCH, r.error?.code)
        assertNull(r.data)
        val v = fx.pairing.validate(paired.presentedToken)
        assertTrue(v is TokenValidation.Invalid)
        liveUid = GatewayTestFixture.USER_A
        assertEquals(GatewayErrorCodes.TOKEN_REVOKED, gw.execute(paired.presentedToken, req("r5")).error?.code)
    }

    @Test
    fun invalidExpiredAndClientSuppliedUidAreRejected() {
        val gw = gateway()!!
        assertEquals(GatewayErrorCodes.UNAUTHORIZED, gw.execute("rac1.bogus.sig", req("r6")).error?.code)
        assertEquals(GatewayErrorCodes.UNAUTHORIZED, gw.execute(null, req("r7")).error?.code)
        val token = fx.pair(ttlMs = 1_000).presentedToken
        fx.now += 2_000
        assertEquals(GatewayErrorCodes.TOKEN_EXPIRED, gw.execute(token, req("r8")).error?.code)
        val fresh = fx.pair().presentedToken
        val spoof = gw.execute(fresh, req("r9", params = mapOf("userUid" to GatewayTestFixture.USER_B)))
        assertEquals(GatewayErrorCodes.FORBIDDEN_FIELD, spoof.error?.code)
        assertNull(spoof.data)
    }

    @Test
    fun writesAndUnknownOperationsAreRefusedBeforeExecution() {
        val gw = gateway()!!
        val token = fx.pair().presentedToken
        val write = fx.api.registry.all().first { it.readOrWrite == com.rentacar.app.agentapi.model.AgentReadOrWrite.WRITE }
        assertEquals(ProductionAgentErrorCodes.WRITE_NOT_ALLOWED, gw.execute(token, req("r10", op = write.operationId)).error?.code)
        assertEquals(ProductionAgentErrorCodes.UNKNOWN_OPERATION, gw.execute(token, req("r11", op = "sql.raw")).error?.code)
        val tools = gw.listTools(token)
        assertTrue(tools.success)
        assertNotNull(tools.tools.firstOrNull { it.operationId == "supplier.list" })
        assertTrue(tools.tools.none { fx.api.registry.get(it.operationId)?.readOrWrite != com.rentacar.app.agentapi.model.AgentReadOrWrite.READ })
    }
}
