package com.rentacar.app.domain

import java.time.LocalDate
import java.time.YearMonth

/**
 * Represents a single commission installment unit.
 *
 * Period boundaries are business [LocalDate] values. [periodStart] and [periodEnd] are stored
 * as start-of-day epoch millis for UI/export compatibility only.
 */
/**
 * In-memory commission event. Optional metadata fields are not persisted in Room;
 * they support reconciliation without changing existing installment consumers.
 */
data class CommissionInstallment(
    val id: String,
    val orderId: Long,
    val isMonthlyRental: Boolean,
    val periodStart: Long,
    val periodEnd: Long,
    val payoutMonth: String,
    val amount: Double,
    val status: CommissionStatus = CommissionStatus.UNPAID,
    val paidAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    /** In-memory only — MONTHLY_CYCLE / FINAL_REMAINDER / FINAL_RENTAL */
    val eventType: String? = null,
    /** In-memory only */
    val numberOfDays: Int? = null,
    /** In-memory only — percent points e.g. 7.0 for 7% */
    val commissionPercent: Double? = null,
    /** In-memory only — 1-based monthly cycle index when applicable */
    val cycleNumber: Int? = null
) {
    companion object {
        /**
         * Stable business key: `{reservationId}_{cycleStart}_{cycleEnd}` using ISO-8601 dates.
         * No timestamps or timezone offsets appear in the identifier.
         */
        fun generateId(orderId: Long, cycleStart: LocalDate, cycleEnd: LocalDate): String =
            "${orderId}_${cycleStart}_${cycleEnd}"
    }
}

enum class CommissionStatus {
    UNPAID,
    PAID,
    HOLD
}
