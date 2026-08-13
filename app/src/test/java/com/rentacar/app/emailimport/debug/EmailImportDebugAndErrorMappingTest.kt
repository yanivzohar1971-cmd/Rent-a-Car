package com.rentacar.app.emailimport.debug

import com.rentacar.app.mailbox.MailboxCredentials
import com.rentacar.app.mailbox.GmailImapMailboxClient
import com.rentacar.app.mailbox.MailboxError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.UnknownHostException
import javax.mail.AuthenticationFailedException

class EmailImportDebugAndErrorMappingTest {

    @Test
    fun appPasswordSpacesNormalized() {
        assertEquals(
            "abcdefghijklmnop",
            MailboxCredentials.normalizeAppPassword("abcd efgh ijkl mnop")
        )
    }

    @Test
    fun credentialsNormalizedStripsPasswordSpaces() {
        val c = MailboxCredentials("User@Gmail.com ", "abcd efgh ijkl mnop").normalized()
        assertEquals("User@Gmail.com", c.emailAddress)
        assertEquals("abcdefghijklmnop", c.appPassword)
        assertFalse(c.toString().contains("abcdefghijklmnop"))
    }

    @Test
    fun authFailureMapsCorrectly() {
        assertEquals(
            MailboxError.AUTHENTICATION_FAILED,
            GmailImapMailboxClient.mapThrowableToMailboxError(AuthenticationFailedException("Authentication failed"))
        )
    }

    @Test
    fun dnsFailureMapsCorrectly() {
        assertEquals(
            MailboxError.DNS_FAILURE,
            GmailImapMailboxClient.mapThrowableToMailboxError(UnknownHostException("imap.gmail.com"))
        )
    }

    @Test
    fun timeoutMapsCorrectly() {
        assertEquals(
            MailboxError.CONNECTION_TIMEOUT,
            GmailImapMailboxClient.mapThrowableToMailboxError(java.net.SocketTimeoutException("Read timed out"))
        )
    }

    @Test
    fun sslFailureMapsCorrectly() {
        assertEquals(
            MailboxError.SSL_FAILURE,
            GmailImapMailboxClient.mapThrowableToMailboxError(javax.net.ssl.SSLException("handshake"))
        )
    }

    @Test
    fun genericExceptionPreservesClassInSanitizeDetail() {
        val detail = GmailImapMailboxClient.sanitizeExceptionDetail(IllegalStateException("boom"))
        assertTrue(detail.contains("IllegalStateException"))
        assertTrue(detail.contains("boom"))
    }

    @Test
    fun debugJsonExcludesAppPassword() {
        val session = EmailImportDebugSession.create()
        session.credentialsConfigured = true
        session.appPasswordLength = 16
        session.configuredSender = "assaft@shagrir.co.il"
        session.event(
            EmailImportDebugStage.CREDENTIAL_LOAD,
            EmailImportDebugStatus.SUCCESS,
            "loaded",
            mapOf("appPassword" to "should-be-redacted", "appPasswordLength" to 16)
        )
        val json = EmailImportDebugJsonExporter.toJson(
            session = session,
            appVersionName = "1.0",
            appVersionCode = 1,
            buildType = "debug",
            deviceManufacturer = "Samsung",
            deviceModel = "Test",
            androidVersion = "14",
            sdkInt = 34
        )
        assertTrue(json.contains("schemaVersion"))
        assertTrue(json.contains(session.sessionId))
        assertTrue(EmailImportDebugJsonExporter.assertNoSecrets(json))
        assertFalse(json.contains("should-be-redacted"))
        assertTrue(json.contains("\"appPasswordLength\": 16") || json.contains("\"appPasswordLength\":16"))
    }

    @Test
    fun newSearchCreatesNewSessionId() {
        val a = EmailImportDebugHub.begin()
        val b = EmailImportDebugHub.begin()
        assertFalse(a.sessionId == b.sessionId)
        assertEquals(b.sessionId, EmailImportDebugHub.latest?.sessionId)
    }

    @Test
    fun sessionIdConsistentAcrossEvents() {
        val session = EmailImportDebugHub.begin()
        session.event(EmailImportDebugStage.START, EmailImportDebugStatus.INFO, "a")
        session.event(EmailImportDebugStage.IMAP_CONNECT_START, EmailImportDebugStatus.INFO, "b")
        assertTrue(session.snapshotEvents().all { it.sessionId == session.sessionId })
    }

    @Test
    fun metadataSanitizerRedactsPasswordKeys() {
        val meta = EmailImportDebugSession.sanitizeMetadata(
            mapOf("appPassword" to "secret", "host" to "imap.gmail.com")
        )
        assertEquals("********", meta["appPassword"])
        assertEquals("imap.gmail.com", meta["host"])
        val meta2 = EmailImportDebugSession.sanitizeMetadata(
            mapOf("appPasswordLength" to 16, "appPasswordPresent" to true)
        )
        assertEquals(16, meta2["appPasswordLength"])
        assertEquals(true, meta2["appPasswordPresent"])
    }

    @Test
    fun reportMonthSearchWindowAllowsDeliveryAfterMonthEnd() {
        val ym = java.time.YearMonth.of(2026, 7)
        val zone = java.time.ZoneId.of("Asia/Jerusalem")
        val start = ym.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val end = ym.plusMonths(1).atDay(1).plusDays(14).atStartOfDay(zone).toInstant().toEpochMilli()
        val earlyAugust = java.time.LocalDate.of(2026, 8, 5)
            .atStartOfDay(zone).toInstant().toEpochMilli()
        assertTrue(earlyAugust in start..end)
        val lateAugust = java.time.LocalDate.of(2026, 8, 20)
            .atStartOfDay(zone).toInstant().toEpochMilli()
        assertFalse(lateAugust in start..end)
    }
}
