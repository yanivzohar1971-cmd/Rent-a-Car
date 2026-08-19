package com.rentacar.app.commission

import com.rentacar.app.commission.domain.CommissionReportImportStatus
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.NormalizedSupplierGroup
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.commission.parser.CommissionReportImportDispatcher
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.SupplierCommissionImportConfig
import com.rentacar.app.data.SupplierCommissionReportImport
import com.rentacar.app.data.SupplierCommissionReportLine
import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.domain.CommissionBusinessDates
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import java.time.YearMonth

/**
 * Persistence façade for commission report reconciliation drafts and history.
 */
class CommissionReconciliationRepository(
    private val db: AppDatabase,
    private val dispatcher: CommissionReportImportDispatcher
) {
    fun observeImports(supplierId: Long, userUid: String): Flow<List<SupplierCommissionReportImport>> =
        db.supplierCommissionReportImportDao().observeForSupplier(supplierId, userUid)

    suspend fun getActiveConfig(supplierId: Long, userUid: String): SupplierCommissionImportConfig? =
        db.supplierCommissionImportConfigDao().getActiveForSupplier(supplierId, userUid)

    suspend fun saveConfig(
        supplierId: Long,
        parserCode: Int,
        parserVersion: Int,
        userUid: String
    ) {
        val existing = db.supplierCommissionImportConfigDao().getForSupplier(supplierId, userUid)
        val now = System.currentTimeMillis()
        db.supplierCommissionImportConfigDao().upsert(
            SupplierCommissionImportConfig(
                id = existing?.id ?: 0,
                supplierId = supplierId,
                parserCode = parserCode,
                parserVersion = parserVersion,
                isActive = true,
                createdAt = existing?.createdAt ?: now,
                updatedAt = now,
                userUid = userUid
            )
        )
    }

    suspend fun loadSupplier(supplierId: Long, userUid: String): Supplier? =
        db.supplierDao().getById(supplierId, userUid).first()

    suspend fun persistDraft(
        supplier: Supplier,
        reportYearMonth: YearMonth,
        departureCutoff: LocalDate,
        sourceFileName: String,
        fileHash: String,
        parseResult: CommissionReportParseResult,
        reconciliation: CommissionReconciliationService.Result,
        userUid: String
    ): Long {
        val importId = db.supplierCommissionReportImportDao().insert(
            SupplierCommissionReportImport(
                supplierId = supplier.id,
                reportYear = reportYearMonth.year,
                reportMonth = reportYearMonth.monthValue,
                departureCutoffDate = CommissionBusinessDates.toStartOfDayMillis(departureCutoff),
                sourceFileName = sourceFileName,
                fileHash = fileHash,
                parserCode = parseResult.parserCode,
                parserVersion = parseResult.parserVersion,
                rawRowCount = parseResult.rawRows.size,
                normalizedGroupCount = parseResult.normalizedGroups.size,
                supplierRevenueTotal = parseResult.normalizedSums.revenueExVat.toExactString(),
                supplierCommissionTotal = parseResult.normalizedSums.commissionAmount.toExactString(),
                internalCommissionTotal = reconciliation.kpis.internalCommissionTotal.toExactString(),
                deviationTotal = reconciliation.kpis.deviationTotal.toExactString(),
                status = CommissionReportImportStatus.DRAFT.name,
                userUid = userUid
            )
        )

        val lines = parseResult.rawRows.map { row ->
            toLineEntity(importId, row, userUid)
        }
        if (lines.isNotEmpty()) {
            db.supplierCommissionReportLineDao().insertAll(lines)
        }

        val items = (reconciliation.items + reconciliation.historicalCandidates).map {
            it.copy(importId = importId)
        }
        if (items.isNotEmpty()) {
            db.commissionReconciliationItemDao().insertAll(items)
        }
        return importId
    }

    suspend fun loadPersistedImport(
        importId: Long,
        userUid: String
    ): PersistedReconciliation? {
        val header = db.supplierCommissionReportImportDao().getById(importId, userUid) ?: return null
        val lines = db.supplierCommissionReportLineDao().getForImport(importId, userUid)
        val items = db.commissionReconciliationItemDao().getForImport(importId, userUid)
        return PersistedReconciliation(header, lines, items)
    }

    suspend fun markReviewed(importId: Long, userUid: String) {
        val header = db.supplierCommissionReportImportDao().getById(importId, userUid) ?: return
        db.supplierCommissionReportImportDao().update(
            header.copy(status = CommissionReportImportStatus.REVIEWED.name)
        )
    }

    suspend fun markApproved(importId: Long, userUid: String) {
        val header = db.supplierCommissionReportImportDao().getById(importId, userUid) ?: return
        db.supplierCommissionReportImportDao().update(
            header.copy(
                status = CommissionReportImportStatus.APPROVED.name,
                approvedAt = System.currentTimeMillis()
            )
        )
    }

    suspend fun buildReconciliationInput(
        supplier: Supplier,
        reportYearMonth: YearMonth,
        departureCutoff: LocalDate,
        groups: List<NormalizedSupplierGroup>,
        userUid: String
    ): CommissionReconciliationService.Input {
        val reservations = db.reservationDao().getAll(userUid).first()
        val candidates = CommissionReconciliationService.sliceCandidates(
            reservations = reservations,
            supplierId = supplier.id,
            departureCutoffExclusive = departureCutoff
        )
        val customerIds = candidates.map { it.customerId }.toSet()
        val customers = customerIds.mapNotNull { id ->
            db.customerDao().getById(id, userUid).first()?.let { id to it }
        }.toMap()

        val terms = SupplierCommissionTerms.fromSupplier(
            supplier.commissionDays1to6,
            supplier.commissionDays7to23,
            supplier.commissionDays24plus
        )
        val settled = db.commissionSettlementEventDao().getForSupplier(supplier.id, userUid)
        val overrides = db.commissionTrackingOverrideDao().getForSupplier(supplier.id, userUid)

        return CommissionReconciliationService.Input(
            supplier = supplier,
            reportYear = reportYearMonth.year,
            reportMonth = reportYearMonth.monthValue,
            departureCutoff = departureCutoff,
            normalizedGroups = groups,
            candidateReservations = candidates,
            allReservationsForDiagnostics = reservations,
            customersById = customers,
            terms = terms,
            settledEvents = settled,
            trackingOverrides = overrides,
            userUid = userUid
        )
    }

    private fun toLineEntity(
        importId: Long,
        row: RawCommissionReportRow,
        userUid: String
    ) = SupplierCommissionReportLine(
        importId = importId,
        sourceRowNumber = row.sourceRowNumber,
        orderNumber = row.orderNumber,
        invoiceNumber = row.invoiceNumber,
        totalDays = row.totalDays,
        customerName = row.customerName,
        revenueExVat = row.revenueExVat.toExactString(),
        commissionPercent = row.commissionPercent.toExactString(),
        commissionAmount = row.commissionAmount.toExactString(),
        agentName = row.agentName,
        normalizedGroupKey = row.normalizedGroupKey,
        rowHash = row.rowHash,
        userUid = userUid
    )

    data class PersistedReconciliation(
        val header: SupplierCommissionReportImport,
        val lines: List<SupplierCommissionReportLine>,
        val items: List<CommissionReconciliationItem>
    )
}
