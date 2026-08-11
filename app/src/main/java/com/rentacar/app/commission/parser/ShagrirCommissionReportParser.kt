package com.rentacar.app.commission.parser

import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportNormalizer
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionReportTotals
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.money.MoneyDecimal
import org.apache.poi.ss.usermodel.Cell
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.DataFormatter
import org.apache.poi.ss.usermodel.FormulaEvaluator
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.ss.usermodel.Workbook
import java.security.MessageDigest

/**
 * Shagrir commission Excel V1 parser.
 * Worksheet: עמלות — title row, header row, detail rows, totals row (סה״כ).
 */
class ShagrirCommissionReportParser : SupplierCommissionReportParser {

    override val parserCode: Int = CommissionReportParserCodes.SHAGRIR_EXCEL_V1
    override val parserVersion: Int = 1
    override val displayName: String = "Shagrir Commission Excel V1"

    private val formatter = DataFormatter()

    override fun canParse(workbook: Workbook): Boolean {
        val sheet = findCommissionsSheet(workbook) ?: return false
        val headerRow = sheet.getRow(HEADER_ROW_INDEX) ?: return false
        val headers = readHeaderMap(headerRow)
        return REQUIRED_HEADERS.all { expected ->
            headers.keys.any { normalizeHeader(it) == normalizeHeader(expected) }
        }
    }

    override fun parse(
        workbook: Workbook,
        context: CommissionReportParseContext
    ): CommissionReportParseResult {
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()

        val sheet = findCommissionsSheet(workbook)
        if (sheet == null) {
            return failure(errors + "לא נמצא גיליון בשם '$SHEET_NAME'")
        }

        val headerRow = sheet.getRow(HEADER_ROW_INDEX)
        if (headerRow == null) {
            return failure(errors + "שורת כותרות חסרה (שורה 2)")
        }

        val headerMap = readHeaderMap(headerRow)
        val columnIndex = mutableMapOf<String, Int>()
        for (required in REQUIRED_HEADERS) {
            val key = headerMap.keys.firstOrNull { normalizeHeader(it) == normalizeHeader(required) }
            if (key == null) {
                errors += "עמודה חסרה: $required"
            } else {
                columnIndex[required] = headerMap.getValue(key)
            }
        }
        if (errors.isNotEmpty()) {
            return failure(errors)
        }

        val evaluator = workbook.creationHelper.createFormulaEvaluator()
        val rawRows = mutableListOf<RawCommissionReportRow>()
        var workbookTotals: CommissionReportTotals? = null

        val lastRow = sheet.lastRowNum
        for (rowIndex in DETAIL_START_ROW_INDEX..lastRow) {
            val row = sheet.getRow(rowIndex) ?: continue
            if (isBlankRow(row)) continue

            val firstCell = cellText(row, columnIndex.getValue(COL_ORDER), evaluator)
            if (isTotalsLabel(firstCell)) {
                workbookTotals = parseTotalsRow(row, columnIndex, evaluator, errors)
                continue
            }

            try {
                rawRows += parseDetailRow(row, rowIndex + 1, columnIndex, evaluator)
            } catch (e: Exception) {
                errors += "שורה ${rowIndex + 1}: ${e.message ?: "שגיאת פיענוח"}"
            }
        }

        if (rawRows.isEmpty()) {
            errors += "לא נמצאו שורות פירוט בדוח"
        }

        val normalized = CommissionReportNormalizer.normalize(rawRows)
        val rawSums = CommissionReportTotals(
            revenueExVat = CommissionReportNormalizer.sumRevenue(rawRows),
            commissionAmount = CommissionReportNormalizer.sumCommission(rawRows)
        )
        val normalizedSums = CommissionReportTotals(
            revenueExVat = CommissionReportNormalizer.sumGroupRevenue(normalized),
            commissionAmount = CommissionReportNormalizer.sumGroupCommission(normalized)
        )

        val totalsMatch = when {
            workbookTotals == null -> {
                errors += "שורה סה״כ חסרה או לא זוהתה"
                false
            }
            else -> {
                val revenueOk = rawSums.revenueExVat.matchesWithinTolerance(workbookTotals.revenueExVat) &&
                    normalizedSums.revenueExVat.matchesWithinTolerance(workbookTotals.revenueExVat)
                val commissionOk = rawSums.commissionAmount.matchesWithinTolerance(workbookTotals.commissionAmount) &&
                    normalizedSums.commissionAmount.matchesWithinTolerance(workbookTotals.commissionAmount)
                if (!revenueOk) {
                    errors += "סה״כ הכנסה לא מתאים: קובץ=${workbookTotals.revenueExVat.toExactString()}, " +
                        "שורות=${rawSums.revenueExVat.toExactString()}"
                }
                if (!commissionOk) {
                    errors += "סה״כ עמלה לא מתאים: קובץ=${workbookTotals.commissionAmount.toExactString()}, " +
                        "שורות=${rawSums.commissionAmount.toExactString()}"
                }
                revenueOk && commissionOk &&
                    rawSums.revenueExVat.matchesWithinTolerance(normalizedSums.revenueExVat) &&
                    rawSums.commissionAmount.matchesWithinTolerance(normalizedSums.commissionAmount)
            }
        }

        val invalidGroups = normalized.count { !it.isValid }
        if (invalidGroups > 0) {
            warnings += "$invalidGroups קבוצות מנורמלות דורשות בדיקה (ימים/אחוזים סותרים)"
        }

        return CommissionReportParseResult(
            success = errors.isEmpty() && totalsMatch,
            parserCode = parserCode,
            parserVersion = parserVersion,
            worksheetName = sheet.sheetName,
            rawRows = rawRows,
            normalizedGroups = normalized,
            workbookTotals = workbookTotals,
            rawSums = rawSums,
            normalizedSums = normalizedSums,
            totalsMatch = totalsMatch,
            uniqueOrderCount = rawRows.map { RawCommissionReportRow.normalizeId(it.orderNumber) }.toSet().size,
            errors = errors,
            warnings = warnings
        )
    }

