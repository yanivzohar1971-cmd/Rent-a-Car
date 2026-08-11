package com.rentacar.app.commission.domain

import java.time.LocalDate

/**
 * Stable settlement ledger keys — survive app restart/recalculation.
 */
object CommissionSettlementIds {

    fun monthlyCycle(
        reservationId: Long,
        cycleStart: LocalDate,
        cycleEnd: LocalDate
    ): String = "${reservationId}_${cycleStart}_${cycleEnd}_MONTHLY_CYCLE"

    fun finalRemainder(
        reservationId: Long,
        remainderStart: LocalDate,
        actualReturnDate: LocalDate
    ): String = "${reservationId}_${remainderStart}_${actualReturnDate}_FINAL_REMAINDER"

    fun finalRental(
        reservationId: Long,
        dateFrom: LocalDate,
        actualReturnDate: LocalDate
    ): String = "${reservationId}_${dateFrom}_${actualReturnDate}_FINAL_RENTAL"
}
