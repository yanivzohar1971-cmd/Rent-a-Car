package com.rentacar.app.commission.diagnostics

import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.Supplier
import com.rentacar.app.ui.vm.CommissionImportSource
import java.time.YearMonth

enum class ReconciliationDiagnosticStatus {
    AUTO_MATCHED,
    AMBIGUOUS,
    UNMATCHED,
    MANUALLY_MATCHED,
    ERROR,
    HISTORICAL
}

enum class ReconciliationRowFilter {
    ALL,
    MATCHED,
    NEEDS_MATCH,
    UNMATCHED,
    ERRORS
}

data class ReconciliationDebugAction(
    val timestampMs: Long = System.currentTimeMillis(),
    val code: String,
    val rowIndex: Int? = null,
    val reservationId: Long? = null,
    val groupKey: String? = null
)

data class ReconciliationCandidateView(
    val reservationId: Long,
    val orderNumber: String?,
    val dateFromMillis: Long,
    val actualReturnDateMillis: Long?,
    val periodTypeDays: Int,
    val reasonCodes: List<String>
)

data class ReconciliationReportSnapshot(
    val sessionId: String,
    val generatedAtMs: Long,
    val sourceType: CommissionImportSource,
    val supplier: Supplier?,
    val reportYearMonth: YearMonth,
    val parserLabel: String?,
    val emailUid: Long?,
    val emailMatchType: String?,
    val sourceFileName: String?,
    val parseResult: CommissionReportParseResult?,
    val items: List<CommissionReconciliationItem>,
    val historicalItems: List<CommissionReconciliationItem>,
    val kpis: CommissionReconciliationService.ReconciliationKpis?,
    val slicedCandidates: List<Reservation>,
    val allReservations: List<Reservation> = emptyList(),
    val manualSelections: Map<String, Long>,
    val actions: List<ReconciliationDebugAction>,
    val parserExecuted: Boolean,
    val normalizerExecuted: Boolean,
    val automaticMatchingExecuted: Boolean,
    val manualMatchingOpened: Boolean,
    val finalImportExecuted: Boolean,
    val parseFailureMessage: String?,
    val clipboardParse: com.rentacar.app.emailimport.clipboard.ClipboardParseResult? = null
)

object ReconciliationManualMatchOverlay {
    fun replaceGroup(
        items: List<CommissionReconciliationItem>,
        groupKey: String,
        replacement: List<CommissionReconciliationItem>
    ): List<CommissionReconciliationItem> =
        items.filter { it.normalizedGroupKey != groupKey } + replacement
}

object ReconciliationDiagnosticClassifier {

    fun status(
        item: CommissionReconciliationItem,
        manualReservationId: Long?
    ): ReconciliationDiagnosticStatus {
        if (manualReservationId != null) return ReconciliationDiagnosticStatus.MANUALLY_MATCHED
        if (item.lifecycleClassification ==
            CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name ||
            item.matchStatus == ReconciliationMatchStatus.APPLICATION_ONLY.name
        ) {
            return ReconciliationDiagnosticStatus.HISTORICAL
        }
        return when (item.matchStatus) {
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name ->
                ReconciliationDiagnosticStatus.AMBIGUOUS
            ReconciliationMatchStatus.SUPPLIER_ONLY.name ->
                ReconciliationDiagnosticStatus.UNMATCHED
            ReconciliationMatchStatus.INVALID_SUPPLIER_GROUP.name ->
                ReconciliationDiagnosticStatus.ERROR
            ReconciliationMatchStatus.MANUALLY_MATCHED.name ->
                ReconciliationDiagnosticStatus.MANUALLY_MATCHED
            else -> ReconciliationDiagnosticStatus.AUTO_MATCHED
        }
    }

    fun hebrewStatus(status: ReconciliationDiagnosticStatus): String = when (status) {
        ReconciliationDiagnosticStatus.AUTO_MATCHED -> "הותאם אוטומטית"
        ReconciliationDiagnosticStatus.AMBIGUOUS -> "דורש בחירה"
        ReconciliationDiagnosticStatus.UNMATCHED -> "ללא התאמה"
        ReconciliationDiagnosticStatus.MANUALLY_MATCHED -> "הותאם ידנית"
        ReconciliationDiagnosticStatus.ERROR -> "שגיאה"
        ReconciliationDiagnosticStatus.HISTORICAL -> "היסטורי"
    }

    fun canChooseMatch(status: ReconciliationDiagnosticStatus, candidateCount: Int): Boolean =
        candidateCount > 0 && (
            status == ReconciliationDiagnosticStatus.AMBIGUOUS ||
                status == ReconciliationDiagnosticStatus.UNMATCHED
            )

    fun isUnresolved(status: ReconciliationDiagnosticStatus): Boolean =
        status == ReconciliationDiagnosticStatus.AMBIGUOUS ||
            status == ReconciliationDiagnosticStatus.ERROR

    fun matchesFilter(
        status: ReconciliationDiagnosticStatus,
        filter: ReconciliationRowFilter
    ): Boolean = when (filter) {
        ReconciliationRowFilter.ALL -> true
        ReconciliationRowFilter.MATCHED ->
            status == ReconciliationDiagnosticStatus.AUTO_MATCHED ||
                status == ReconciliationDiagnosticStatus.MANUALLY_MATCHED
        ReconciliationRowFilter.NEEDS_MATCH -> status == ReconciliationDiagnosticStatus.AMBIGUOUS
        ReconciliationRowFilter.UNMATCHED -> status == ReconciliationDiagnosticStatus.UNMATCHED
        ReconciliationRowFilter.ERRORS -> status == ReconciliationDiagnosticStatus.ERROR
    }

    fun filterLabel(filter: ReconciliationRowFilter): String = when (filter) {
        ReconciliationRowFilter.ALL -> "הכל"
        ReconciliationRowFilter.MATCHED -> "הותאמו"
        ReconciliationRowFilter.NEEDS_MATCH -> "דורש התאמה"
        ReconciliationRowFilter.UNMATCHED -> "ללא התאמה"
        ReconciliationRowFilter.ERRORS -> "שגיאות"
    }
}

data class ReconciliationCounts(
    val sourceRowCount: Int,
    val parsedRowCount: Int,
    val parseErrorCount: Int,
    val autoMatchedCount: Int,
    val ambiguousCount: Int,
    val unmatchedCount: Int,
    val manuallyMatchedCount: Int,
    val unresolvedCount: Int,
    val errorCount: Int,
    val maxReferencedSourceRow: Int? = null
) {
    val unmatchedSupplierRows: Int get() = unmatchedCount
    val matchingComplete: Boolean
        get() = unmatchedCount == 0 && ambiguousCount == 0 && errorCount == 0 && parseErrorCount == 0
    val importAllowed: Boolean get() = importBlockedReason() == null
    val importAllowedWithSkippedSupplierRows: Boolean get() = importAllowed && unmatchedCount > 0
    val skippedSupplierRowCount: Int get() = unmatchedCount

    fun importBlockedReason(): String? = when {
        parseErrorCount > 0 && parsedRowCount == 0 ->
            if (parseErrorCount == 1) "קיימת שגיאת פענוח אחת בדוח"
            else "קיימות $parseErrorCount שגיאות פענוח בדוח"
        unresolvedCount > 0 ->
            if (unresolvedCount == 1) "נותרה שורה אחת שדורשת התאמה"
            else "נותרו $unresolvedCount שורות שדורשות התאמה"
        else -> null
    }
}
