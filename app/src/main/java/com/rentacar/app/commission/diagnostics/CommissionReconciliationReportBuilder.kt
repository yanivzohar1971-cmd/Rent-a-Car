package com.rentacar.app.commission.diagnostics

import com.google.gson.GsonBuilder
import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.presentation.CommissionComparisonMapper
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.ui.vm.CommissionImportSource
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object CommissionReconciliationReportBuilder {
    const val SCHEMA_VERSION = 2

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val gson = GsonBuilder()
        .setPrettyPrinting()
        .serializeNulls()
        .disableHtmlEscaping()
        .create()

    fun toJson(snapshot: ReconciliationReportSnapshot): String =
        gson.toJson(toMap(snapshot))

    fun toMap(snapshot: ReconciliationReportSnapshot): Map<String, Any?> {
        val parse = snapshot.parseResult
        val counts = counts(snapshot)
        val remaining = remainingIssues(snapshot, counts)
        return linkedMapOf(
            "schemaVersion" to SCHEMA_VERSION,
            "generatedAt" to iso.format(Date(snapshot.generatedAtMs)),
            "sessionId" to snapshot.sessionId,
            "source" to linkedMapOf(
                "type" to sourceTypeName(snapshot.sourceType),
                "supplierId" to snapshot.supplier?.id,
                "supplierName" to snapshot.supplier?.name,
                "reportYear" to snapshot.reportYearMonth.year,
                "reportMonth" to snapshot.reportYearMonth.monthValue,
                "emailUid" to snapshot.emailUid,
                "emailMatchType" to snapshot.emailMatchType,
                "parser" to MatchingDiagnostics.actualParserName(
                    snapshot.sourceType,
                    snapshot.parserLabel,
                    parse?.worksheetName
                ),
                "parserCode" to parse?.parserCode,
                "parserVersion" to parse?.parserVersion,
                "sourceFileName" to snapshot.sourceFileName
            ),
            "execution" to linkedMapOf(
                "parserExecuted" to snapshot.parserExecuted,
                "normalizerExecuted" to snapshot.normalizerExecuted,
                "automaticMatchingExecuted" to snapshot.automaticMatchingExecuted,
                "manualMatchingOpened" to snapshot.manualMatchingOpened,
                "finalImportExecuted" to snapshot.finalImportExecuted
            ),
            "summary" to linkedMapOf(
                "sourceRowCount" to counts.sourceRowCount,
                "parsedRowCount" to counts.parsedRowCount,
                "parseErrorCount" to counts.parseErrorCount,
                "autoMatchedCount" to counts.autoMatchedCount,
                "ambiguousCount" to counts.ambiguousCount,
                "unmatchedCount" to counts.unmatchedCount,
                "manuallyMatchedCount" to counts.manuallyMatchedCount,
                "unresolvedCount" to counts.unresolvedCount,
                "errorCount" to counts.errorCount,
                "maxReferencedSourceRow" to counts.maxReferencedSourceRow,
                "unmatchedSupplierRows" to counts.unmatchedSupplierRows,
                "matchingComplete" to counts.matchingComplete,
                "importAllowed" to (counts.importAllowed && snapshot.automaticMatchingExecuted && !snapshot.finalImportExecuted),
                "importAllowedWithSkippedSupplierRows" to counts.importAllowedWithSkippedSupplierRows,
                "skippedSupplierRowCount" to counts.skippedSupplierRowCount,
                "reconciliationReady" to counts.matchingComplete
            ),
            "totals" to presentationTotalsMap(snapshot),
            "parse" to linkedMapOf(
                "success" to parse?.success,
                "footerDetected" to parse?.footerDetected,
                "footerRowIndex" to parse?.footerRowIndex,
                "rejectedRowCount" to parse?.rejectedRowCount,
                "uniqueOrderCount" to parse?.uniqueOrderCount,
                "worksheetName" to parse?.worksheetName,
                "totalsMatch" to parse?.totalsMatch
            ),
            "parseErrors" to parseErrors(snapshot),
            "rows" to reportRows(snapshot),
            "matchingDiagnostics" to MatchingDiagnostics.analyze(
                allReservations = snapshot.allReservations.ifEmpty { snapshot.slicedCandidates },
                supplierId = snapshot.supplier?.id ?: 0L,
                supplierName = snapshot.supplier?.name,
                cutoff = CommissionReconciliationService.cutoffForReportMonth(snapshot.reportYearMonth),
                eligible = snapshot.slicedCandidates,
                reportItems = snapshot.items
            ),
            "remainingIssues" to remaining,
            "actions" to snapshot.actions.map { action ->
                linkedMapOf(
                    "timestamp" to iso.format(Date(action.timestampMs)),
                    "code" to action.code,
                    "rowIndex" to action.rowIndex,
                    "reservationId" to action.reservationId,
                    "groupKeyPresent" to !action.groupKey.isNullOrBlank()
                )
            }
        )
    }

    fun counts(snapshot: ReconciliationReportSnapshot): ReconciliationCounts {
        val parse = snapshot.parseResult
        val reportItems = snapshot.items.filterNot {
            it.matchStatus == ReconciliationMatchStatus.APPLICATION_ONLY.name
        }
        var auto = 0
        var ambiguous = 0
        var unmatched = 0
        var manual = 0
        var errors = 0
        var unresolved = 0
        reportItems.forEach { item ->
            val selected = snapshot.manualSelections[item.normalizedGroupKey]
            val status = ReconciliationDiagnosticClassifier.status(item, selected)
            when (status) {
                ReconciliationDiagnosticStatus.AUTO_MATCHED -> auto++
                ReconciliationDiagnosticStatus.AMBIGUOUS -> {
                    ambiguous++
                    unresolved++
                }
                ReconciliationDiagnosticStatus.UNMATCHED -> unmatched++
                ReconciliationDiagnosticStatus.MANUALLY_MATCHED -> manual++
                ReconciliationDiagnosticStatus.ERROR -> {
                    errors++
                    unresolved++
                }
                ReconciliationDiagnosticStatus.HISTORICAL -> Unit
            }
        }
        val rawCount = parse?.rawRows?.size ?: snapshot.clipboardParse?.parsedRowCount ?: 0
        val rejected = parse?.rejectedRowCount
            ?: snapshot.clipboardParse?.rejectedRowCount
            ?: 0
        val referenced = referencedSourceRows(snapshot).maxOrNull()
        val sourceCount = rawCount + rejected
        return ReconciliationCounts(
            sourceRowCount = if (sourceCount > 0) sourceCount else reportItems.size,
            parsedRowCount = rawCount,
            parseErrorCount = parseErrors(snapshot).size,
            autoMatchedCount = auto,
            ambiguousCount = ambiguous,
            unmatchedCount = unmatched,
            manuallyMatchedCount = manual,
            unresolvedCount = unresolved,
            errorCount = errors,
            maxReferencedSourceRow = referenced
        )
    }

    fun candidatesFor(
        orderNumber: String?,
        sliced: List<com.rentacar.app.data.Reservation>
    ): List<ReconciliationCandidateView> {
        if (orderNumber.isNullOrBlank()) return emptyList()
        return CommissionReconciliationService.listReservationMatches(orderNumber, sliced).map { reservation ->
            ReconciliationCandidateView(
                reservationId = reservation.id,
                orderNumber = reservation.supplierOrderNumber ?: reservation.externalContractNumber,
                dateFromMillis = reservation.dateFrom,
                actualReturnDateMillis = reservation.actualReturnDate,
                periodTypeDays = reservation.periodTypeDays,
                reasonCodes = CommissionReconciliationService.matchReasonCodes(orderNumber, reservation)
            )
        }
    }

    fun containsForbiddenSecrets(json: String): Boolean {
        val lower = json.lowercase(Locale.US)
        if (lower.contains("apppassword") && !lower.contains("********")) return true
        if (Regex("(?i)\"password\"\\s*:\\s*\"(?!\\*+)[^\"]{4,}\"").containsMatchIn(json)) return true
        if (lower.contains("firebase") && lower.contains("private_key")) return true
        return false
    }

    private fun sourceTypeName(source: CommissionImportSource): String = when (source) {
        CommissionImportSource.EMAIL -> "EMAIL"
        CommissionImportSource.CLIPBOARD -> "CLIPBOARD"
        CommissionImportSource.MANUAL_FILE -> "XLSX"
        CommissionImportSource.NONE -> "UNKNOWN"
    }

    private fun parseErrors(snapshot: ReconciliationReportSnapshot): List<Map<String, Any?>> {
        val out = mutableListOf<Map<String, Any?>>()
        val seen = mutableSetOf<String>()
        val rawNumbers = snapshot.parseResult?.rawRows.orEmpty().map { it.sourceRowNumber }.toSet()
        val rowRe = Regex("""שורה\s+(\d+)\s*[:—\-]\s*(.+)""")
        fun addError(
            message: String,
            sourceRow: Int?,
            field: String?,
            code: String,
            columnCount: Int?,
            consideredDataRow: Boolean?
        ) {
            if (!seen.add(message)) return
            val before = sourceRow?.let { row ->
                snapshot.parseResult?.rawRows.orEmpty().count { it.sourceRowNumber < row }
            }
            val after = sourceRow?.let { row ->
                snapshot.parseResult?.rawRows.orEmpty().count { it.sourceRowNumber > row }
            }
            out += linkedMapOf(
                "sourceRow" to sourceRow,
                "parserRowIndex" to sourceRow,
                "field" to field,
                "code" to code,
                "message" to message,
                "observedColumnCount" to columnCount,
                "consideredDataRow" to (consideredDataRow ?: sourceRow?.let { it in rawNumbers }),
                "rowsBefore" to before,
                "rowsAfter" to after,
                "hadRowsBefore" to ((before ?: 0) > 0),
                "hadRowsAfter" to ((after ?: 0) > 0)
            )
        }
        snapshot.parseResult?.errors.orEmpty().forEach { message ->
            val match = rowRe.find(message)
            val row = match?.groupValues?.getOrNull(1)?.toIntOrNull()
            val rest = match?.groupValues?.getOrNull(2) ?: message
            addError(
                message = message,
                sourceRow = row,
                field = inferField(rest),
                code = inferCode(rest),
                columnCount = snapshot.clipboardParse?.logicalColumnCount,
                consideredDataRow = row?.let { it in rawNumbers }
            )
        }
        snapshot.clipboardParse?.rejectedRows.orEmpty().forEach { rejected ->
            addError(
                message = rejected.reason,
                sourceRow = rejected.sourceLine,
                field = rejected.expectedField,
                code = inferCode(rejected.reason),
                columnCount = snapshot.clipboardParse?.logicalColumnCount,
                consideredDataRow = false
            )
        }
        snapshot.clipboardParse?.errors.orEmpty().forEach { message ->
            val match = rowRe.find(message)
            addError(
                message = message,
                sourceRow = match?.groupValues?.getOrNull(1)?.toIntOrNull(),
                field = inferField(match?.groupValues?.getOrNull(2) ?: message),
                code = inferCode(message),
                columnCount = snapshot.clipboardParse?.logicalColumnCount,
                consideredDataRow = null
            )
        }
        snapshot.parseFailureMessage?.takeIf { it.isNotBlank() }?.let { msg ->
            addError(
                message = msg,
                sourceRow = rowRe.find(msg)?.groupValues?.getOrNull(1)?.toIntOrNull(),
                field = null,
                code = "PARSE_FAILURE",
                columnCount = snapshot.clipboardParse?.logicalColumnCount,
                consideredDataRow = null
            )
        }
        return out
    }

    private fun referencedSourceRows(snapshot: ReconciliationReportSnapshot): List<Int> {
        val rows = mutableListOf<Int>()
        snapshot.parseResult?.rawRows.orEmpty().forEach { rows += it.sourceRowNumber }
        snapshot.parseResult?.footerRowIndex?.let { rows += it }
        snapshot.parseResult?.normalizedGroups.orEmpty().forEach { rows += it.sourceRowNumbers }
        snapshot.clipboardParse?.parsedRows.orEmpty().forEach { rows += it.sourceRowNumber }
        snapshot.clipboardParse?.footerRowIndex?.let { rows += it }
        val rowRe = Regex("""שורה\s+(\d+)""")
        (snapshot.parseResult?.errors.orEmpty() +
            snapshot.clipboardParse?.errors.orEmpty() +
            listOfNotNull(snapshot.parseFailureMessage)).forEach { msg ->
            rowRe.find(msg)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let { rows += it }
        }
        snapshot.clipboardParse?.rejectedRows.orEmpty().mapNotNull { it.sourceLine }.let { rows += it }
        return rows
    }

    private fun inferField(text: String): String? = when {
        text.contains("מספר הזמנה") -> "מספר הזמנה"
        text.contains("חשבונית") -> "מספר חשבונית"
        text.contains("עמלה") -> "עמלה"
        text.contains("ימים") -> "סהכ ימים"
        else -> null
    }

    private fun inferCode(text: String): String = when {
        text.contains("ריק") -> "EMPTY_FIELD"
        text.contains("לא תקין") -> "INVALID_VALUE"
        else -> "PARSE_ERROR"
    }

    private fun reportRows(snapshot: ReconciliationReportSnapshot): List<Map<String, Any?>> {
        return snapshot.items.map { item ->
            val selected = snapshot.manualSelections[item.normalizedGroupKey]
            val status = ReconciliationDiagnosticClassifier.status(item, selected)
            val order = item.supplierOrderNumber
            val candidates = candidatesFor(order, snapshot.slicedCandidates)
            val autoReservation = item.reservationId?.takeIf {
                status == ReconciliationDiagnosticStatus.AUTO_MATCHED
            }
            val autoRes = autoReservation?.let { id -> snapshot.slicedCandidates.firstOrNull { it.id == id } }
            linkedMapOf(
                "sourceRow" to sourceRowFor(item, snapshot),
                "groupKey" to item.normalizedGroupKey,
                "supplierOrderNumber" to item.supplierOrderNumber,
                "supplierInvoiceNumber" to item.supplierInvoiceNumber,
                "commissionAmount" to item.supplierCommission,
                "totalDays" to item.supplierDays,
                "commissionPercent" to item.supplierPercent,
                "matchStatus" to status.name,
                "engineMatchStatus" to item.matchStatus,
                "engineLifecycle" to item.lifecycleClassification,
                "autoMatch" to autoReservation?.let { id ->
                    linkedMapOf(
                        "reservationId" to id,
                        "orderNumber" to (item.appSupplierOrderNumber ?: autoRes?.supplierOrderNumber),
                        "score" to null,
                        "reasonCodes" to (autoRes?.let {
                            CommissionReconciliationService.matchReasonCodes(order.orEmpty(), it)
                        } ?: emptyList<String>())
                    )
                },
                "candidateCount" to candidates.size,
                "candidates" to candidates.map { candidate ->
                    linkedMapOf(
                        "reservationId" to candidate.reservationId,
                        "orderNumber" to candidate.orderNumber,
                        "dateFrom" to isoDate(candidate.dateFromMillis),
                        "actualReturnDate" to candidate.actualReturnDateMillis?.let { isoDate(it) },
                        "rentalTypeDays" to candidate.periodTypeDays,
                        "matchScore" to null,
                        "reasonCodes" to candidate.reasonCodes,
                        "reasonHebrew" to candidate.reasonCodes.map {
                            CommissionReconciliationService.matchReasonHebrew(it)
                        }
                    )
                },
                "manualSelection" to selected?.let { id ->
                    val res = snapshot.slicedCandidates.firstOrNull { it.id == id }
                    linkedMapOf(
                        "selectedReservationId" to id,
                        "selectedOrderNumber" to (res?.supplierOrderNumber ?: res?.externalContractNumber)
                    )
                },
                "difference" to linkedMapOf(
                    "supplierAmount" to item.supplierCommission,
                    "calculatedAmount" to item.internalCommission,
                    "delta" to item.deviation
                ),
                "matchDiagnosis" to if (status == ReconciliationDiagnosticStatus.UNMATCHED) {
                    MatchingDiagnostics.diagnoseUnmatched(
                        orderNumber = order,
                        allReservations = snapshot.allReservations.ifEmpty { snapshot.slicedCandidates },
                        supplierId = snapshot.supplier?.id ?: 0L,
                        cutoffMillis = CommissionBusinessDates.toStartOfDayMillis(
                            CommissionReconciliationService.cutoffForReportMonth(snapshot.reportYearMonth)
                        ),
                        eligible = snapshot.slicedCandidates
                    )
                } else null
            )
        }
    }

    private fun sourceRowFor(
        item: CommissionReconciliationItem,
        snapshot: ReconciliationReportSnapshot
    ): Int? {
        val group = snapshot.parseResult?.normalizedGroups
            ?.firstOrNull { it.groupKey == item.normalizedGroupKey }
        return group?.sourceRowNumbers?.minOrNull()
            ?: snapshot.parseResult?.rawRows
                ?.firstOrNull {
                    RawCommissionReportRow.normalizeId(it.orderNumber) ==
                        RawCommissionReportRow.normalizeId(item.supplierOrderNumber.orEmpty())
                }
                ?.sourceRowNumber
    }

    private fun isoDate(millis: Long): String =
        CommissionBusinessDates.toLocalDate(millis).toString()

    private fun remainingIssues(
        snapshot: ReconciliationReportSnapshot,
        counts: ReconciliationCounts
    ): List<String> {
        val issues = mutableListOf<String>()
        counts.importBlockedReason()?.let { issues += it }
        if (counts.unmatchedCount > 0) {
            issues += "unmatchedSupplierRows=${counts.unmatchedCount} will be skipped on import"
        }
        if (snapshot.parseResult?.footerDetected == true) {
            issues += "footerDetected row=${snapshot.parseResult.footerRowIndex}"
        }
        if (snapshot.finalImportExecuted) issues += "finalImportExecuted"
        return issues
    }

    private fun presentationTotalsMap(snapshot: ReconciliationReportSnapshot): Map<String, Any?> {
        val presentations = CommissionComparisonMapper.buildPresentations(
            items = snapshot.items + snapshot.historicalItems
        )
        val totals = CommissionComparisonMapper.computeTotals(presentations)
        return linkedMapOf(
            "supplierReportCommissionTotal" to totals.supplierTotal.toExactString(),
            "matchedApplicationCommissionTotal" to totals.matchedApplicationTotal.toExactString(),
            "applicationOnlyCommissionTotal" to totals.applicationOnlyTotal.toExactString(),
            "historicalApplicationCommissionTotal" to totals.historicalApplicationTotal.toExactString(),
            "combinedApplicationCommissionTotal" to totals.combinedApplicationTotal.toExactString(),
            "matchedDifference" to totals.matchedDifference.toExactString(),
            "legacyKpiInternalCommissionTotal" to snapshot.kpis?.internalCommissionTotal?.toExactString(),
            "definitions" to linkedMapOf(
                "supplierReportCommissionTotal" to "Sum of supplier report groups",
                "matchedApplicationCommissionTotal" to "Application commission of identifier-matched rows only",
                "applicationOnlyCommissionTotal" to "Open application reservations with no supplier row",
                "historicalApplicationCommissionTotal" to "Same population as application-only historical baseline",
                "combinedApplicationCommissionTotal" to "Matched + application-only; not comparable to the supplier report total",
                "matchedDifference" to "supplierReportCommissionTotal minus matchedApplicationCommissionTotal"
            )
        )
    }
}
