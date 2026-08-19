package com.rentacar.app.emailimport.clipboard

import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionReportNormalizer
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionReportTotals
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.parser.ShagrirCommissionReportParser
import com.rentacar.app.data.Supplier
import com.rentacar.app.emailimport.HebrewHeaderNormalizer
import com.rentacar.app.emailimport.ShagrirHtmlTableReportParser
import com.rentacar.app.emailimport.ShagrirReportFieldParser
import com.rentacar.app.emailimport.ShagrirReportRowClassifier
import com.rentacar.app.emailimport.ShagrirRowKind
import com.rentacar.app.emailimport.debug.EmailImportDebugSession
import com.rentacar.app.emailimport.debug.EmailImportDebugStage
import com.rentacar.app.emailimport.debug.EmailImportDebugStatus
import java.security.MessageDigest

/**
 * Parses Gmail Select-All / Copy text for the Shagrir HTML commission table.
 * Ignores Gmail chrome before/after the table. Never dedupes by order number.
 */
class ShagrirClipboardParser : CommissionClipboardParser {

    override val parserName: String = PARSER_NAME

    override fun supportsSupplier(supplier: Supplier): Boolean {
        val name = supplier.name
        val email = supplier.commissionReportEmail.orEmpty()
        return name.contains("שגריר") ||
            email.contains("shagrir", ignoreCase = true)
    }

    override fun parse(text: String): ClipboardParseResult = parse(text, debug = null)

