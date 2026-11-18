package com.rentacar.app.di

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** AGENT-140: the production install (standard, possibly DEBUG) must never wipe Room on a missing migration. */
class DestructiveFallbackPolicyTest {
    @Test
    fun standardNeverAllowsDestructiveFallback() {
        assertFalse(allowDestructiveFallback(debug = true, flavor = "standard"))
        assertFalse(allowDestructiveFallback(debug = false, flavor = "standard"))
    }

    @Test
    fun onlyIsolatedDebugFlavorsAllowIt() {
        assertTrue(allowDestructiveFallback(debug = true, flavor = "agentdev"))
        assertTrue(allowDestructiveFallback(debug = true, flavor = "agentstage"))
        assertFalse(allowDestructiveFallback(debug = false, flavor = "agentstage"))
        assertFalse(allowDestructiveFallback(debug = true, flavor = ""))
    }
}
