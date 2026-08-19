package com.rentacar.app.emailimport.clipboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionReconciliationGateTest {

    @Test
    fun validParseEnablesReconciliationAction() {
        val parse = ShagrirClipboardParser().parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(parse.success)
        assertTrue(CommissionReconciliationGate.canPreview(parse, busy = false))
        assertNull(CommissionReconciliationGate.blockedReason(parse, false, false, false))
    }

    @Test
    fun invalidParseExplainsWhyActionIsBlocked() {
        val parse = ShagrirClipboardParser().parse("not a report")
        assertFalse(CommissionReconciliationGate.canPreview(parse, busy = false))
        val reason = CommissionReconciliationGate.blockedReason(parse, false, false, false)
        assertNotNull(reason)
        assertTrue(reason!!.contains("נמצאה שגיאה בדוח") || reason.contains("לא זוהתה"))
    }

    @Test
    fun clippingBlocksWithViewEntireMessage() {
        val parse = ShagrirClipboardParser().parse(
            ShagrirClipboardFixtures.realisticReport(includeClipping = true)
        )
        assertFalse(CommissionReconciliationGate.canPreview(parse, busy = false))
        val reason = CommissionReconciliationGate.blockedReason(parse, false, false, false)
        assertNotNull(reason)
        assertTrue(reason!!.contains("View entire message"))
    }

    @Test
    fun validParseDoesNotAutoImport() {
        val parse = ShagrirClipboardParser().parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(parse.reconciliationReady)
        assertEquals("CLIPBOARD", parse.parseResult?.worksheetName)
        // Gate only enables preview. Persistence is a separate confirm step.
        assertTrue(CommissionReconciliationGate.canPreview(parse, busy = false))
    }
}
