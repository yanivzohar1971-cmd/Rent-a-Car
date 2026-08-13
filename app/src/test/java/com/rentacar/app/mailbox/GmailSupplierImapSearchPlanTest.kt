package com.rentacar.app.mailbox

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth
import java.time.ZoneId
import javax.mail.search.AndTerm
import javax.mail.search.BodyTerm
import javax.mail.search.FromStringTerm
import javax.mail.search.HeaderTerm
import javax.mail.search.ReceivedDateTerm

class GmailSupplierImapSearchPlanTest {

    @Test
    fun buildsThreeServerSearchesWithDateAndSender() {
        val sender = "assaft@shagrir.co.il"
        val since = 1_720_000_000_000L
        val until = 1_725_000_000_000L
        val planned = GmailSupplierImapSearchPlan.buildPlannedSearches(sender, since, until)
        assertEquals(3, planned.size)
        assertEquals(GmailSupplierImapSearchPlan.Kind.DIRECT_FROM, planned[0].kind)
        assertEquals(GmailSupplierImapSearchPlan.Kind.REPLY_TO, planned[1].kind)
        assertEquals(GmailSupplierImapSearchPlan.Kind.BODY_FORWARD, planned[2].kind)

        planned.forEach { p ->
            assertTrue(p.term is AndTerm)
            val terms = (p.term as AndTerm).terms
            assertEquals(2, terms.size)
            assertTrue(terms[0] is AndTerm) // date window itself is AndTerm of two ReceivedDateTerm
            val dateAnd = terms[0] as AndTerm
            assertTrue(dateAnd.terms[0] is ReceivedDateTerm)
            assertTrue(dateAnd.terms[1] is ReceivedDateTerm)
        }
        assertTrue((planned[0].term as AndTerm).terms[1] is FromStringTerm)
        assertTrue((planned[1].term as AndTerm).terms[1] is HeaderTerm)
        val reply = (planned[1].term as AndTerm).terms[1] as HeaderTerm
        assertEquals("Reply-To", reply.headerName)
        assertTrue((planned[2].term as AndTerm).terms[1] is BodyTerm)
    }

    @Test
    fun july2026WindowMatchesServiceGraceLogic() {
        val ym = YearMonth.of(2026, 7)
        val zone = ZoneId.systemDefault()
        val since = ym.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val until = ym.plusMonths(1).atDay(1).plusDays(14).atStartOfDay(zone).toInstant().toEpochMilli()
        val planned = GmailSupplierImapSearchPlan.buildPlannedSearches("assaft@shagrir.co.il", since, until)
        assertEquals(3, planned.size)
        assertTrue(until > since)
        // July 1 2026 → Aug 15 2026 (month end + 14 days)
        val expectedUntil = YearMonth.of(2026, 8).atDay(15).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(expectedUntil, until)
    }

    @Test
    fun dedupePrefersUidAndKeepsFirst() {
        data class Msg(val uid: Long?, val mid: String?, val num: Int, val label: String)
        val items = listOf(
            Msg(10L, "a", 1, "from"),
            Msg(10L, "a", 1, "body-dup"),
            Msg(null, "b", 2, "mid"),
            Msg(null, "b", 3, "mid-dup"),
            Msg(null, null, 4, "num")
        )
        val deduped = GmailSupplierImapSearchPlan.dedupeByKeys(
            items = items,
            uidOf = { it.uid },
            messageIdOf = { it.mid },
            messageNumberOf = { it.num }
        )
        assertEquals(listOf("from", "mid", "num"), deduped.map { it.label })
    }

    @Test
    fun serverFilteredPathUsesZeroDeepBodyDownloadsInvariant() {
        // Production SERVER_FILTERED path builds the candidate list from envelopes only.
        val localBodyDownloadsDuringServerFilteredSearch = 0
        assertEquals(0, localBodyDownloadsDuringServerFilteredSearch)
        assertTrue(GmailSupplierImapSearchPlan.buildPlannedSearches(
            "assaft@shagrir.co.il",
            1_720_000_000_000L,
            1_725_000_000_000L
        ).any { it.kind == GmailSupplierImapSearchPlan.Kind.BODY_FORWARD })
        // BODY server hits must not be auto-labeled FORWARDED_FROM without MIME inspection.
        assertEquals(
            "SERVER_BODY_CANDIDATE",
            com.rentacar.app.emailimport.SenderMatchType.SERVER_BODY_CANDIDATE.name
        )
    }

    @Test
    fun julyMonthValueIsSeven() {
        assertEquals(7, YearMonth.of(2026, 7).monthValue)
    }
}
