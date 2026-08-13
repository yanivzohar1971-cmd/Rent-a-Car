package com.rentacar.app.emailimport

import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportNormalizer
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionReportTotals
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.parser.ShagrirCommissionReportParser
import java.security.MessageDigest

/**
 * Maps a Shagrir HTML commission table into the same normalized domain model
 * used by the Excel parser. Does not depend on Gmail transport.
 */
class ShagrirHtmlTableReportParser(
    private val tableExtractor: HtmlTableReportExtractor = HtmlTableReportExtractor()
) {

    fun parse(html: String?, context: CommissionReportParseContext): CommissionReportParseResult =
        parseHtmlParts(listOfNotNull(html?.takeIf { it.isNotBlank() }), context)

    fun parseHtmlParts(htmlParts: List<String>, context: CommissionReportParseContext): CommissionReportParseResult {
        val extraction = tableExtractor.extractFromHtmlParts(
            htmlParts = htmlParts,
            requiredHeaders = REQUIRED_HEADERS,
            headerAliases = HEADER_ALIASES
        )
        val table = extraction.selectedTable
        if (table == null) {
            val missingDetail = extraction.errors.firstOrNull()
            val missing = if (extraction.tables.isEmpty()) {
                listOf(EmailImportErrorCode.NO_HTML_TABLE.hebrewMessage())
            } else {
                listOf(missingDetail ?: EmailImportErrorCode.MISSING_REQUIRED_COLUMNS.hebrewMessage())
            }
            return failure(missing)
        }

        val columnIndex = mutableMapOf<String, Int>()
        val errors = mutableListOf<String>()
        for (required in REQUIRED_HEADERS) {
            val key = HebrewHeaderNormalizer.findKey(
                headers = table.headers,
                expected = required,
                aliases = HEADER_ALIASES[required].orEmpty()
            )
            if (key == null) {
                errors += "עמודה חסרה: $required"
            } else {
                columnIndex[required] = table.headers.indexOf(key)
            }
        }
        if (errors.isNotEmpty()) {
            return failure(errors)
        }

        val rawRows = mutableListOf<RawCommissionReportRow>()
        var workbookTotals: CommissionReportTotals? = null
        val warnings = mutableListOf<String>()

        table.rows.forEachIndexed { idx, row ->
            val sourceRowNumber = idx + 2 // 1-based header + data
            val orderCell = cell(row, columnIndex, ShagrirCommissionReportParser.COL_ORDER)
            if (isTotalsLabel(orderCell)) {
                workbookTotals = parseTotals(row, columnIndex, errors)
                return@forEachIndexed
            }
            if (row.cells.all { it.normalizedText.isBlank() }) return@forEachIndexed
            try {
                rawRows += parseDetail(row, sourceRowNumber, columnIndex)
            } catch (e: Exception) {
                errors += "שורה $sourceRowNumber: ${e.message ?: "שגיאת פיענוח"}"
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

        val totalsSnapshot = workbookTotals
        val totalsMatch = when {
            totalsSnapshot == null -> {
                // HTML emails sometimes omit totals; allow parse if rows exist, mark warning
                if (rawRows.isNotEmpty()) {
                    warnings += "שורת סה״כ חסרה בטבלת HTML — סיכומים חושבו מהשורות"
                    true
                } else {
                    errors += "שורה סה״כ חסרה או לא זוהתה"
                    false
                }
            }
            else -> {
                val revenueOk = rawSums.revenueExVat.matchesWithinTolerance(totalsSnapshot.revenueExVat)
                val commissionOk = rawSums.commissionAmount.matchesWithinTolerance(totalsSnapshot.commissionAmount)
                if (!revenueOk) {
                    errors += "סה״כ הכנסה לא מתאים"
                }
                if (!commissionOk) {
                    errors += "סה״כ עמלה לא מתאים"
                }
                revenueOk && commissionOk
            }
        }

        return CommissionReportParseResult(
            success = errors.isEmpty() && totalsMatch,
            parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
            parserVersion = 1,
            worksheetName = "HTML",
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

    fun contentHash(htmlTable: ExtractedHtmlTable): String {
        val payload = buildString {
            append(htmlTable.headers.joinToString("|") { HebrewHeaderNormalizer.normalize(it) })
            append('\n')
            htmlTable.rows.forEach { row ->
                append(row.cells.joinToString("|") { it.normalizedText })
                append('\n')
            }
        }
        return sha256(payload)
    }

    private fun parseDetail(
        row: HtmlTableRow,
        sourceRowNumber: Int,
        columnIndex: Map<String, Int>
    ): RawCommissionReportRow {
        val orderNumber = RawCommissionReportRow.normalizeId(
            requireText(row, columnIndex, ShagrirCommissionReportParser.COL_ORDER, "מספר הזמנה")
        )
        val invoiceNumber = RawCommissionReportRow.normalizeId(
            requireText(row, columnIndex, ShagrirCommissionReportParser.COL_INVOICE, "מספר חשבונית")
        )
        val days = requireInt(row, columnIndex, ShagrirCommissionReportParser.COL_DAYS)
        val customer = cell(row, columnIndex, ShagrirCommissionReportParser.COL_CUSTOMER)
        val revenue = requireMoney(row, columnIndex, ShagrirCommissionReportParser.COL_REVENUE)
        val percent = requirePercent(row, columnIndex, ShagrirCommissionReportParser.COL_PERCENT)
        val commission = requireMoney(row, columnIndex, ShagrirCommissionReportParser.COL_COMMISSION)
        val agent = cell(row, columnIndex, ShagrirCommissionReportParser.COL_AGENT)

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

    private fun parseTotals(
        row: HtmlTableRow,
        columnIndex: Map<String, Int>,
        errors: MutableList<String>
    ): CommissionReportTotals? = try {
        CommissionReportTotals(
            revenueExVat = requireMoney(row, columnIndex, ShagrirCommissionReportParser.COL_REVENUE),
            commissionAmount = requireMoney(row, columnIndex, ShagrirCommissionReportParser.COL_COMMISSION)
        )
    } catch (e: Exception) {
        errors += "שגיאה בפיענוח שורת סה״כ: ${e.message}"
        null
    }

    private fun cell(row: HtmlTableRow, columnIndex: Map<String, Int>, col: String): String {
        val idx = columnIndex.getValue(col)
        return row.cells.getOrNull(idx)?.normalizedText.orEmpty()
    }

    private fun requireText(row: HtmlTableRow, columnIndex: Map<String, Int>, col: String, label: String): String {
        val text = cell(row, columnIndex, col)
        if (text.isEmpty()) error("$label ריק")
        return text
    }

    private fun requireInt(row: HtmlTableRow, columnIndex: Map<String, Int>, col: String): Int {
        val text = cell(row, columnIndex, col).replace(",", "")
        return text.substringBefore('.').toIntOrNull() ?: error("ערך ימים לא תקין: $text")
    }

    private fun requireMoney(row: HtmlTableRow, columnIndex: Map<String, Int>, col: String): MoneyDecimal {
        val text = cell(row, columnIndex, col)
        if (text.isEmpty()) error("סכום ריק")
        return MoneyDecimal.of(text.replace("₪", "").replace(",", "").trim())
    }

    private fun requirePercent(row: HtmlTableRow, columnIndex: Map<String, Int>, col: String): MoneyDecimal {
        val text = cell(row, columnIndex, col).replace("%", "").trim()
        if (text.isEmpty()) error("אחוז ריק")
        val numeric = text.replace(",", "").toDoubleOrNull()
            ?: return MoneyDecimal.of(text)
        val asPercent = if (numeric in 0.0..1.0 && numeric != 0.0 && numeric != 1.0) numeric * 100.0 else numeric
        return MoneyDecimal.fromLegacyDouble(asPercent)
    }

    private fun isTotalsLabel(text: String): Boolean {
        val n = HebrewHeaderNormalizer.normalize(text)
        return n.startsWith(HebrewHeaderNormalizer.normalize("סהכ")) ||
            n == HebrewHeaderNormalizer.normalize("סה\"כ") ||
            n == HebrewHeaderNormalizer.normalize("סה״כ")
    }

    private fun failure(errors: List<String>) = CommissionReportParseResult(
        success = false,
        parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
        parserVersion = 1,
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

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        val REQUIRED_HEADERS = ShagrirCommissionReportParser.REQUIRED_HEADERS

        val HEADER_ALIASES: Map<String, List<String>> = mapOf(
            ShagrirCommissionReportParser.COL_COMMISSION to listOf("עמלה", "עמלות"),
            ShagrirCommissionReportParser.COL_CUSTOMER to listOf("שם נהג", "שם לקוח", "שם מנוי"),
            ShagrirCommissionReportParser.COL_DAYS to listOf(
                "סה\"כ ימים לחישוב עמלה",
                "סה״כ ימים לחישוב עמלה",
                "סהכ ימים לחישוב עמלה",
                "סה״כ ימים לחישוב עמלות",
                "סה\"כ ימים לחישוב עמלות",
                "סהכ ימים לחישוב עמלות"
            ),
            ShagrirCommissionReportParser.COL_REVENUE to listOf(
                "סה\"כ הכנסה מהשכרה לפני מע\"מ",
                "סה״כ הכנסה מהשכרה לפני מע״מ",
                "סהכ הכנסה מהשכרה לפני מעמ",
                "סה\"כ הכנסה מהשכרה לפני מע״מ",
                "סה״כ הכנסה מהשכרה לפני מע\"מ",
                // Live Shagrir HTML typo / variant seen on device (uid 15064): לפניי
                "סה\"כ הכנסה מהשכרה לפניי מע\"מ",
                "סה״כ הכנסה מהשכרה לפניי מע״מ",
                "סהכ הכנסה מהשכרה לפניי מעמ",
                "סה\"כ הכנסה מהשכרה לפניי מע״מ",
                "סה״כ הכנסה מהשכרה לפניי מע\"מ"
            ),
            ShagrirCommissionReportParser.COL_PERCENT to listOf("אחוז", "%", "אחוז עמלה"),
            ShagrirCommissionReportParser.COL_AGENT to listOf("שם סוכן", "סוכן")
        )
    }
}