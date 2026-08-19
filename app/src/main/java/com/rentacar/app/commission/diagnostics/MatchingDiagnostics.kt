package com.rentacar.app.commission.diagnostics

import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.ui.vm.CommissionImportSource
import java.time.LocalDate

/**
 * Observability for the existing matching pipeline. Does not change slice or match rules.
 *
 * Pipeline:
 *   all reservations
 *     -> same supplierId
 *     -> status != Cancelled
 *     -> dateFrom < cutoff (exclusive start-of-day, Asia/Jerusalem)
 *     -> eligible candidate slice
 *     -> exact supplierOrderNumber, else exact externalContractNumber
 */
object MatchingDiagnostics {

    const val REASON_NO_IDENTIFIER_MATCH = "NO_IDENTIFIER_MATCH"
    const val REASON_NO_SUPPLIER_CANDIDATES = "NO_SUPPLIER_CANDIDATES"
    const val REASON_ALL_CANDIDATES_AFTER_CUTOFF = "ALL_CANDIDATES_AFTER_CUTOFF"
    const val REASON_ALL_CANDIDATES_WRONG_SUPPLIER = "ALL_CANDIDATES_WRONG_SUPPLIER"
    const val REASON_IDENTIFIER_FIELD_EMPTY = "IDENTIFIER_FIELD_EMPTY"
    const val REASON_MULTIPLE_EXACT_IDENTIFIER_MATCHES = "MULTIPLE_EXACT_IDENTIFIER_MATCHES"
    const val REASON_CANDIDATE_FOUND = "CANDIDATE_FOUND"
    const val REASON_ALL_CANDIDATES_EXCLUDED_STATUS = "ALL_CANDIDATES_EXCLUDED_STATUS"

    fun actualParserName(
        source: CommissionImportSource,
        configuredLabel: String?,
        worksheetName: String?
    ): String = when (source) {
        CommissionImportSource.EMAIL -> "ShagrirHtmlTableReportParser"
        CommissionImportSource.CLIPBOARD -> "ShagrirClipboardParser"
        CommissionImportSource.MANUAL_FILE ->
            configuredLabel?.takeIf { it.isNotBlank() } ?: "ShagrirCommissionExcelParser"
        CommissionImportSource.NONE -> configuredLabel
            ?: worksheetName
            ?: "UNKNOWN"
    }

    fun analyze(
        allReservations: List<Reservation>,
        supplierId: Long,
        supplierName: String?,
        cutoff: LocalDate,
        eligible: List<Reservation>,
        reportItems: List<CommissionReconciliationItem>
    ): Map<String, Any?> {
        val cutoffMillis = CommissionBusinessDates.toStartOfDayMillis(cutoff)
        val sameSupplier = allReservations.filter { it.supplierId == supplierId }
        val beforeCutoff = sameSupplier.filter { it.dateFrom < cutoffMillis }
        val afterCutoff = sameSupplier.filter { it.dateFrom >= cutoffMillis }
        val excludedStatus = sameSupplier.filter { it.status == ReservationStatus.Cancelled }
        val coverage = identifierCoverage(eligible)
        val unmatched = reportItems.filter {
            it.matchStatus == ReconciliationMatchStatus.SUPPLIER_ONLY.name
        }
        return linkedMapOf(
            "cutoffDate" to cutoff.toString(),
            "cutoffExclusive" to true,
            "cutoffRule" to "dateFrom < $cutoff (Reservation.dateFrom only; createdAt/updatedAt ignored)",
            "supplierId" to supplierId,
            "supplierName" to supplierName,
            "reservationPopulation" to linkedMapOf(
                "allReservations" to allReservations.size,
                "sameSupplier" to sameSupplier.size,
                "beforeCutoff" to beforeCutoff.size,
                "afterCutoff" to afterCutoff.size,
                "excludedStatusCancelled" to excludedStatus.size,
                "eligibleCandidateSlice" to eligible.size
            ),
            "identifierCoverage" to coverage,
            "candidateSlice" to eligible.map { reservationExport(it, supplierName) },
            "unmatchedDiagnosis" to unmatched.map { item ->
                diagnoseUnmatched(
                    orderNumber = item.supplierOrderNumber,
                    allReservations = allReservations,
                    supplierId = supplierId,
                    cutoffMillis = cutoffMillis,
                    eligible = eligible
                )
            }
        )
    }

