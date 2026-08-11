package com.rentacar.app.commission.parser

import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportParseContext
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class ShagrirCommissionReportParserTest {

    private val parser = ShagrirCommissionReportParser()

    @Test
    fun canParse_detectsWorksheetAndHeaders() {
        val wb = buildWorkbook(
            detailRows = listOf(
                listOf("1001", "15", "5", "Cust A", "9001", "100", "15", "Agent")
            ),
            totals = listOf("סה״כ", "", "", "", "", "100", "", "15")
        )
        assertTrue(parser.canParse(wb))
    }

    @Test
    fun parse_skipsTitleAndTotals_preservesIdsWithoutDotZero() {
        val wb = buildWorkbook(
            detailRows = listOf(
                listOf(3066588.0, 56.0, 30.0, "Cust", 30042194.0, 800.0, 0.07, "Agent"),
                listOf(3066588.0, 56.0, 30.0, "Cust", 30042194.0, 800.0, 0.07, "Agent"),
                listOf(3066588.0, 56.0, 30.0, "Cust", 30042194.0, 800.0, 0.07, "Agent")
            ),
            totals = listOf("סה״כ", 168.0, "", "", "", 2400.0, "", "")
        )
        val result = parser.parse(wb, context())
        assertEquals(3, result.rawRows.size)
        assertEquals("3066588", result.rawRows.first().orderNumber)
        assertEquals("30042194", result.rawRows.first().invoiceNumber)
        assertFalse(result.rawRows.first().orderNumber.contains(".0"))
        assertEquals(1, result.normalizedGroups.size)
        assertEquals(3, result.rawRows.first().sourceRowNumber) // row 3 in Excel (1-based): title=1, header=2, first detail=3
        assertTrue(result.totalsMatch)
    }

    @Test
    fun parse_rejectsMissingColumns() {
        XSSFWorkbook().use { wb ->
            val sheet = wb.createSheet("עמלות")
            sheet.createRow(0).createCell(0).setCellValue("title")
            val header = sheet.createRow(1)
            header.createCell(0).setCellValue("מספר הזמנה")
            assertFalse(parser.canParse(wb))
        }
    }

    @Test
    fun parse_detectsMismatchedTotals() {
        val wb = buildWorkbook(
            detailRows = listOf(
                listOf("1", "10", "5", "C", "2", "100", "10", "A")
            ),
            totals = listOf("סה״כ", "999", "", "", "", "100", "", "")
        )
        val result = parser.parse(wb, context())
        assertFalse(result.totalsMatch)
        assertTrue(result.errors.any { it.contains("עמלה") })
    }

    @Test
    fun fileHash_isDeterministic() {
        val bytes = workbookBytes(
            detailRows = listOf(listOf("1", "10", "5", "C", "2", "100", "10", "A")),
            totals = listOf("סה״כ", "10", "", "", "", "100", "", "")
        )
        val h1 = CommissionReportImportDispatcher.computeFileHash(ByteArrayInputStream(bytes))
        val h2 = CommissionReportImportDispatcher.computeFileHash(ByteArrayInputStream(bytes))
        assertEquals(h1, h2)
        assertEquals(64, h1.length)
    }

    @Test
    fun parserCode_isShagrirV1() {
        assertEquals(CommissionReportParserCodes.SHAGRIR_EXCEL_V1, parser.parserCode)
        assertEquals(1, parser.parserVersion)
    }

    private fun context() = CommissionReportParseContext(
        supplierId = 1,
        reportYear = 2026,
        reportMonth = 7,
        sourceFileName = "test.xlsx",
        fileHash = "abc",
        userUid = "uid"
    )

    private fun buildWorkbook(
        detailRows: List<List<Any>>,
        totals: List<Any>
    ): XSSFWorkbook {
        val wb = XSSFWorkbook()
        val sheet = wb.createSheet("עמלות")
        sheet.createRow(0).createCell(0).setCellValue("דוח עמלות")
        val header = sheet.createRow(1)
        ShagrirCommissionReportParser.REQUIRED_HEADERS.forEachIndexed { i, name ->
            header.createCell(i).setCellValue(name)
        }
        detailRows.forEachIndexed { idx, values ->
            val row = sheet.createRow(2 + idx)
            values.forEachIndexed { c, v -> writeCell(row, c, v) }
        }
        val totalsRow = sheet.createRow(2 + detailRows.size)
        totals.forEachIndexed { c, v -> writeCell(totalsRow, c, v) }
        return wb
    }

    private fun workbookBytes(detailRows: List<List<Any>>, totals: List<Any>): ByteArray {
        buildWorkbook(detailRows, totals).use { wb ->
            ByteArrayOutputStream().use { out ->
                wb.write(out)
                return out.toByteArray()
            }
        }
    }

    private fun writeCell(row: org.apache.poi.ss.usermodel.Row, index: Int, value: Any) {
        val cell = row.createCell(index)
        when (value) {
            is Number -> cell.setCellValue(value.toDouble())
            else -> cell.setCellValue(value.toString())
        }
    }
}
