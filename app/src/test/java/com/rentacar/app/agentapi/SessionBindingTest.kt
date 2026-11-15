package com.rentacar.app.agentapi

import com.rentacar.app.agentapi.transport.AgentDevTrustedSessionBinder
import com.rentacar.app.agentapi.transport.AuthenticatedUserSnapshot
import com.rentacar.app.agentapi.transport.BoundSessionIdentity
import com.rentacar.app.agentapi.transport.FirebaseTrustedSessionBinder
import com.rentacar.app.agentapi.transport.SessionBindingPolicy
import com.rentacar.app.agentdev.AgentDevGatewayRuntime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** AGENT-103: session binding. Uses constructor-injected mode so no BuildConfig flavor is needed. */
class SessionBindingTest {

    // ---- SessionBindingPolicy ----

    @Test
    fun agentDevUidIsOnlyAllowedInAgentDevMode() {
        assertTrue(SessionBindingPolicy.isAgentDevUidAllowed(true, "agent-dev-uid"))
        assertFalse(SessionBindingPolicy.isAgentDevUidAllowed(false, "agent-dev-uid"))
        assertTrue(SessionBindingPolicy.isAgentDevUidAllowed(false, "real-user"))
        assertTrue(SessionBindingPolicy.isAgentDevUidAllowed(true, "real-user"))
    }

    @Test
    fun assertProductionSafeRejectsAgentDevUidWhenModeOff() {
        SessionBindingPolicy.assertProductionSafe(true, "agent-dev-uid")
        SessionBindingPolicy.assertProductionSafe(false, "real-user")
        try {
            SessionBindingPolicy.assertProductionSafe(false, "agent-dev-uid")
            fail("expected IllegalArgumentException")
        } catch (_: IllegalArgumentException) {
            // expected
        }
    }

    // ---- BoundSessionIdentity cannot be forged from raw uid ----

    @Test
    fun boundSessionIdentityOnlyComesFromTrustedBinder() {
        assertNull(BoundSessionIdentity.fromTrustedBinder(TestTrustedSessionBinders.signedOut))
        assertNull(BoundSessionIdentity.fromTrustedBinder(TestTrustedSessionBinders.blankUid))
        val bound = BoundSessionIdentity.fromTrustedBinder(TestTrustedSessionBinders.signedIn("u1", "admin"))!!
        assertEquals("u1", bound.userUid)
        assertTrue(bound.permissions.containsAll(listOf("ADMIN", BoundSessionIdentity.BASELINE_PERMISSION)))
        // The only constructor is private: a raw uid cannot be turned into an identity.
        assertTrue(BoundSessionIdentity::class.java.declaredConstructors.none {
            !it.isSynthetic && java.lang.reflect.Modifier.isPublic(it.modifiers)
        })
    }

    // ---- AgentDevTrustedSessionBinder ----

    @Test
    fun agentDevBinderReturnsDevUidOnlyInAgentDevMode() {
        val on = AgentDevTrustedSessionBinder(agentDevMode = true, devUid = "agent-dev-uid").currentSession()
        assertEquals("agent-dev-uid", on?.userUid)
        assertNull(AgentDevTrustedSessionBinder(agentDevMode = false, devUid = "agent-dev-uid").currentSession())
    }

    @Test
    fun agentDevBinderRefusesBlankUid() {
        assertNull(AgentDevTrustedSessionBinder(agentDevMode = true, devUid = "").currentSession())
    }

    @Test
    fun productionDefaultBinderIsInertInStandardBuild() {
        // The standard flavor compiles AGENT_DEV_MODE=false, so the defaults must yield no session.
        if (!com.rentacar.app.BuildConfig.AGENT_DEV_MODE) {
            assertNull(AgentDevTrustedSessionBinder().currentSession())
        }
    }

    @Test
    fun agentDevRuntimeBindsDevUidThroughAgentDevBinder() {
        val runtime = AgentDevGatewayRuntime(
            RentCarAgentAPI.forAndroidLocalSupplierReads(InMemorySupplierReadPort()),
            devUid = "agent-dev-uid",
            pairingSecret = "unit-test-secret-0123456789abcdef"
        )
        assertTrue(runtime.trustedSessionBinder is AgentDevTrustedSessionBinder)
        assertEquals("agent-dev-uid", runtime.autoPair().token.session.userUid)
    }

    @Test
    fun agentDevRuntimeFailsClosedWhenModeOffAndDevUidUsed() {
        val runtime = AgentDevGatewayRuntime(
            RentCarAgentAPI.forAndroidLocalSupplierReads(InMemorySupplierReadPort()),
            devUid = "agent-dev-uid",
            pairingSecret = "unit-test-secret-0123456789abcdef",
            agentDevMode = false
        )
        assertNull(runtime.trustedSessionBinder.currentSession())
        try {
            runtime.autoPair()
            fail("pairing must not bind the dev uid when AGENT_DEV_MODE is off")
        } catch (_: IllegalStateException) {
            // expected
        }
    }

    // ---- FirebaseTrustedSessionBinder ----

    private fun firebase(user: AuthenticatedUserSnapshot?, agentDevMode: Boolean = false) =
        FirebaseTrustedSessionBinder(agentDevMode) { user }

    @Test
    fun firebaseBinderReturnsAuthenticatedClaimsForRealUser() {
        val claims = firebase(AuthenticatedUserSnapshot("real-user", false)).currentSession()
        assertNotNull(claims)
        assertEquals("real-user", claims!!.userUid)
        assertEquals(setOf(BoundSessionIdentity.BASELINE_PERMISSION), claims.permissions)
    }

    @Test
    fun firebaseBinderRejectsNoUserBlankUidAndAnonymous() {
        assertNull(firebase(null).currentSession())
        assertNull(firebase(AuthenticatedUserSnapshot(null, false)).currentSession())
        assertNull(firebase(AuthenticatedUserSnapshot("  ", false)).currentSession())
        assertNull(firebase(AuthenticatedUserSnapshot("anon-user", true)).currentSession())
    }

    @Test
    fun firebaseBinderRejectsAgentDevUidInProduction() {
        assertNull(firebase(AuthenticatedUserSnapshot("agent-dev-uid", false)).currentSession())
    }

    @Test
    fun firebaseBinderNeverReadsAuthInAgentDevMode() {
        var touched = false
        val binder = FirebaseTrustedSessionBinder(agentDevMode = true) {
            touched = true
            AuthenticatedUserSnapshot("real-user", false)
        }
        assertNull(binder.currentSession())
        assertFalse("FirebaseAuth must not be consulted in AgentDev mode", touched)
    }

    @Test
    fun firebaseBinderFailsClosedWhenAuthThrows() {
        assertNull(FirebaseTrustedSessionBinder(false) { error("firebase unavailable") }.currentSession())
    }
}
