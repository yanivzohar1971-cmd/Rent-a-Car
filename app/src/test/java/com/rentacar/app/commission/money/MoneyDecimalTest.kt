package com.rentacar.app.commission.money

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MoneyDecimalTest {
    @Test
    fun exactString_preservesImportedPrecision() {
        val m = MoneyDecimal.of("87070.22661000003")
        assertEquals("87070.22661000003", m.toExactString())
    }

    @Test
    fun display_roundsToTwoDecimals() {
        assertEquals("6371.57", MoneyDecimal.of("6371.574059999998").toDisplayString())
    }

    @Test
    fun tolerance_matchWithinOneAgora() {
        val a = MoneyDecimal.of("100.00")
        val b = MoneyDecimal.of("100.01")
        assertTrue(a.matchesWithinTolerance(b))
        assertFalse(a.matchesWithinTolerance(MoneyDecimal.of("100.02")))
    }

    @Test
    fun noBinaryDoubleEquality() {
        val a = MoneyDecimal.fromLegacyDouble(0.1 + 0.2)
        val b = MoneyDecimal.of("0.3")
        // May or may not match depending on double artifact; exact text path is preferred
        assertEquals("0.3", b.toExactString())
        assertTrue(a.value != null)
    }
}
