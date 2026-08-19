package com.rentacar.app.emailimport

import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportNormalizer
import com.rentacar.app.commission.domain.CommissionReportParseContext
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionReportTotals
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.parser.ShagrirCommissionReportParser
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
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

    fun parseHtmlParts(
        htmlParts: List<String>,
        context: CommissionReportParseContext,
        debug: EmailImportDebugSession? = null
    ): CommissionReportParseResult {
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
        var footerDetected = false
        var footerRowIndex: Int? = null
        var rejectedRowCount = 0
        val parseStarted = System.currentTimeMillis()

        debug?.event(
            EmailImportDebugStage.TABLE_DATA_START,
            EmailImportDebugStatus.INFO,
            "Table data start",
            mapOf(
                "headerRowIndex" to table.headerRowIndex,
                "columnCount" to table.columnCount,
                "dataRowCount" to table.rows.size
            )
        )

        var idx = 0
        while (idx < table.rows.size) {
            val row = table.rows[idx]
            val sourceRowNumber = idx + 2 // 1-based header + data
            val cells = row.cells.map { it.normalizedText }
            val cellsByCol = ShagrirReportRowClassifier.cellMap(cells, columnIndex)
            val following = mutableListOf<Map<String, String>>()
            var look = idx + 1
            while (look < table.rows.size && following.size < ShagrirReportRowClassifier.LOOKAHEAD_ROWS) {
                following += ShagrirReportRowClassifier.cellMap(
                    table.rows[look].cells.map { it.normalizedText },
                    columnIndex
                )
                look++
            }
            val laterHasValid = following.any { ShagrirReportRowClassifier.inspect(it).validDataShape }
            val kind = ShagrirReportRowClassifier.classify(
                cellsByCol = cellsByCol,
                validRowsParsed = rawRows.size,
                followingRows = following,
                rawColumnCount = cells.size
            )
            when (kind) {
                ShagrirRowKind.BLANK -> { /* skip layout spacer */ }
                ShagrirRowKind.TOTALS -> {
                    workbookTotals = parseTotals(row, columnIndex, errors)
                    if (!laterHasValid) {
                        footerDetected = true
                        footerRowIndex = sourceRowNumber
                        debug?.event(
                            EmailImportDebugStage.TABLE_FOOTER_DETECTED,
                            EmailImportDebugStatus.INFO,
                            "Table footer detected",
                            mapOf(
                                "rowIndex" to sourceRowNumber,
                                "reasonCode" to "TOTALS",
                                "parsedRows" to rawRows.size
                            )
                        )
                        idx = table.rows.size
                    }
                }
                ShagrirRowKind.FOOTER -> {
                    footerDetected = true
                    footerRowIndex = sourceRowNumber
                    debug?.event(
                        EmailImportDebugStage.TABLE_FOOTER_DETECTED,
                        EmailImportDebugStatus.INFO,
                        "Table footer detected",
                        mapOf(
                            "rowIndex" to sourceRowNumber,
                            "reasonCode" to "FOOTER",
                            "columnCount" to cells.size,
                            "parsedRows" to rawRows.size
                        )
                    )
                    idx = table.rows.size
                }
                ShagrirRowKind.VALID_DATA -> {
                    try {
                        rawRows += parseDetail(row, sourceRowNumber, columnIndex)
                        debug?.event(
                            EmailImportDebugStage.TABLE_DATA_ROW_ACCEPTED,
                            EmailImportDebugStatus.INFO,
                            "Table data row accepted",
                            mapOf(
                                "rowIndex" to sourceRowNumber,
                                "columnCount" to cells.size,
                                "parsedRows" to rawRows.size
                            )
                        )
                    } catch (e: Exception) {
                        rejectedRowCount++
                        val reason = e.message ?: "שגיאת פיענוח"
                        errors += "שורה $sourceRowNumber: $reason"
                        recordRejected(
                            debug = debug,
                            sourceRowNumber = sourceRowNumber,
                            cells = cells,
                            cellsByCol = cellsByCol,
                            reasonCode = "PARSE_EXCEPTION"
                        )
                    }
                }
                ShagrirRowKind.MALFORMED -> {
                    rejectedRowCount++
                    val reason = ShagrirReportRowClassifier.malformedReason(cellsByCol)
                    errors += "שורה $sourceRowNumber: $reason"
                    recordRejected(
                        debug = debug,
                        sourceRowNumber = sourceRowNumber,
                        cells = cells,
                        cellsByCol = cellsByCol,
                        reasonCode = "MALFORMED"
                    )
                }
            }
            idx++
        }

        debug?.event(
            EmailImportDebugStage.TABLE_DATA_END,
            EmailImportDebugStatus.INFO,
            "Table data end",
            mapOf(
                "parsedRows" to rawRows.size,
                "rejectedRows" to rejectedRowCount,
                "footerDetected" to footerDetected,
                "footerRowIndex" to footerRowIndex,
                "elapsedMs" to (System.currentTimeMillis() - parseStarted)
            )
        )

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

        val result = CommissionReportParseResult(
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
            warnings = warnings,
            footerDetected = footerDetected,
            footerRowIndex = footerRowIndex,
            rejectedRowCount = rejectedRowCount
        )
        if (result.success) {
            debug?.event(
                EmailImportDebugStage.TABLE_PARSE_SUCCESS,
                EmailImportDebugStatus.SUCCESS,
                "Table parse success",
                mapOf(
                    "parsedRows" to rawRows.size,
                    "rejectedRows" to rejectedRowCount,
                    "footerDetected" to footerDetected,
                    "footerRowIndex" to footerRowIndex,
                    "elapsedMs" to (System.currentTimeMillis() - parseStarted)
                )
            )
        } else {
            debug?.event(
                EmailImportDebugStage.TABLE_PARSE_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "Table parse failure",
                mapOf(
                    "parsedRows" to rawRows.size,
                    "rejectedRows" to rejectedRowCount,
                    "footerDetected" to footerDetected,
                    "errorCount" to errors.size,
                    "elapsedMs" to (System.currentTimeMillis() - parseStarted)
                )
            )
        }
        return result
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
        val orderNumber = ShagrirReportFieldParser.parseOrderNumber(
            requireText(row, columnIndex, ShagrirCommissionReportParser.COL_ORDER, "מספר הזמנה")
        )
        val invoiceNumber = ShagrirReportFieldParser.parseInvoiceNumber(
            requireText(row, columnIndex, ShagrirCommissionReportParser.COL_INVOICE, "מספר חשבונית")
        )
        val days = ShagrirReportFieldParser.parseDays(
            cell(row, columnIndex, ShagrirCommissionReportParser.COL_DAYS)
        )
        val customer = cell(row, columnIndex, ShagrirCommissionReportParser.COL_CUSTOMER)
        val revenue = ShagrirReportFieldParser.parseMoney(
            cell(row, columnIndex, ShagrirCommissionReportParser.COL_REVENUE)
        )
        val percent = ShagrirReportFieldParser.parsePercent(
            cell(row, columnIndex, ShagrirCommissionReportParser.COL_PERCENT)
        )
        val commission = ShagrirReportFieldParser.parseMoney(
            cell(row, columnIndex, ShagrirCommissionReportParser.COL_COMMISSION)
        )
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
            revenueExVat = ShagrirReportFieldParser.parseMoney(
                cell(row, columnIndex, ShagrirCommissionReportParser.COL_REVENUE)
            ),
            commissionAmount = ShagrirReportFieldParser.parseMoney(
                cell(row, columnIndex, ShagrirCommissionReportParser.COL_COMMISSION)
            )
        )
    } catch (e: Exception) {
        errors += "שגיאה בפיענוח שורת סה״כ: ${e.message}"
        null
    }

    private fun recordRejected(
        debug: EmailImportDebugSession?,
        sourceRowNumber: Int,
        cells: List<String>,
        cellsByCol: Map<String, String>,
        reasonCode: String
    ) {
        val shape = ShagrirReportRowClassifier.inspect(cellsByCol, cells.size)
        debug?.event(
            EmailImportDebugStage.TABLE_DATA_ROW_REJECTED,
            EmailImportDebugStatus.FAILURE,
            "Table data row rejected",
            mapOf(
                "rowIndex" to sourceRowNumber,
                "columnCount" to cells.size,
                "emptyFields" to shape.emptyFields,
                "numericShape" to shape.numericShapeSummary(),
                "reasonCode" to reasonCode
            )
        )
        debug?.addFailedRow(
            sourceRowIndex = sourceRowNumber,
            expectedColumn = shape.emptyFields.firstOrNull() ?: ShagrirCommissionReportParser.COL_ORDER,
            columnCount = cells.size,
            emptyFields = shape.emptyFields,
            numericShape = shape.numericShapeSummary()
        )
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