    private fun failure(errors: List<String>) = CommissionReportParseResult(
        success = false,
        parserCode = parserCode,
        parserVersion = parserVersion,
        worksheetName = null,
        rawRows = emptyList(),
        normalizedGroups = emptyList(),
        workbookTotals = null,
        rawSums = CommissionReportTotals(MoneyDecimal.ZERO, MoneyDecimal.ZERO),
        normalizedSums = CommissionReportTotals(MoneyDecimal.ZERO, MoneyDecimal.ZERO),
        totalsMatch = false,
        uniqueOrderCount = 0,
        errors = errors
    )

    private fun findCommissionsSheet(workbook: Workbook): Sheet? {
        for (i in 0 until workbook.numberOfSheets) {
            val sheet = workbook.getSheetAt(i)
            if (normalizeHeader(sheet.sheetName) == normalizeHeader(SHEET_NAME)) return sheet
        }
        return workbook.getSheet(SHEET_NAME)
    }

    private fun readHeaderMap(row: Row): Map<String, Int> {
        val map = linkedMapOf<String, Int>()
        for (cell in row) {
            val text = formatter.formatCellValue(cell)?.trim().orEmpty()
            if (text.isNotEmpty()) map[text] = cell.columnIndex
        }
        return map
    }

    private fun parseDetailRow(
        row: Row,
        sourceRowNumber: Int,
        columnIndex: Map<String, Int>,
        evaluator: FormulaEvaluator
    ): RawCommissionReportRow {
        val orderNumber = RawCommissionReportRow.normalizeId(
            requireCellText(row, columnIndex, COL_ORDER, evaluator, "מספר הזמנה")
        )
        val invoiceNumber = RawCommissionReportRow.normalizeId(
            requireCellText(row, columnIndex, COL_INVOICE, evaluator, "מספר חשבונית")
        )
        val days = requireInt(row, columnIndex, COL_DAYS, evaluator)
        val customer = cellText(row, columnIndex.getValue(COL_CUSTOMER), evaluator).trim()
        val revenue = requireMoney(row, columnIndex, COL_REVENUE, evaluator)
        val percent = requirePercent(row, columnIndex, COL_PERCENT, evaluator)
        val commission = requireMoney(row, columnIndex, COL_COMMISSION, evaluator)
        val agent = cellText(row, columnIndex.getValue(COL_AGENT), evaluator).trim()

        val rowHash = sha256(
            listOf(
                orderNumber,
                invoiceNumber,
                days.toString(),
                revenue.toExactString(),
                percent.toExactString(),
                commission.toExactString(),
                sourceRowNumber.toString()
            ).joinToString("|")
        )

        return RawCommissionReportRow(
            sourceRowNumber = sourceRowNumber,
            orderNumber = orderNumber,
            invoiceNumber = invoiceNumber,
            totalDays = days,
            customerName = customer,
            revenueExVat = revenue,
            commissionPercent = percent,
            commissionAmount = commission,
            agentName = agent,
            rowHash = rowHash
        )
    }

    private fun parseTotalsRow(
        row: Row,
        columnIndex: Map<String, Int>,
        evaluator: FormulaEvaluator,
        errors: MutableList<String>
    ): CommissionReportTotals? {
        return try {
            CommissionReportTotals(
                revenueExVat = requireMoney(row, columnIndex, COL_REVENUE, evaluator),
                commissionAmount = requireMoney(row, columnIndex, COL_COMMISSION, evaluator)
            )
        } catch (e: Exception) {
            errors += "שגיאה בפיענוח שורת סה״כ: ${e.message}"
            null
        }
    }

    private fun requireCellText(
        row: Row,
        columnIndex: Map<String, Int>,
        col: String,
        evaluator: FormulaEvaluator,
        label: String
    ): String {
        val text = cellText(row, columnIndex.getValue(col), evaluator).trim()
        if (text.isEmpty()) error("$label ריק")
        return text
    }

