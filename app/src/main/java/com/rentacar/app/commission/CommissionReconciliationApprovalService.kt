package com.rentacar.app.commission

import androidx.room.withTransaction
import com.rentacar.app.commission.domain.CommissionEventType
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.CommissionSettlementIds
import com.rentacar.app.commission.domain.ReconciliationApprovalState
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.domain.SettlementEventStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.CommissionSettlementEvent
import com.rentacar.app.data.CommissionTrackingOverride
import com.rentacar.app.domain.CommissionBusinessDates
import kotlinx.coroutines.flow.first
import java.time.LocalDate
import java.time.YearMonth

/**
 * Atomic approval writes for commission reconciliation.
 * All mutations run inside a single Room transaction.
 */
class CommissionReconciliationApprovalService(
    private val db: AppDatabase
) {
    data class ApprovalRequest(
        val itemIds: List<Long>,
        val importId: Long,
        val userUid: String,
        val allowReturnDateOverwrite: Boolean = false,
        val historicalCapDate: LocalDate? = null,
        val historicalReason: String? = null
    )

    data class ApprovalResult(
        val success: Boolean,
        val approvedCount: Int = 0,
        val skippedCount: Int = 0,
        val errors: List<String> = emptyList(),
        val warnings: List<String> = emptyList()
    )

    suspend fun approveSelected(request: ApprovalRequest): ApprovalResult {
        val errors = mutableListOf<String>()
        val warnings = mutableListOf<String>()
        var approved = 0
        var skipped = 0

        return try {
            db.withTransaction {
                val itemDao = db.commissionReconciliationItemDao()
                val settlementDao = db.commissionSettlementEventDao()
                val overrideDao = db.commissionTrackingOverrideDao()
                val reservationDao = db.reservationDao()
                val importDao = db.supplierCommissionReportImportDao()

                val import = importDao.getById(request.importId, request.userUid)

                for (itemId in request.itemIds) {
                    val item = itemDao.getById(itemId, request.userUid)
                    if (item == null) {
                        skipped++
                        errors += "פריט $itemId לא נמצא"
                        continue
                    }
                    if (item.approvalState == ReconciliationApprovalState.APPROVED.name) {
                        skipped++
                        continue
                    }

                    val isHistorical =
                        item.lifecycleClassification ==
                            CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name

                    if (!isHistorical && !isSafeForApproval(item)) {
                        skipped++
                        warnings += "פריט $itemId אינו בטוח לאישור אוטומטי (${item.matchStatus})"
                        continue
                    }

                    when (item.lifecycleClassification) {
                        CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name -> {
                            val reservationId = item.reservationId
                            if (reservationId == null) {
                                skipped++
                                errors += "פריט היסטורי ללא הזמנה"
                                continue
                            }
                            val effectiveCap = request.historicalCapDate
                                ?: import?.let {
                                    CommissionBusinessDates.toLocalDate(it.departureCutoffDate)
                                        .minusDays(1)
                                }
                            if (effectiveCap == null) {
                                skipped++
                                errors += "חסר תאריך תקרת עמלה"
                                continue
                            }

                            // Do NOT invent actualReturnDate
                            overrideDao.upsert(
                                CommissionTrackingOverride(
                                    reservationId = reservationId,
                                    supplierId = item.supplierId,
                                    commissionCapDate = CommissionBusinessDates.toStartOfDayMillis(effectiveCap),
                                    reason = request.historicalReason
                                        ?: "בסיס היסטורי — אינו מופיע בדוח ספק",
                                    sourceImportId = request.importId,
                                    approvedAt = System.currentTimeMillis(),
                                    userUid = request.userUid
                                )
                            )
                            itemDao.update(
                                item.copy(
                                    approvalState = ReconciliationApprovalState.APPROVED.name,
                                    approvedAt = System.currentTimeMillis(),
                                    notes = listOfNotNull(item.notes, "baseline cap=$effectiveCap")
                                        .joinToString(" | ")
                                )
                            )
                            approved++
                        }

                        CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name -> {
                            if (item.reservationId == null) {
                                skipped++
                                errors += "חסר reservationId"
                                continue
                            }
                            // Keep reservation open — no actualReturnDate / isClosed
                            if (!insertSettlementIfNeeded(item, request)) {
                                skipped++
                                warnings += "אירוע סליקה כבר קיים עבור פריט $itemId"
                                continue
                            }
                            itemDao.update(
                                item.copy(
                                    approvalState = ReconciliationApprovalState.APPROVED.name,
                                    approvedAt = System.currentTimeMillis()
                                )
                            )
                            approved++
                        }

                        CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name,
                        CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT.name -> {
                            val reservationId = item.reservationId
                            if (reservationId == null) {
                                skipped++
                                errors += "חסר reservationId"
                                continue
                            }
                            val reservation = reservationDao.getById(reservationId, request.userUid).first()
                            if (reservation == null) {
                                skipped++
                                errors += "הזמנה לא נמצאה"
                                continue
                            }

                            val proposed = item.proposedActualReturnDate
                            if (proposed != null) {
                                val existing = reservation.actualReturnDate
                                when {
                                    existing == null -> {
                                        reservationDao.update(
                                            reservation.copy(
                                                actualReturnDate = proposed,
                                                isClosed = true,
                                                updatedAt = System.currentTimeMillis()
                                            )
                                        )
                                    }
                                    existing == proposed -> {
                                        if (!reservation.isClosed) {
                                            reservationDao.update(
                                                reservation.copy(
                                                    isClosed = true,
                                                    updatedAt = System.currentTimeMillis()
                                                )
                                            )
                                        }
                                    }
                                    else -> {
                                        if (!request.allowReturnDateOverwrite) {
                                            skipped++
                                            errors += "התנגשות תאריך החזרה בהזמנה $reservationId"
                                            continue
                                        }
                                    }
                                }
                            }

                            if (!insertSettlementIfNeeded(item, request)) {
                                skipped++
                                warnings += "אירוע סליקה כבר קיים עבור פריט $itemId"
                                continue
                            }
                            itemDao.update(
                                item.copy(
                                    approvalState = ReconciliationApprovalState.APPROVED.name,
                                    approvedAt = System.currentTimeMillis()
                                )
                            )
                            approved++
                        }

                        else -> {
                            skipped++
                            warnings += "סיווג מחזור חיים לא נתמך לאישור: ${item.lifecycleClassification}"
                        }
                    }
                }

                ApprovalResult(
                    success = errors.isEmpty(),
                    approvedCount = approved,
                    skippedCount = skipped,
                    errors = errors.toList(),
                    warnings = warnings.toList()
                )
            }
        } catch (e: Exception) {
            ApprovalResult(
                success = false,
                approvedCount = 0,
                skippedCount = skipped,
                errors = errors + listOf("העסקה נכשלה: ${e.message ?: "שגיאה"}"),
                warnings = warnings
            )
        }
    }

    private suspend fun insertSettlementIfNeeded(
        item: CommissionReconciliationItem,
        request: ApprovalRequest
    ): Boolean {
        val settlementDao = db.commissionSettlementEventDao()
        val reservationId = item.reservationId ?: return false
        val periodStart = item.internalPeriodStart ?: return false
        val periodEnd = item.internalPeriodEnd ?: return false
        val start = CommissionBusinessDates.toLocalDate(periodStart)
        val end = CommissionBusinessDates.toLocalDate(periodEnd)
        val eventType = item.eventType ?: CommissionEventType.FINAL_RENTAL.name
        val stableId = when (eventType) {
            CommissionEventType.MONTHLY_CYCLE.name ->
                CommissionSettlementIds.monthlyCycle(reservationId, start, end)
            CommissionEventType.FINAL_REMAINDER.name ->
                CommissionSettlementIds.finalRemainder(reservationId, start, end)
            else ->
                CommissionSettlementIds.finalRental(reservationId, start, end)
        }
        if (settlementDao.existsApproved(stableId, request.userUid)) {
            return false
        }
        val payout = YearMonth.from(end).plusMonths(1)
        settlementDao.insert(
            CommissionSettlementEvent(
                stableId = stableId,
                reservationId = reservationId,
                supplierId = item.supplierId,
                importId = request.importId,
                reconciliationItemId = item.id,
                eventType = eventType,
                periodStart = periodStart,
                periodEnd = periodEnd,
                numberOfDays = item.internalDays ?: 0,
                payoutYear = payout.year,
                payoutMonth = payout.monthValue,
                supplierAmount = item.supplierCommission ?: MoneyDecimal.ZERO.toExactString(),
                internalAmount = item.internalCommission ?: MoneyDecimal.ZERO.toExactString(),
                status = SettlementEventStatus.APPROVED.name,
                approvedAt = System.currentTimeMillis(),
                userUid = request.userUid
            )
        )
        return true
    }

    fun isSafeForApproval(item: CommissionReconciliationItem): Boolean =
        Companion.isSafeForApproval(item)

    fun filterSafeBulk(items: List<CommissionReconciliationItem>): List<CommissionReconciliationItem> =
        items.filter { isSafeForApproval(it) }

    companion object {
        fun isSafeForApproval(item: CommissionReconciliationItem): Boolean {
            if (item.approvalState == ReconciliationApprovalState.APPROVED.name) return false
            if (item.lifecycleClassification == CommissionLifecycleClassification.AMBIGUOUS.name ||
                item.lifecycleClassification == CommissionLifecycleClassification.NEEDS_REVIEW.name
            ) {
                return false
            }
            return when (item.matchStatus) {
                ReconciliationMatchStatus.FULL_MATCH.name,
                ReconciliationMatchStatus.CUSTOMER_NAME_WARNING.name -> true
                else -> false
            }
        }

        fun filterSafeBulk(items: List<CommissionReconciliationItem>): List<CommissionReconciliationItem> =
            items.filter { isSafeForApproval(it) }
    }
}
