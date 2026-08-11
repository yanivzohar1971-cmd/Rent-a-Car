package com.rentacar.app.commission.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class CommissionLifecycleClassifierTest {

    @Test
    fun exact30_openMonthlyCycle() {
        assertEquals(
            CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE,
            CommissionLifecycleClassifier.classify(30)
        )
        assertNull(
            CommissionLifecycleClassifier.proposedActualReturnDate(
                LocalDate.of(2026, 1, 1), 30,
                CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE
            )
        )
    }

    @Test
    fun days43_finalMonthly_proposedReturn() {
        assertEquals(
            CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT,
            CommissionLifecycleClassifier.classify(43)
        )
        val proposed = CommissionLifecycleClassifier.proposedActualReturnDate(
            LocalDate.of(2026, 1, 1),
            43,
            CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT
        )
        assertEquals(LocalDate.of(2026, 2, 12), proposed) // +42 days
        assertEquals(1 to 13, CommissionLifecycleClassifier.fullCyclesAndRemainder(43))
    }

    @Test
    fun days60_needsReview() {
        assertEquals(
            CommissionLifecycleClassification.NEEDS_REVIEW,
            CommissionLifecycleClassifier.classify(60)
        )
    }

    @Test
    fun days24to29_dailyWeeklyFinal() {
        assertEquals(
            CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT,
            CommissionLifecycleClassifier.classify(25)
        )
    }
}
