package com.rentacar.app.emailimport

import com.rentacar.app.commission.domain.CommissionReportParseContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
}
