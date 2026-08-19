package com.rentacar.app.emailimport.clipboard

import com.rentacar.app.commission.domain.CommissionReportNormalizer
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.Supplier
import com.rentacar.app.emailimport.debug.EmailImportDebugHub
import com.rentacar.app.emailimport.debug.EmailImportDebugJsonExporter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShagrirClipboardParserTest {

    private val parser = ShagrirClipboardParser()
    private val supplier = Supplier(
        id = 1,
        name = "שגריר",
        commissionReportEmail = "assaft@shagrir.co.il",
        commissionReportFormat = "HTML_TABLE",
        userUid = "u"
    )

    @Test
    fun emptyTextRejected() {
        val r = parser.parse("")
        assertFalse(r.success)
        assertFalse(r.detected)
    }

    @Test
    fun interpreterEmptyAndNonText() {
        val empty = ClipboardTextInterpreter.interpret(false, emptyList(), null)
        assertFalse(empty.isText)
        val nonText = ClipboardTextInterpreter.interpret(true, listOf("image/png"), null)
        assertFalse(nonText.isText)
        val text = ClipboardTextInterpreter.interpret(true, listOf("text/plain"), "hello")
        assertTrue(text.isText)
        assertEquals("hello", text.text)
    }

    @Test
    fun gmailNoiseBeforeTableIsIgnored() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(r.errors.joinToString(), r.success)
        assertTrue(r.detected)
        assertEquals(5, r.parsedRowCount)
        assertEquals("28004", r.parsedRows.first().orderNumber)
    }

    @Test
    fun exactEightHeaderSequence() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertEquals(8, r.logicalColumnCount)
        assertEquals(8, r.headers.size)
    }

    @Test
    fun headerAliasSahacVariants() {
        val variants = listOf(
            "סהכ ימים לחישוב עמלות",
            "סה\"כ ימים לחישוב עמלות",
            "סה״כ ימים לחישוב עמלות"
        )
        variants.forEach { days ->
            val headers = ShagrirClipboardFixtures.HEADERS_CANONICAL.toMutableList()
            headers[2] = days
            val r = parser.parse(ShagrirClipboardFixtures.realisticReport(headers = headers))
            assertTrue(days, r.detected)
            assertTrue(days, r.success)
        }
    }

    @Test
    fun headerAliasLifneiAndMaamVariants() {
        val revenues = listOf(
            "סה\"כ הכנסה מהשכרה לפני מע\"מ",
            "סה\"כ הכנסה מהשכרה לפניי מע\"מ",
            "סה״כ הכנסה מהשכרה לפניי מע״מ",
            "סהכ הכנסה מהשכרה לפניי מעמ"
        )
        revenues.forEach { rev ->
            val headers = ShagrirClipboardFixtures.HEADERS_CANONICAL.toMutableList()
            headers[5] = rev
            val r = parser.parse(ShagrirClipboardFixtures.realisticReport(headers = headers))
            assertTrue(rev, r.detected)
            assertTrue(rev, r.parsedRows.isNotEmpty())
        }
    }

    @Test
    fun eightColumnGroupingAndDecimals() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        val first = r.parsedRows.first()
        assertEquals("174.993", first.commissionAmount.toExactString())
        assertEquals("2499.9", first.revenueExVat.toExactString())
        assertEquals(30, first.totalDays)
    }

    @Test
    fun percent007And015PreservedAsSevenAndFifteen() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        val seven = r.parsedRows.first { it.orderNumber == "28004" }.commissionPercent
        val fifteen = r.parsedRows.first { it.orderNumber == "27182" }.commissionPercent
        assertTrue(seven.matchesWithinTolerance(MoneyDecimal.of("7")))
        assertTrue(fifteen.matchesWithinTolerance(MoneyDecimal.of("15")))
    }

    @Test
    fun hebrewCustomerAndQuotedCompanyPreserved() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(r.parsedRows.any { it.customerName == "לקוח אלפא" })
        assertTrue(r.parsedRows.any { it.customerName.contains("אלדן") })
        assertTrue(r.parsedRows.any { it.agentName == "עידן זוהר" })
    }

    @Test
    fun duplicateOrderNumbersPreservedWithDifferentInvoices() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        val sameOrder = r.parsedRows.filter { it.orderNumber == "27948" }
        assertEquals(2, sameOrder.size)
        assertEquals("1001", sameOrder[0].invoiceNumber)
        assertEquals("1002", sameOrder[1].invoiceNumber)
    }

    @Test
    fun footerAndGmailMetadataIgnored() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(r.footerDetected)
        assertFalse(r.parsedRows.any { it.orderNumber.contains("Outlook", ignoreCase = true) })
        assertEquals(5, r.parsedRowCount)
    }

    @Test
    fun messageClippedBlocksCompleteImport() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport(includeClipping = true))
        assertTrue(r.clippingDetected)
        assertFalse(r.isComplete)
        assertFalse(r.success)
        assertTrue(r.errors.any { it.contains("חלקי") || it.contains("View entire message") })
    }

    @Test
    fun viewEntireMessageClippingScenario() {
        val base = ShagrirClipboardFixtures.realisticReport()
        val r = parser.parse(base + "\nView entire message\n")
        assertTrue(r.clippingDetected)
        assertFalse(r.success)
    }

    @Test
    fun incompleteFinalRowRejectedSafely() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport(incompleteFinal = true))
        assertFalse(r.isComplete)
        assertTrue(r.rejectedRowCount >= 1 || r.errors.isNotEmpty())
        assertTrue(r.parsedRows.none { it.orderNumber == "99999" })
        assertTrue(r.parsedRows.any { it.orderNumber == "28004" })
    }

    @Test
    fun missingHeaderRejected() {
        val headers = ShagrirClipboardFixtures.HEADERS_CANONICAL.dropLast(1)
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport(headers = headers))
        assertFalse(r.detected)
        assertFalse(r.success)
    }

    @Test
    fun wrongColumnOrderStillMapsByHeaderName() {
        val headers = listOf(
            "שם סוכן",
            "אחוז",
            "עמלה",
            "מספר הזמנה",
            "סהכ ימים לחישוב עמלות",
            "שם מנוי",
            "מספר חשבונית",
            "סה\"כ הכנסה מהשכרה לפניי מע\"מ"
        )
        val body = buildString {
            append(ShagrirClipboardFixtures.gmailNoisePrefix())
            append("\n\n")
            append(ShagrirClipboardFixtures.cellsToClipboard(headers))
            append("\n\n")
            append(
                ShagrirClipboardFixtures.cellsToClipboard(
                    listOf("סוכן", "0.07", "10", "55", "3", "לקוח", "77", "1000")
                )
            )
        }
        val r = parser.parse(body)
        assertTrue(r.errors.joinToString(), r.detected)
        assertEquals("55", r.parsedRows.first().orderNumber)
        assertEquals("77", r.parsedRows.first().invoiceNumber)
    }

    @Test
    fun randomGmailTextDoesNotParse() {
        val r = parser.parse("Inbox\nStarred\nMeet\nNone selected")
        assertFalse(r.detected)
        assertFalse(r.success)
    }

    @Test
    fun fingerprintStableAcrossHarmlessWhitespace() {
        val a = parser.parse(ShagrirClipboardFixtures.realisticReport())
        val b = parser.parse(ShagrirClipboardFixtures.realisticReport(extraBlankLines = true))
        assertTrue(a.sourceFingerprint.isNotBlank())
        assertEquals(a.sourceFingerprint, b.sourceFingerprint)
    }

    @Test
    fun differentReportDifferentFingerprint() {
        val a = parser.parse(ShagrirClipboardFixtures.realisticReport())
        val headers = ShagrirClipboardFixtures.HEADERS_CANONICAL
        val other = buildString {
            append(ShagrirClipboardFixtures.cellsToClipboard(headers))
            append("\n\n")
            append(
                ShagrirClipboardFixtures.cellsToClipboard(
                    ShagrirClipboardFixtures.row("1", "1", "1", "אחר", "2", "3", "0.07", "ב")
                )
            )
        }
        val b = parser.parse(other)
        assertNotEquals(a.sourceFingerprint, b.sourceFingerprint)
    }

    @Test
    fun rawCustomerContentAbsentFromDiagnostics() {
        val marker = "UNIQUE_CUSTOMER_ZZZ"
        val headers = ShagrirClipboardFixtures.HEADERS_CANONICAL
        val text = buildString {
            append(ShagrirClipboardFixtures.cellsToClipboard(headers))
            append("\n\n")
            append(
                ShagrirClipboardFixtures.cellsToClipboard(
                    ShagrirClipboardFixtures.row("1", "1", "1", marker, "2", "3", "0.07", "סוכן")
                )
            )
        }
        EmailImportDebugHub.beginClipboard()
        parser.parse(text)
        val session = EmailImportDebugHub.latest!!
        session.clipboardParser = "ShagrirClipboardParser"
        session.clipboardTextLength = text.length
        session.clipboardHeaderDetected = true
        session.clipboardParsedRows = 1
        val json = EmailImportDebugJsonExporter.toJson(
            session, "1.0", 1, "debug", "x", "y", "14", 34
        )
        assertFalse(json.contains(marker))
        assertTrue(json.contains("clipboard"))
        assertTrue(json.contains("ShagrirClipboardParser") || json.contains("textLength"))
    }

    @Test
    fun outputIsRawCommissionReportRowCompatible() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertNotNull(r.parseResult)
        val raw = r.parseResult!!.rawRows
        assertEquals(raw.size, r.parsedRows.size)
        assertEquals(raw.first().orderNumber, r.parsedRows.first().orderNumber)
        val groups = CommissionReportNormalizer.normalize(raw)
        assertEquals(groups, r.parseResult!!.normalizedGroups)
    }

    @Test
    fun supportsShagrirSupplier() {
        assertTrue(parser.supportsSupplier(supplier))
        assertEquals(parser.parserName, CommissionClipboardParserRegistry().parserFor(supplier)?.parserName)
        assertEquals(
            null,
            CommissionClipboardParserRegistry().parserFor(supplier.copy(name = "פרי", commissionReportEmail = "x@y.com"))
        )
    }

    @Test
    fun gmailNoiseValidRowsAndFooterSucceed() {
        val rows = listOf(
            ShagrirClipboardFixtures.row("1", "10", "1", "לקוח", "11", "100", "0.07", "סוכן"),
            ShagrirClipboardFixtures.row("2", "20", "2", "לקוח", "12", "200", "0.07", "סוכן")
        )
        val text = ShagrirClipboardFixtures.reportFromRows(
            rows = rows,
            suffix = "בברכה\n\nשגריר\n\nGet Outlook for Android"
        )
        val r = parser.parse(text)
        assertTrue(r.errors.joinToString(), r.success)
        assertEquals(2, r.parsedRowCount)
        assertTrue(r.footerDetected)
        assertTrue(r.reconciliationReady)
    }

    @Test
    fun gmailNoiseValidRowsAndSignatureSucceed() {
        val text = ShagrirClipboardFixtures.reportFromRows(
            rows = listOf(ShagrirClipboardFixtures.row("9", "1", "1", "לקוח", "2", "3", "0.07", "סוכן")),
            totals = null,
            suffix = "בברכה\nטלפון 03-1234567"
        )
        val r = parser.parse(text)
        assertTrue(r.errors.joinToString(), r.success)
        assertEquals(1, r.parsedRowCount)
        assertTrue(r.footerDetected)
    }

    @Test
    fun malformedClipboardRowInTheMiddleFails() {
        val rows = listOf(
            ShagrirClipboardFixtures.row("1", "10", "1", "לקוח", "11", "100", "0.07", "סוכן"),
            ShagrirClipboardFixtures.row("---", "10", "1", "לקוח", "12", "100", "0.07", "סוכן"),
            ShagrirClipboardFixtures.row("3", "10", "1", "לקוח", "13", "100", "0.07", "סוכן")
        )
        val r = parser.parse(ShagrirClipboardFixtures.reportFromRows(rows, suffix = ""))
        assertFalse(r.success)
        assertTrue(r.errors.any { it.contains("מספר הזמנה") })
        assertFalse(r.footerDetected)
        assertEquals(1, r.parsedRowCount)
    }

    @Test
    fun footerNotGroupedAsCommissionRow() {
        val row = ShagrirClipboardFixtures.row("55", "10", "1", "לקוח", "11", "100", "0.07", "סוכן")
        val text = ShagrirClipboardFixtures.reportFromRows(
            rows = listOf(row),
            totals = null,
            suffix = "שגריר\n03-1234567\nwww.example.com\nGet Outlook for Android\nInbox\nNone selected"
        )
        val r = parser.parse(text)
        assertTrue(r.errors.joinToString(), r.success)
        assertEquals(1, r.parsedRowCount)
        assertTrue(r.parsedRows.none { it.orderNumber.equals("שגריר", ignoreCase = true) })
        assertTrue(r.footerDetected)
    }

    @Test
    fun validClipboardParseSetsReconciliationReady() {
        val r = parser.parse(ShagrirClipboardFixtures.realisticReport())
        assertTrue(r.success)
        assertTrue(r.reconciliationReady)
        assertTrue(r.parseResult?.success == true)
    }

    @Test
    fun invalidClipboardParseExposesFailureReason() {
        val r = parser.parse("Inbox\nStarred")
        assertFalse(r.success)
        val reason = CommissionReconciliationGate.blockedReason(
            parse = r,
            emptyClipboard = false,
            nonTextClipboard = false,
            busy = false
        )
        assertNotNull(reason)
        assertTrue(reason!!.contains("שגיאה") || reason.contains("לא זוהתה"))
        assertFalse(CommissionReconciliationGate.canPreview(r, busy = false))
    }

    @Test
    fun persistentDebugJsonForClipboardExcludesCustomerData() {
        val marker = "UNIQUE_CUSTOMER_FOOTER_ZZZ"
        val text = ShagrirClipboardFixtures.reportFromRows(
            rows = listOf(ShagrirClipboardFixtures.row("1", "1", "1", marker, "2", "3", "0.07", "סוכן")),
            suffix = "בברכה"
        )
        val session = EmailImportDebugHub.beginClipboard()
        val r = parser.parse(text, session)
        assertTrue(r.success)
        session.sourceType = "CLIPBOARD"
        session.parserName = r.parserName
        session.clipboardParser = r.parserName
        session.parsedRows = r.parsedRowCount
        session.footerDetected = r.footerDetected
        session.parseComplete = r.isComplete
        session.reconciliationReady = r.reconciliationReady
        val dir = createTempDir(prefix = "clip_debug_")
        try {
            val file = com.rentacar.app.emailimport.debug.EmailImportDebugStore.persistToDir(
                dir = dir,
                session = session,
                appVersionName = "test",
                appVersionCode = 1,
                buildType = "debug",
                deviceManufacturer = "test",
                deviceModel = "unit",
                androidVersion = "14",
                sdkInt = 34
            )
            val json = file.readText(Charsets.UTF_8)
            assertTrue(file.name == "email-import-debug-latest.json")
            assertFalse(json.contains(marker))
            assertTrue(json.contains("footerDetected"))
            assertTrue(json.contains("reconciliationReady"))
            assertTrue(json.contains("CLIPBOARD"))
        } finally {
            dir.deleteRecursively()
        }
    }
}
