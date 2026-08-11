package com.rentacar.app.commission.domain

import java.time.LocalDate

/**
 * Classifies supplier-reported rental days into lifecycle meaning for Shagrir-like reports.
 */
object CommissionLifecycleClassifier {

    fun classify(totalDays: Int?): CommissionLifecycleClassification {
        if (totalDays == null || totalDays <= 0) return CommissionLifecycleClassification.NEEDS_REVIEW
        return when {
            totalDays < 30 -> CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT
            totalDays == 30 -> CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE
            totalDays > 30 && totalDays % 30 == 0 -> CommissionLifecycleClassification.NEEDS_REVIEW
            else -> CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT
        }
    }

    /**
     * Proposed actual return date = dateFrom + totalDays - 1 calendar days.
     * Null for open 30-day cycles and for ambiguous multiples.
     */
    fun proposedActualReturnDate(
        dateFrom: LocalDate,
        totalDays: Int,
        classification: CommissionLifecycleClassification
    ): LocalDate? = when (classification) {
        CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE -> null
        CommissionLifecycleClassification.NEEDS_REVIEW,
        CommissionLifecycleClassification.AMBIGUOUS,
        CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE -> null
        CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT,
        CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT ->
            dateFrom.plusDays((totalDays - 1).toLong())
    }

    fun fullCyclesAndRemainder(totalDays: Int): Pair<Int, Int> {
        val full = totalDays / 30
        val remainder = totalDays % 30
        return full to remainder
    }
}
