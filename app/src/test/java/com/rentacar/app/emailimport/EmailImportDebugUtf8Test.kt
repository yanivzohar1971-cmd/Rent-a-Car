package com.rentacar.app.emailimport

import com.rentacar.app.emailimport.debug.EmailImportDebugJsonExporter
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class EmailImportDebugUtf8Test {

    @Test
    fun hebrewDebugJsonRoundTripsAsUtf8() {
        val session = EmailImportDebugSession.create()
        session.supplierName = "שגריר"
        session.configuredSender = "assaft@shagrir.co.il"
        session.event(
            EmailImportDebugStage.TABLE_SELECTED,
            EmailImportDebugStatus.INFO,
            "סה\"כ הכנסה מהשכרה לפניי מע\"מ",
            mapOf("header" to "סה\"כ הכנסה מהשכרה לפניי מע\"מ")
        )
        val json = EmailImportDebugJsonExporter.toJson(
            session = session,
            appVersionName = "test",
            appVersionCode = 1,
            buildType = "debug",
            deviceManufacturer = "test",
            deviceModel = "unit",
            androidVersion = "14",
            sdkInt = 34
        )
        assertTrue(json.contains("שגריר"))
        assertTrue(json.contains("לפניי"))
        assertTrue(EmailImportDebugJsonExporter.assertNoSecrets(json))
        assertFalse(json.contains("abcd-efgh-ijkl-mnop"))

        val dir = createTempDir(prefix = "email_import_utf8_")
        try {
            val file = File(dir, "email-import-debug-latest.json")
            file.writeText(json, Charsets.UTF_8)
            val roundTrip = file.readText(Charsets.UTF_8)
            assertEquals(json, roundTrip)
            assertTrue(roundTrip.contains("שגריר"))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun bodyTermOriginIsNotForwardedFromEnumName() {
        assertEquals("SERVER_BODY_CANDIDATE", SenderMatchType.SERVER_BODY_CANDIDATE.name)
        assertFalse(SenderMatchType.SERVER_BODY_CANDIDATE == SenderMatchType.FORWARDED_FROM)
    }
}