    fun identifierCoverage(reservations: List<Reservation>): Map<String, Int> {
        val withOrder = reservations.count { !it.supplierOrderNumber.isNullOrBlank() }
        val withExternal = reservations.count { !it.externalContractNumber.isNullOrBlank() }
        return linkedMapOf(
            "withSupplierOrderNumber" to withOrder,
            "withoutSupplierOrderNumber" to (reservations.size - withOrder),
            "withExternalContractNumber" to withExternal,
            "withoutExternalContractNumber" to (reservations.size - withExternal)
        )
    }

    fun diagnoseUnmatched(
        orderNumber: String?,
        allReservations: List<Reservation>,
        supplierId: Long,
        cutoffMillis: Long,
        eligible: List<Reservation>
    ): Map<String, Any?> {
        val normalized = orderNumber?.let { RawCommissionReportRow.normalizeId(it) }.orEmpty()
        val emptyId = normalized.isBlank()
        val inEligibleByOrder = eligible.filter { identifierEquals(it.supplierOrderNumber, normalized) }
        val inEligibleByExternal = eligible.filter { identifierEquals(it.externalContractNumber, normalized) }
        val eligibleMatches = CommissionReconciliationService.listReservationMatches(
            orderNumber.orEmpty(),
            eligible
        )
        val anywhere = if (emptyId) emptyList() else allReservations.filter { res ->
            identifierEquals(res.supplierOrderNumber, normalized) ||
                identifierEquals(res.externalContractNumber, normalized)
        }
        val wrongSupplierHits = anywhere.filter { it.supplierId != supplierId }
        val afterCutoffHits = anywhere.filter {
            it.supplierId == supplierId && it.dateFrom >= cutoffMillis
        }
        val statusHits = anywhere.filter {
            it.supplierId == supplierId && it.status == ReservationStatus.Cancelled
        }
        val reason = when {
            emptyId -> REASON_IDENTIFIER_FIELD_EMPTY
            eligibleMatches.size > 1 -> REASON_MULTIPLE_EXACT_IDENTIFIER_MATCHES
            eligibleMatches.size == 1 -> REASON_CANDIDATE_FOUND
            anywhere.isEmpty() && eligible.isEmpty() -> REASON_NO_SUPPLIER_CANDIDATES
            anywhere.isEmpty() -> REASON_NO_IDENTIFIER_MATCH
            wrongSupplierHits.isNotEmpty() && wrongSupplierHits.size == anywhere.size ->
                REASON_ALL_CANDIDATES_WRONG_SUPPLIER
            afterCutoffHits.isNotEmpty() && afterCutoffHits.size == anywhere.size ->
                REASON_ALL_CANDIDATES_AFTER_CUTOFF
            statusHits.isNotEmpty() && statusHits.size == anywhere.size ->
                REASON_ALL_CANDIDATES_EXCLUDED_STATUS
            else -> REASON_NO_IDENTIFIER_MATCH
        }
        return linkedMapOf(
            "supplierOrderNumber" to orderNumber,
            "candidatePoolSize" to eligible.size,
            "supplierOrderExactMatches" to inEligibleByOrder.size,
            "externalContractExactMatches" to inEligibleByExternal.size,
            "otherIdentifierMatches" to 0,
            "sameSupplierCandidates" to anywhere.count { it.supplierId == supplierId },
            "excludedCandidates" to linkedMapOf(
                "wrongSupplier" to wrongSupplierHits.size,
                "afterCutoff" to afterCutoffHits.size,
                "status" to statusHits.size
            ),
            "reasonCode" to reason,
            "foundOutsideSliceReservationIds" to anywhere.map { it.id }
        )
    }

    fun reservationExport(reservation: Reservation, supplierName: String?): Map<String, Any?> =
        linkedMapOf(
            "reservationId" to reservation.id,
            "supplierId" to reservation.supplierId,
            "supplierName" to supplierName,
            "supplierOrderNumber" to reservation.supplierOrderNumber,
            "externalContractNumber" to reservation.externalContractNumber,
            "dateFrom" to CommissionBusinessDates.toLocalDate(reservation.dateFrom).toString(),
            "actualReturnDate" to reservation.actualReturnDate?.let {
                CommissionBusinessDates.toLocalDate(it).toString()
            },
            "rentalTypeDays" to reservation.periodTypeDays,
            "status" to reservation.status.name,
            "isClosed" to reservation.isClosed
        )

    private fun identifierEquals(raw: String?, normalized: String): Boolean {
        if (normalized.isBlank() || raw.isNullOrBlank()) return false
        return RawCommissionReportRow.normalizeId(raw) == normalized
    }
}