    fun parse(text: String, debug: EmailImportDebugSession?): ClipboardParseResult {
        val textLength = text.length
        val clipping = detectClipping(text)
        if (clipping) {
            return failure(
                textLength = textLength,
                clippingDetected = true,
                errors = listOf(ClipboardTextInterpreter.CLIPPED_MESSAGE_HEBREW)
            )
        }

        val tokens = tokenize(text)
        if (tokens.isEmpty()) {
            return failure(
                textLength = textLength,
                errors = listOf("לא נמצא טקסט לניתוח")
            )
        }

        val headerHit = findHeaderFingerprint(tokens)
        if (headerHit == null) {
            return failure(
                textLength = textLength,
                errors = listOf("לא זוהתה טבלת עמלות של שגריר בטקסט שהועתק")
            )
        }

        val (headerStart, columnIndex, headerTokens) = headerHit
        debug?.event(
            EmailImportDebugStage.CLIPBOARD_HEADER_FOUND,
            EmailImportDebugStatus.SUCCESS,
            "Clipboard header fingerprint found",
            mapOf(
                "headerStartIndex" to headerStart,
                "columnCount" to LOGICAL_COLUMNS
            )
        )
        val parsedRows = mutableListOf<RawCommissionReportRow>()
        val rejected = mutableListOf<ClipboardRejectedRow>()
        val warnings = mutableListOf<String>()
        val errors = mutableListOf<String>()
        var footerDetected = false
        var footerRowIndex: Int? = null
        var structurallySafe = true
        var workbookTotals: CommissionReportTotals? = null
        val parseStarted = System.currentTimeMillis()

        var cursor = headerStart + LOGICAL_COLUMNS
        var rowNumber = 2
        debug?.event(
            EmailImportDebugStage.CLIPBOARD_DATA_START,
            EmailImportDebugStatus.INFO,
            "Clipboard data start",
            mapOf(
                "headerStartIndex" to headerStart,
                "columnCount" to LOGICAL_COLUMNS,
                "remainingTokens" to (tokens.size - cursor)
            )
        )
        while (cursor < tokens.size) {
            val remaining = tokens.size - cursor
            if (remaining < LOGICAL_COLUMNS) {
                val leftover = tokens.subList(cursor, tokens.size).map { it.value }
                val leftoverIsPartialOrder = leftover.firstOrNull()
                    ?.let { ShagrirReportFieldParser.looksLikeOrderOrInvoice(it) } == true
                if (parsedRows.isNotEmpty() &&
                    (leftoverLooksLikeFooter(leftover) || !leftoverIsPartialOrder)
                ) {
                    footerDetected = true
                    footerRowIndex = rowNumber
                    debug?.event(
                        EmailImportDebugStage.CLIPBOARD_FOOTER_DETECTED,
                        EmailImportDebugStatus.INFO,
                        "Clipboard footer detected",
                        mapOf(
                            "rowIndex" to rowNumber,
                            "reasonCode" to "LEFTOVER",
                            "columnCount" to leftover.size,
                            "parsedRows" to parsedRows.size
                        )
                    )
                } else {
                    structurallySafe = false
                    rejected += ClipboardRejectedRow(
                        tokenStartIndex = cursor,
                        sourceLine = tokens.getOrNull(cursor)?.line,
                        expectedField = "שורה מלאה ($LOGICAL_COLUMNS עמודות)",
                        reason = "נותרו $remaining ערכים בסוף הטבלה"
                    )
                    errors += "שורה חלקית בסוף הדוח — הייבוא נעצר כדי לא לערבב עמודות"
                    debug?.event(
                        EmailImportDebugStage.CLIPBOARD_ROW_REJECTED,
                        EmailImportDebugStatus.FAILURE,
                        "Clipboard row rejected",
                        mapOf(
                            "rowIndex" to rowNumber,
                            "columnCount" to remaining,
                            "reasonCode" to "PARTIAL_ROW"
                        )
                    )
                }
                break
            }

            val group = tokens.subList(cursor, cursor + LOGICAL_COLUMNS)
            val cells = group.map { it.value }
            val cellsByCol = ShagrirReportRowClassifier.cellMap(cells, columnIndex)
            val following = followingCellMaps(tokens, cursor, columnIndex)

            val kind = ShagrirReportRowClassifier.classify(
                cellsByCol = cellsByCol,
                validRowsParsed = parsedRows.size,
                followingRows = following,
                rawColumnCount = cells.size
            )
            when (kind) {
                ShagrirRowKind.BLANK -> {
                    cursor += LOGICAL_COLUMNS
                    continue
                }
                ShagrirRowKind.TOTALS -> {
                    footerDetected = true
                    footerRowIndex = rowNumber
                    workbookTotals = try {
                        CommissionReportTotals(
                            revenueExVat = ShagrirReportFieldParser.parseMoney(
                                cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_REVENUE)]
                            ),
                            commissionAmount = ShagrirReportFieldParser.parseMoney(
                                cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_COMMISSION)]
                            )
                        )
                    } catch (e: Exception) {
                        warnings += "שורת סה״כ זוהתה אך לא פוענחה: ${e.message}"
                        null
                    }
                    debug?.event(
                        EmailImportDebugStage.CLIPBOARD_FOOTER_DETECTED,
                        EmailImportDebugStatus.INFO,
                        "Clipboard footer detected",
                        mapOf(
                            "rowIndex" to rowNumber,
                            "reasonCode" to "TOTALS",
                            "parsedRows" to parsedRows.size
                        )
                    )
                    break
                }
                ShagrirRowKind.FOOTER -> {
                    footerDetected = true
                    footerRowIndex = rowNumber
                    debug?.event(
                        EmailImportDebugStage.CLIPBOARD_FOOTER_DETECTED,
                        EmailImportDebugStatus.INFO,
                        "Clipboard footer detected",
                        mapOf(
                            "rowIndex" to rowNumber,
                            "reasonCode" to "FOOTER",
                            "columnCount" to cells.size,
                            "parsedRows" to parsedRows.size
                        )
                    )
                    break
                }
                ShagrirRowKind.MALFORMED -> {
                    structurallySafe = false
                    val reason = ShagrirReportRowClassifier.malformedReason(cellsByCol)
                    val shape = ShagrirReportRowClassifier.inspect(cellsByCol, cells.size)
                    rejected += ClipboardRejectedRow(
                        tokenStartIndex = cursor,
                        sourceLine = group.first().line,
                        expectedField = shape.emptyFields.firstOrNull(),
                        reason = reason
                    )
                    errors += "שורה $rowNumber: $reason"
                    debug?.event(
                        EmailImportDebugStage.CLIPBOARD_ROW_REJECTED,
                        EmailImportDebugStatus.FAILURE,
                        "Clipboard row rejected",
                        mapOf(
                            "rowIndex" to rowNumber,
                            "columnCount" to cells.size,
                            "emptyFields" to shape.emptyFields,
                            "numericShape" to shape.numericShapeSummary(),
                            "reasonCode" to "MALFORMED"
                        )
                    )
                    debug?.addFailedRow(
                        sourceRowIndex = rowNumber,
                        expectedColumn = shape.emptyFields.firstOrNull()
                            ?: ShagrirCommissionReportParser.COL_ORDER,
                        columnCount = cells.size,
                        emptyFields = shape.emptyFields,
                        numericShape = shape.numericShapeSummary()
                    )
                    break
                }
                ShagrirRowKind.VALID_DATA -> {
                    try {
                        parsedRows += parseRow(cells, columnIndex, rowNumber)
                        debug?.event(
                            EmailImportDebugStage.CLIPBOARD_ROW_ACCEPTED,
                            EmailImportDebugStatus.INFO,
                            "Clipboard row accepted",
                            mapOf(
                                "rowIndex" to rowNumber,
                                "columnCount" to cells.size,
                                "parsedRows" to parsedRows.size
                            )
                        )
                    } catch (e: Exception) {
                        structurallySafe = false
                        rejected += ClipboardRejectedRow(
                            tokenStartIndex = cursor,
                            sourceLine = group.first().line,
                            expectedField = null,
                            reason = e.message ?: "שגיאת פיענוח"
                        )
                        errors += "שורה $rowNumber: ${e.message ?: "שגיאת פיענוח"}"
                        debug?.event(
                            EmailImportDebugStage.CLIPBOARD_ROW_REJECTED,
                            EmailImportDebugStatus.FAILURE,
                            "Clipboard row rejected",
                            mapOf(
                                "rowIndex" to rowNumber,
                                "columnCount" to cells.size,
                                "reasonCode" to "PARSE_EXCEPTION"
                            )
                        )
                        break
                    }
                    cursor += LOGICAL_COLUMNS
                    rowNumber++
                }
            }
        }

        if (parsedRows.isEmpty() && errors.none { it.contains("חלקית") }) {
            errors += "לא נמצאו שורות פירוט בדוח"
            structurallySafe = false
        }

        val normalized = CommissionReportNormalizer.normalize(parsedRows)
        val rawSums = CommissionReportTotals(
            revenueExVat = CommissionReportNormalizer.sumRevenue(parsedRows),
            commissionAmount = CommissionReportNormalizer.sumCommission(parsedRows)
        )
        val normalizedSums = CommissionReportTotals(
            revenueExVat = CommissionReportNormalizer.sumGroupRevenue(normalized),
            commissionAmount = CommissionReportNormalizer.sumGroupCommission(normalized)
        )
        val totalsSnapshot = workbookTotals
        val totalsMatch = when {
            totalsSnapshot == null -> {
                if (parsedRows.isNotEmpty()) {
                    warnings += "שורת סה״כ חסרה — סיכומים חושבו מהשורות"
                    true
                } else {
                    false
                }
            }
            else -> {
                val revenueOk = rawSums.revenueExVat.matchesWithinTolerance(totalsSnapshot.revenueExVat)
                val commissionOk = rawSums.commissionAmount.matchesWithinTolerance(totalsSnapshot.commissionAmount)
                if (!revenueOk) errors += "סה״כ הכנסה לא מתאים"
                if (!commissionOk) errors += "סה״כ עמלה לא מתאים"
                revenueOk && commissionOk
            }
        }

        val isComplete = structurallySafe &&
            errors.isEmpty() &&
            parsedRows.isNotEmpty() &&
            totalsMatch

        val parseResult = CommissionReportParseResult(
            success = isComplete,
            parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
            parserVersion = 1,
            worksheetName = "CLIPBOARD",
            rawRows = parsedRows,
            normalizedGroups = normalized,
            workbookTotals = workbookTotals,
            rawSums = rawSums,
            normalizedSums = normalizedSums,
            totalsMatch = totalsMatch,
            uniqueOrderCount = parsedRows.map { RawCommissionReportRow.normalizeId(it.orderNumber) }.toSet().size,
            errors = errors,
            warnings = warnings,
            footerDetected = footerDetected,
            footerRowIndex = footerRowIndex,
            rejectedRowCount = rejected.size
        )
        if (isComplete) {
            debug?.event(
                EmailImportDebugStage.CLIPBOARD_PARSE_SUCCESS,
                EmailImportDebugStatus.SUCCESS,
                "Clipboard parse success",
                mapOf(
                    "parsedRows" to parsedRows.size,
                    "rejectedRows" to rejected.size,
                    "footerDetected" to footerDetected,
                    "footerRowIndex" to footerRowIndex,
                    "elapsedMs" to (System.currentTimeMillis() - parseStarted)
                )
            )
        } else {
            debug?.event(
                EmailImportDebugStage.CLIPBOARD_PARSE_FAILURE,
                EmailImportDebugStatus.FAILURE,
                "Clipboard parse failure",
                mapOf(
                    "parsedRows" to parsedRows.size,
                    "rejectedRows" to rejected.size,
                    "footerDetected" to footerDetected,
                    "errorCount" to errors.size,
                    "elapsedMs" to (System.currentTimeMillis() - parseStarted)
                )
            )
        }

        return ClipboardParseResult(
            parserName = PARSER_NAME,
            supplierKey = "shagrir",
            detected = true,
            headers = headerTokens,
            parsedRows = parsedRows,
            rejectedRows = rejected,
            warnings = warnings,
            errors = errors,
            isComplete = isComplete,
            sourceFingerprint = contentFingerprint(headerTokens, parsedRows),
            headerStartIndex = headerStart,
            headerStartLine = tokens[headerStart].line,
            logicalColumnCount = LOGICAL_COLUMNS,
            parsedRowCount = parsedRows.size,
            rejectedRowCount = rejected.size,
            clippingDetected = false,
            footerDetected = footerDetected,
            textLength = textLength,
            parseResult = parseResult,
            footerRowIndex = footerRowIndex
        )
    }

    private data class Token(val line: Int, val value: String)

    private fun tokenize(text: String): List<Token> {
        val normalized = text.replace("\r\n", "\n").replace('\r', '\n')
        return normalized.split('\n').mapIndexedNotNull { idx, raw ->
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) null else Token(line = idx + 1, value = trimmed)
        }
    }

    private fun detectClipping(text: String): Boolean {
        val lower = text.lowercase()
        return lower.contains("[message clipped]") ||
            lower.contains("view entire message")
    }

    private data class HeaderHit(
        val startIndex: Int,
        val columnIndex: Map<String, Int>,
        val headerTokens: List<String>
    )

    private fun findHeaderFingerprint(tokens: List<Token>): HeaderHit? {
        if (tokens.size < LOGICAL_COLUMNS) return null
        val required = ShagrirCommissionReportParser.REQUIRED_HEADERS
        for (i in 0..tokens.size - LOGICAL_COLUMNS) {
            val window = tokens.subList(i, i + LOGICAL_COLUMNS).map { it.value }
            val mapping = mapHeaders(window, required) ?: continue
            return HeaderHit(i, mapping, window)
        }
        return null
    }

    private fun mapHeaders(window: List<String>, required: List<String>): Map<String, Int>? {
        val used = mutableSetOf<Int>()
        val map = mutableMapOf<String, Int>()
        for (col in required) {
            val idx = window.indices.firstOrNull { i ->
                i !in used &&
                    HebrewHeaderNormalizer.findKey(
                        headers = listOf(window[i]),
                        expected = col,
                        aliases = ShagrirHtmlTableReportParser.HEADER_ALIASES[col].orEmpty()
                    ) != null
            } ?: return null
            used += idx
            map[col] = idx
        }
        return if (map.size == required.size) map else null
    }

    private fun followingCellMaps(
        tokens: List<Token>,
        currentCursor: Int,
        columnIndex: Map<String, Int>
    ): List<Map<String, String>> {
        val out = mutableListOf<Map<String, String>>()
        var c = currentCursor + LOGICAL_COLUMNS
        var n = 0
        while (c + LOGICAL_COLUMNS <= tokens.size && n < ShagrirReportRowClassifier.LOOKAHEAD_ROWS) {
            val cells = tokens.subList(c, c + LOGICAL_COLUMNS).map { it.value }
            out += ShagrirReportRowClassifier.cellMap(cells, columnIndex)
            c += LOGICAL_COLUMNS
            n++
        }
        return out
    }

    private fun parseRow(
        cells: List<String>,
        columnIndex: Map<String, Int>,
        sourceRowNumber: Int
    ): RawCommissionReportRow {
        val orderNumber = ShagrirReportFieldParser.parseOrderNumber(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_ORDER)]
        )
        val invoiceNumber = ShagrirReportFieldParser.parseInvoiceNumber(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_INVOICE)]
        )
        val days = ShagrirReportFieldParser.parseDays(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_DAYS)]
        )
        val customer = cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_CUSTOMER)].trim()
        val revenue = ShagrirReportFieldParser.parseMoney(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_REVENUE)]
        )
        val percent = ShagrirReportFieldParser.parsePercent(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_PERCENT)]
        )
        val commission = ShagrirReportFieldParser.parseMoney(
            cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_COMMISSION)]
        )
        val agent = cells[columnIndex.getValue(ShagrirCommissionReportParser.COL_AGENT)].trim()
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

    private fun leftoverLooksLikeFooter(tokens: List<String>): Boolean {
        if (tokens.isEmpty()) return true
        if (tokens.firstOrNull()?.let { ShagrirReportFieldParser.isTotalsLabel(it) } == true) return true
        val joined = tokens.joinToString(" ")
        return ShagrirReportRowClassifier.looksLikeFooterText(joined) ||
            tokens.all { ShagrirReportRowClassifier.looksLikeFooterText(it) }
    }

    private fun failure(
        textLength: Int,
        clippingDetected: Boolean = false,
        errors: List<String>
    ): ClipboardParseResult {
        val emptyParse = CommissionReportParseResult(
            success = false,
            parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
            parserVersion = 1,
            worksheetName = "CLIPBOARD",
            rawRows = emptyList(),
            normalizedGroups = emptyList(),
            workbookTotals = null,
            rawSums = CommissionReportTotals(MoneyDecimal.ZERO, MoneyDecimal.ZERO),
            normalizedSums = CommissionReportTotals(MoneyDecimal.ZERO, MoneyDecimal.ZERO),
            totalsMatch = false,
            uniqueOrderCount = 0,
            errors = errors
        )
        return ClipboardParseResult(
            parserName = PARSER_NAME,
            supplierKey = "shagrir",
            detected = false,
            headers = emptyList(),
            parsedRows = emptyList(),
            rejectedRows = emptyList(),
            warnings = emptyList(),
            errors = errors,
            isComplete = false,
            sourceFingerprint = "",
            headerStartIndex = null,
            headerStartLine = null,
            logicalColumnCount = LOGICAL_COLUMNS,
            parsedRowCount = 0,
            rejectedRowCount = 0,
            clippingDetected = clippingDetected,
            footerDetected = false,
            textLength = textLength,
            parseResult = emptyParse
        )
    }

    companion object {
        const val PARSER_NAME = "ShagrirClipboardParser"
        const val LOGICAL_COLUMNS = 8

        fun contentFingerprint(headers: List<String>, rows: List<RawCommissionReportRow>): String {
            val payload = buildString {
                append(headers.joinToString("|") { HebrewHeaderNormalizer.normalize(it) })
                append('\n')
                rows.forEach { row ->
                    append(
                        listOf(
                            RawCommissionReportRow.normalizeId(row.orderNumber),
                            RawCommissionReportRow.normalizeId(row.invoiceNumber),
                            row.totalDays.toString(),
                            collapseWs(row.customerName),
                            row.revenueExVat.toExactString(),
                            row.commissionPercent.toExactString(),
                            row.commissionAmount.toExactString(),
                            collapseWs(row.agentName)
                        ).joinToString("|")
                    )
                    append('\n')
                }
            }
            return sha256(payload)
        }

        private fun collapseWs(value: String): String =
            value.trim().replace(Regex("\\s+"), " ")

        private fun sha256(input: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}
