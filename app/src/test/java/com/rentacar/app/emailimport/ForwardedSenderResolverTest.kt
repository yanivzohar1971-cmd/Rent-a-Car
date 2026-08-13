package com.rentacar.app.emailimport

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForwardedSenderResolverTest {

    @Test
    fun directFromMatches() {
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "assaft@shagrir.co.il",
            fromHeader = "Assaf <assaft@shagrir.co.il>",
            replyToHeader = null,
            plainBody = null,
            htmlBody = null
        )
        assertTrue(result.matched)
        assertEquals(SenderMatchType.DIRECT_FROM, result.matchType)
    }

    @Test
    fun replyToMatches() {
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "assaft@shagrir.co.il",
            fromHeader = "someone@other.com",
            replyToHeader = "assaft@shagrir.co.il",
            plainBody = null,
            htmlBody = null
        )
        assertTrue(result.matched)
        assertEquals(SenderMatchType.REPLY_TO, result.matchType)
    }

    @Test
    fun forwardedOriginalSenderMatchesWhenOuterDiffers() {
        val plain = """
            ---------- Forwarded message ---------
            From: אסף תמיר <assaft@shagrir.co.il>
            Date: Sun, 2 Aug 2026
            Subject: דוח עמלות
        """.trimIndent()
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "assaft@shagrir.co.il",
            fromHeader = "Idan Car Expert <idancarexpert@gmail.com>",
            replyToHeader = null,
            plainBody = plain,
            htmlBody = null
        )
        assertTrue(result.matched)
        assertEquals(SenderMatchType.FORWARDED_FROM, result.matchType)
        assertEquals("assaft@shagrir.co.il", result.matchedEmail)
    }

    @Test
    fun nonMatchingSenderRejected() {
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "assaft@shagrir.co.il",
            fromHeader = "other@example.com",
            replyToHeader = null,
            plainBody = "hello from commissions@example.co.il",
            htmlBody = null
        )
        assertFalse(result.matched)
        assertEquals(SenderMatchType.NONE, result.matchType)
    }

    @Test
    fun doesNotInferWrongSupplierFromOtherReport() {
        val html = """
            <html><body>
            From: commissions@example.co.il
            <table><tr><th>מספר הזמנה</th></tr></table>
            </body></html>
        """.trimIndent()
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "assaft@shagrir.co.il",
            fromHeader = "idancarexpert@gmail.com",
            replyToHeader = null,
            plainBody = null,
            htmlBody = html
        )
        assertFalse(result.matched)
    }

    @Test
    fun caseInsensitiveConfiguredMatch() {
        val result = ForwardedSenderResolver.resolveMatch(
            configuredSenderEmail = "AssafT@Shagrir.CO.IL",
            fromHeader = "assaft@shagrir.co.il",
            replyToHeader = null,
            plainBody = null,
            htmlBody = null
        )
        assertTrue(result.matched)
    }
}
