package com.rentacar.app.emailimport

import com.rentacar.app.commission.domain.CommissionReportParseContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HtmlTableAndShagrirParserTest {

    private val sampleHtml = """
        <html><body>
        <p>irrelevant</p>
        <table>
          <tr><td>not a report</td><td>x</td></tr>
        </table>
        <table>
          <thead>
            <tr>
              <th>מספר הזמנה</th>
              <th>עמלה</th>
              <th>סה&nbsp;"כ ימים לחישוב עמלה</th>
              <th>שם נהג</th>
              <th>מספר חשבונית</th>
              <th>סה"כ הכנסה מהשכרה לפני מע"מ</th>
              <th>אחוז</th>
              <th>שם סוכן</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1001</td><td>150.00</td><td>10</td><td>ישראל ישראלי</td>
              <td>9001</td><td>2000.00</td><td>7.5</td><td>סוכן א</td>
            </tr>
            <tr>
              <td>1002</td><td>80</td><td>5</td><td>דנה</td>
              <td>9002</td><td>1000</td><td>8</td><td>סוכן ב</td>
            </tr>
            <tr>
              <td>סה"כ</td><td>230</td><td></td><td></td><td></td><td>3000</td><td></td><td></td>
            </tr>
          </tbody>
        </table>
        </body></html>
    """.trimIndent()

    @Test
    fun extractsHtmlTableAndSelectsReport() {
        val result = HtmlTableReportExtractor().extract(
            html = sampleHtml,
            requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            headerAliases = ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertEquals(2, result.tables.size)
        assertTrue(result.selectedTable != null)
        // header + 2 detail + totals label row are all in HTML; extractor keeps non-blank body rows
        assertTrue(result.selectedTable!!.rows.size >= 2)
        assertTrue(result.selectedTable!!.headers.any { HebrewHeaderNormalizer.matches(it, "מספר הזמנה") || it.contains("הזמנה") })
    }

    @Test
    fun hebrewHeaderNormalizationHandlesNbspAndQuotes() {
        assertTrue(
            HebrewHeaderNormalizer.matches(
                "סה\"כ ימים לחישוב עמלה",
                "סה״כ ימים לחישוב עמלה"
            )
        )
        assertEquals(
            HebrewHeaderNormalizer.normalize("סה\u00A0\"כ"),
            HebrewHeaderNormalizer.normalize("סה\"כ")
        )
    }

    @Test
    fun liveShagrirRevenueHeaderTypoLifneiMatches() {
        // Observed on device (DIRECT_FROM uid 15064):
        // סה"כ הכנסה מהשכרה לפניי מע"מ  (double yod)
        assertTrue(
            HebrewHeaderNormalizer.findKey(
                headers = listOf("סה\"כ הכנסה מהשכרה לפניי מע\"מ"),
                expected = "סה״כ הכנסה מהשכרה לפני מע״מ",
                aliases = ShagrirHtmlTableReportParser.HEADER_ALIASES[
                    com.rentacar.app.commission.parser.ShagrirCommissionReportParser.COL_REVENUE
                ].orEmpty()
            ) != null
        )
        val html = """
            <table>
              <tr>
                <th>מספר הזמנה</th><th>עמלה</th><th>סהכ ימים לחישוב עמלות</th><th>שם מנוי</th>
                <th>מספר חשבונית</th><th>סה"כ הכנסה מהשכרה לפניי מע"מ</th><th>אחוז</th><th>שם סוכן</th>
              </tr>
              <tr>
                <td>29926</td><td>18</td><td>1</td><td>לקוח</td>
                <td>1</td><td>100</td><td>0.07</td><td>סוכן</td>
              </tr>
            </table>
        """.trimIndent()
        val parsed = ShagrirHtmlTableReportParser().parse(
            html,
            CommissionReportParseContext(1, 2026, 7, "e", "h", "u")
        )
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals("29926", parsed.rawRows.first().orderNumber)
    }

    @Test
    fun shagrirHtmlParsesRows() {
        val parser = ShagrirHtmlTableReportParser()
        val parsed = parser.parse(
            sampleHtml,
            CommissionReportParseContext(
                supplierId = 1,
                reportYear = 2026,
                reportMonth = 8,
                sourceFileName = "email",
                fileHash = "abc",
                userUid = "u1"
            )
        )
        assertTrue(parsed.success)
        assertEquals(2, parsed.rawRows.size)
        assertEquals("1001", parsed.rawRows[0].orderNumber)
    }

    @Test
    fun reorderedColumnsStillParse() {
        val html = """
            <table>
              <tr>
                <th>שם סוכן</th><th>אחוז</th><th>עמלה</th><th>מספר הזמנה</th>
                <th>סה״כ ימים לחישוב עמלות</th><th>שם מנוי</th>
                <th>מספר חשבונית</th><th>סה״כ הכנסה מהשכרה לפני מע״מ</th>
              </tr>
              <tr>
                <td>א</td><td>10</td><td>100</td><td>55</td>
                <td>3</td><td>לקוח</td><td>77</td><td>1000</td>
              </tr>
            </table>
        """.trimIndent()
        val parsed = ShagrirHtmlTableReportParser().parse(
            html,
            CommissionReportParseContext(1, 2026, 8, "e", "h", "u")
        )
        assertTrue(parsed.rawRows.isNotEmpty())
        assertEquals("55", parsed.rawRows.first().orderNumber)
    }

    @Test
    fun missingRequiredColumnRejected() {
        val html = """
            <table>
              <tr><th>מספר הזמנה</th><th>עמלה</th></tr>
              <tr><td>1</td><td>2</td></tr>
            </table>
        """.trimIndent()
        val parsed = ShagrirHtmlTableReportParser().parse(
            html,
            CommissionReportParseContext(1, 2026, 8, "e", "h", "u")
        )
        assertFalse(parsed.success)
        assertTrue(parsed.errors.any { it.contains("עמודה") || it.contains("עמודות") || it.contains("HTML") })
    }

    @Test
    fun emptyTableRejected() {
        val result = HtmlTableReportExtractor().extract(
            html = "<table></table>",
            requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS
        )
        assertTrue(result.selectedTable == null || result.selectedTable!!.headers.isEmpty())
    }

    @Test
    fun contentHashStableForDuplicateDetection() {
        val extractor = HtmlTableReportExtractor()
        val t1 = extractor.extract(sampleHtml, ShagrirHtmlTableReportParser.REQUIRED_HEADERS, ShagrirHtmlTableReportParser.HEADER_ALIASES).selectedTable!!
        val t2 = extractor.extract(sampleHtml, ShagrirHtmlTableReportParser.REQUIRED_HEADERS, ShagrirHtmlTableReportParser.HEADER_ALIASES).selectedTable!!
        val parser = ShagrirHtmlTableReportParser()
        assertEquals(parser.contentHash(t1), parser.contentHash(t2))
    }

    private fun shagrirTableHtml(
        revenueHeader: String = "סה\"כ הכנסה מהשכרה לפניי מע\"מ",
        titleRow: Boolean = false,
        nested: Boolean = false
    ): String {
        val title = if (titleRow) "<tr><td colspan=\"8\">דוח עמלות יולי</td></tr>" else ""
        val table = """
            <table>
              $title
              <tr>
                <th>מספר הזמנה</th><th>עמלה</th><th>סהכ ימים לחישוב עמלות</th><th>שם מנוי</th>
                <th>מספר חשבונית</th><th>$revenueHeader</th><th>אחוז</th><th>שם סוכן</th>
              </tr>
              <tr>
                <td>28004</td><td>174.993</td><td>30</td><td>לקוח</td>
                <td>1</td><td>2499.9</td><td>0.07</td><td>סוכן</td>
              </tr>
            </table>
        """.trimIndent()
        return if (nested) "<table><tr><td>$table</td></tr></table>" else table
    }

    @Test
    fun validTableBeatsSupplierLogoPng() {
        val html = """
            <html><body>
              <img src="cid:logo" alt="shagrir logo"/>
              ${shagrirTableHtml()}
            </body></html>
        """.trimIndent()
        val extraction = HtmlTableReportExtractor().extractFromHtmlParts(
            listOf(html),
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        val presence = HtmlCommissionPresenceProbe.probe(listOf(html))
        val classified = HtmlReportClassifier.classify(
            extraction,
            presence,
            listOf(
                com.rentacar.app.mailbox.MailboxInlineImageInfo(
                    mimeType = "image/png",
                    contentIdPresent = true,
                    referencedByHtmlCid = true,
                    fileNamePresent = true,
                    sizeBytes = 4_200
                )
            )
        )
        assertNotNull(extraction.selectedTable)
        assertEquals(EmailReportCandidateClassification.VALID_REPORT, classified.classification)
        assertFalse(classified.imageOnlyHighConfidence)
    }

    @Test
    fun multipleInlineImagesDoNotCauseImageOnly() {
        val html = shagrirTableHtml() + """<img src="cid:a"/><img src="cid:b"/><img src="cid:c"/>"""
        val extraction = HtmlTableReportExtractor().extract(html, ShagrirHtmlTableReportParser.REQUIRED_HEADERS, ShagrirHtmlTableReportParser.HEADER_ALIASES)
        val classified = HtmlReportClassifier.classify(
            extraction,
            HtmlCommissionPresenceProbe.probe(listOf(html)),
            listOf(
                com.rentacar.app.mailbox.MailboxInlineImageInfo("image/png", true, true, true, 3_000),
                com.rentacar.app.mailbox.MailboxInlineImageInfo("image/jpeg", true, true, true, 8_000)
            )
        )
        assertEquals(EmailReportCandidateClassification.VALID_REPORT, classified.classification)
    }

    @Test
    fun layoutTableBeforeReportTable() {
        val html = """
            <table><tr><td>layout</td><td>banner</td></tr></table>
            ${shagrirTableHtml()}
        """.trimIndent()
        val result = HtmlTableReportExtractor().extract(
            html,
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertTrue(result.selectedTable != null)
        assertEquals(8, result.selectedTable!!.matchedRequiredHeaders.size)
    }

    @Test
    fun signatureTableAfterReportTable() {
        val html = """
            ${shagrirTableHtml()}
            <table><tr><td>טלפון 03-1234567</td></tr><tr><td>www.example.com</td></tr></table>
        """.trimIndent()
        val result = HtmlTableReportExtractor().extract(
            html,
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertTrue(result.selectedTable != null)
        assertTrue(result.selectedTable!!.rows.isNotEmpty())
    }

    @Test
    fun nestedTableDoesNotHideReport() {
        val html = shagrirTableHtml(nested = true)
        val result = HtmlTableReportExtractor().extract(
            html,
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertTrue(result.selectedTable != null)
        assertEquals("28004", result.selectedTable!!.rows.first().cells.first().normalizedText)
    }

    @Test
    fun validReportInNonFirstHtmlPart() {
        val result = HtmlTableReportExtractor().extractFromHtmlParts(
            htmlParts = listOf("<p>outer wrapper</p>", shagrirTableHtml()),
            requiredHeaders = ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            headerAliases = ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertEquals(1, result.selectedHtmlPartIndex)
        assertTrue(result.selectedTable != null)
    }

    @Test
    fun titleRowBeforeRealHeaders() {
        val result = HtmlTableReportExtractor().extract(
            shagrirTableHtml(titleRow = true),
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertTrue(result.selectedTable != null)
        assertTrue(result.selectedHeaderRowIndex ?: 0 >= 1)
        assertEquals(8, result.selectedTable!!.matchedRequiredHeaders.size)
    }

    @Test
    fun allEightShagrirHeadersMatch() {
        val result = HtmlTableReportExtractor().extract(
            shagrirTableHtml(),
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        assertEquals(8, result.selectedTable!!.matchedRequiredHeaders.size)
        assertTrue(result.selectedTable!!.missingRequiredHeaders.isEmpty())
    }

    @Test
    fun imageOnlyRequiresHighConfidence() {
        val html = """<html><body><p>hello</p><img src="cid:logo"/></body></html>"""
        val extraction = HtmlTableReportExtractor().extract(html, ShagrirHtmlTableReportParser.REQUIRED_HEADERS)
        val presence = HtmlCommissionPresenceProbe.probe(listOf(html))
        val tinyLogo = HtmlReportClassifier.classify(
            extraction,
            presence,
            listOf(com.rentacar.app.mailbox.MailboxInlineImageInfo("image/png", true, true, true, 3_000))
        )
        assertFalse(tinyLogo.imageOnlyHighConfidence)
        assertNotEquals(EmailReportCandidateClassification.IMAGE_ONLY_REPORT, tinyLogo.classification)

        val screenshot = HtmlReportClassifier.classify(
            extraction,
            presence,
            listOf(com.rentacar.app.mailbox.MailboxInlineImageInfo("image/png", true, true, true, 80_000))
        )
        assertTrue(screenshot.imageOnlyHighConfidence)
        assertEquals(EmailReportCandidateClassification.IMAGE_ONLY_REPORT, screenshot.classification)
    }

    @Test
    fun plausibleMalformedTableIsNotImageOnly() {
        val html = """
            <table>
              <tr>
                <th>מספר הזמנה</th><th>עמלה</th><th>סהכ ימים לחישוב עמלות</th>
                <th>שם מנוי</th><th>מספר חשבונית</th>
              </tr>
              <tr><td>1</td><td>2</td><td>3</td><td>x</td><td>5</td></tr>
            </table>
            <img src="cid:logo"/>
        """.trimIndent()
        val extraction = HtmlTableReportExtractor().extract(
            html,
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        val classified = HtmlReportClassifier.classify(
            extraction,
            HtmlCommissionPresenceProbe.probe(listOf(html)),
            listOf(com.rentacar.app.mailbox.MailboxInlineImageInfo("image/png", true, true, true, 4_000))
        )
        assertNotEquals(EmailReportCandidateClassification.IMAGE_ONLY_REPORT, classified.classification)
        assertEquals(EmailReportCandidateClassification.TABLE_FOUND_MISSING_COLUMNS, classified.classification)
    }

    private val parseCtx = CommissionReportParseContext(1, 2026, 7, "email", "hash", "u")

    private fun htmlDetailRow(order: Int, emptyOrder: Boolean = false): String {
        val orderCell = if (emptyOrder) "" else order.toString()
        return """
          <tr>
            <td>$orderCell</td><td>10.50</td><td>2</td><td>לקוח $order</td>
            <td>${order + 9000}</td><td>150.00</td><td>0.07</td><td>סוכן</td>
          </tr>
        """.trimIndent()
    }

    private fun shagrirReportWithRows(rowHtml: String): String = """
        <table>
          <tr>
            <th>מספר הזמנה</th><th>עמלה</th><th>סהכ ימים לחישוב עמלות</th><th>שם מנוי</th>
            <th>מספר חשבונית</th><th>סה"כ הכנסה מהשכרה לפניי מע"מ</th><th>אחוז</th><th>שם סוכן</th>
          </tr>
          $rowHtml
        </table>
    """.trimIndent()

    @Test
    fun fortyThreeValidRowsThenBlankFooterSucceed() {
        val rows = (1..43).joinToString("") { htmlDetailRow(20000 + it) } +
            "<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>"
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals(43, parsed.rawRows.size)
        assertTrue(parsed.errors.none { it.contains("מספר הזמנה ריק") })
    }

    @Test
    fun validRowsThenSignatureFooterSucceed() {
        val rows = htmlDetailRow(1) + htmlDetailRow(2) +
            "<tr><td>בברכה</td><td></td><td></td><td></td><td></td><td></td><td></td><td>שגריר</td></tr>"
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals(2, parsed.rawRows.size)
        assertTrue(parsed.footerDetected)
        assertTrue(parsed.errors.none { it.contains("מספר הזמנה ריק") })
    }

    @Test
    fun validRowsThenLayoutTableContentSucceed() {
        val html = shagrirReportWithRows(htmlDetailRow(11) + htmlDetailRow(12)) +
            """<table><tr><td>Get Outlook for Android</td><td>https://example.com</td></tr></table>"""
        val parsed = ShagrirHtmlTableReportParser().parse(html, parseCtx)
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals(2, parsed.rawRows.size)
    }

    @Test
    fun validRowsThenExplicitTotalsSucceed() {
        val rows = htmlDetailRow(1) + htmlDetailRow(2) +
            """<tr><td>סה"כ</td><td>21</td><td></td><td></td><td></td><td>300</td><td></td><td></td></tr>"""
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals(2, parsed.rawRows.size)
        assertTrue(parsed.rawRows.none { it.orderNumber.contains("סה") })
        assertTrue(parsed.footerDetected)
    }

    @Test
    fun emptyOrderNumberInMiddleFails() {
        val rows = htmlDetailRow(1) + htmlDetailRow(2, emptyOrder = true) + htmlDetailRow(3)
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertFalse(parsed.success)
        assertTrue(parsed.errors.any { it.contains("מספר הזמנה ריק") })
        assertFalse(parsed.footerDetected)
    }

    @Test
    fun malformedRowThenMoreValidRowsIsNotFooter() {
        val malformed = """
          <tr>
            <td></td><td>10.50</td><td>2</td><td>לקוח</td>
            <td>91</td><td>150.00</td><td>0.07</td><td>סוכן</td>
          </tr>
        """.trimIndent()
        val rows = htmlDetailRow(1) + malformed + htmlDetailRow(3) + htmlDetailRow(4)
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertFalse(parsed.success)
        assertTrue(parsed.errors.any { it.contains("מספר הזמנה ריק") })
        assertFalse("malformed middle row must not be a footer", parsed.footerDetected)
        assertTrue(parsed.rawRows.size >= 1)
    }

    @Test
    fun emptyOrderAsFirstDataRowFails() {
        val rows = htmlDetailRow(1, emptyOrder = true) + htmlDetailRow(2)
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertFalse(parsed.success)
        assertTrue(parsed.errors.any { it.contains("מספר הזמנה ריק") })
    }

    @Test
    fun footerAfterValidDataDoesNotEmitEmptyOrderError() {
        val rows = (1..5).joinToString("") { htmlDetailRow(300 + it) } +
            "<tr><td></td><td>Sent from Gmail</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>"
        val parsed = ShagrirHtmlTableReportParser().parse(shagrirReportWithRows(rows), parseCtx)
        assertTrue(parsed.errors.joinToString(), parsed.success)
        assertEquals(5, parsed.rawRows.size)
        assertTrue(parsed.footerDetected)
        assertTrue(parsed.errors.none { it.contains("מספר הזמנה ריק") })
    }

    @Test
    fun logoDoesNotOverrideValidHtmlTableWithFooter() {
        val html = """
            <html><body>
              <img src="cid:logo" alt="shagrir logo"/>
              ${shagrirReportWithRows(htmlDetailRow(28004) + "<tr><td>בברכה</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>")}
            </body></html>
        """.trimIndent()
        val extraction = HtmlTableReportExtractor().extractFromHtmlParts(
            listOf(html),
            ShagrirHtmlTableReportParser.REQUIRED_HEADERS,
            ShagrirHtmlTableReportParser.HEADER_ALIASES
        )
        val classified = HtmlReportClassifier.classify(
            extraction,
            HtmlCommissionPresenceProbe.probe(listOf(html)),
            listOf(
                com.rentacar.app.mailbox.MailboxInlineImageInfo(
                    mimeType = "image/png",
                    contentIdPresent = true,
                    referencedByHtmlCid = true,
                    fileNamePresent = true,
                    sizeBytes = 4_200
                )
            )
        )
        val parsed = ShagrirHtmlTableReportParser().parse(html, parseCtx)
        assertNotNull(extraction.selectedTable)
        assertEquals(EmailReportCandidateClassification.VALID_REPORT, classified.classification)
        assertTrue(parsed.success)
        assertEquals(1, parsed.rawRows.size)
        assertTrue(parsed.footerDetected)
    }
}