    private fun requireInt(
        row: Row,
        columnIndex: Map<String, Int>,
        col: String,
        evaluator: FormulaEvaluator
    ): Int {
        val cell = row.getCell(columnIndex.getValue(col))
        val numeric = cellNumeric(cell, evaluator)
        if (numeric != null) return numeric.toInt()
        val text = formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
        return text.substringBefore('.').toIntOrNull()
            ?: error("ערך ימים לא תקין: $text")
    }

    private fun requireMoney(
        row: Row,
        columnIndex: Map<String, Int>,
        col: String,
        evaluator: FormulaEvaluator
    ): MoneyDecimal {
        val cell = row.getCell(columnIndex.getValue(col))
        val numeric = cellNumeric(cell, evaluator)
        if (numeric != null) {
            // Preserve Excel numeric via plain string of BigDecimal from double carefully:
            // Use DataFormatter first for displayed text when formula/string; else BigDecimal.valueOf.
            return MoneyDecimal.fromLegacyDouble(numeric)
        }
        val text = formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
        if (text.isEmpty()) error("סכום ריק")
        return MoneyDecimal.of(text)
    }

    private fun requirePercent(
        row: Row,
        columnIndex: Map<String, Int>,
        col: String,
        evaluator: FormulaEvaluator
    ): MoneyDecimal {
        val cell = row.getCell(columnIndex.getValue(col))
        val numeric = cellNumeric(cell, evaluator)
        if (numeric != null) {
            // Excel often stores 7% as 0.07
            val asPercent = if (numeric in 0.0..1.0 && numeric != 0.0 && numeric != 1.0) {
                numeric * 100.0
            } else {
                numeric
            }
            return MoneyDecimal.fromLegacyDouble(asPercent)
        }
        val text = formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
        if (text.isEmpty()) error("אחוז ריק")
        return MoneyDecimal.of(text)
    }

    private fun cellText(row: Row, column: Int, evaluator: FormulaEvaluator): String {
        val cell = row.getCell(column) ?: return ""
        // Prefer string/id-safe formatting (avoids 3066588.0)
        return when (cell.cellType) {
            CellType.NUMERIC -> {
                val n = cell.numericCellValue
                if (n == kotlin.math.floor(n) && !n.isNaN() && !n.isInfinite()) {
                    n.toLong().toString()
                } else {
                    formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
                }
            }
            CellType.FORMULA -> {
                val evaluated = evaluator.evaluate(cell)
                when (evaluated?.cellType) {
                    CellType.NUMERIC -> {
                        val n = evaluated.numberValue
                        if (n == kotlin.math.floor(n)) n.toLong().toString()
                        else formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
                    }
                    CellType.STRING -> evaluated.stringValue?.trim().orEmpty()
                    else -> formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
                }
            }
            else -> formatter.formatCellValue(cell, evaluator)?.trim().orEmpty()
        }
    }

    private fun cellNumeric(cell: Cell?, evaluator: FormulaEvaluator): Double? {
        if (cell == null) return null
        return when (cell.cellType) {
            CellType.NUMERIC -> cell.numericCellValue
            CellType.FORMULA -> {
                val evaluated = evaluator.evaluate(cell) ?: return null
                if (evaluated.cellType == CellType.NUMERIC) evaluated.numberValue else null
            }
            CellType.STRING -> cell.stringCellValue?.trim()
                ?.replace(",", "")
                ?.replace("%", "")
                ?.toDoubleOrNull()
            else -> null
        }
    }

    private fun isBlankRow(row: Row): Boolean {
        for (cell in row) {
            val text = formatter.formatCellValue(cell)?.trim().orEmpty()
            if (text.isNotEmpty()) return false
        }
        return true
    }

    private fun isTotalsLabel(text: String): Boolean {
        val n = normalizeHeader(text)
        return n.startsWith(normalizeHeader(TOTALS_PREFIX)) ||
            n == normalizeHeader("סהכ") ||
            n == normalizeHeader("סה\"כ") ||
            n == normalizeHeader("סה״כ")
    }

    private fun normalizeHeader(value: String): String =
        value.trim()
            .replace("\"", "")
            .replace("״", "")
            .replace("׳", "")
            .replace("'", "")
            .replace("\u00A0", "")
            .replace(Regex("\\s+"), "")

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val SHEET_NAME = "עמלות"
        private const val HEADER_ROW_INDEX = 1
        private const val DETAIL_START_ROW_INDEX = 2
        private const val TOTALS_PREFIX = "סהכ"

        const val COL_ORDER = "מספר הזמנה"
        const val COL_COMMISSION = "עמלה"
        const val COL_DAYS = "סה״כ ימים לחישוב עמלות"
        const val COL_CUSTOMER = "שם מנוי"
        const val COL_INVOICE = "מספר חשבונית"
        const val COL_REVENUE = "סה״כ הכנסה מהשכרה לפני מע״מ"
        const val COL_PERCENT = "אחוז"
        const val COL_AGENT = "שם סוכן"

        val REQUIRED_HEADERS = listOf(
            COL_ORDER,
            COL_COMMISSION,
            COL_DAYS,
            COL_CUSTOMER,
            COL_INVOICE,
            COL_REVENUE,
            COL_PERCENT,
            COL_AGENT
        )
    }
}
