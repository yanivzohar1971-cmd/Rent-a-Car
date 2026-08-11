package com.rentacar.app.data

import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Pure helpers for historical commission-payment alignment ("יישור קו עמלות").
 * Does not mutate data; callers persist generated payments.
 */
object CarSaleCommissionAlignmentLogic {

    data class SaleAlignmentInput(
        val carSaleId: Long,
        val commissionPrice: Double,
        val totalPaid: Double,
        val saleDate: Long
    )

    data class AlignmentPaymentPlan(
        val carSaleId: Long,
        val amount: Double,
        val paymentDate: Long
    )

    data class AlignmentPreview(
        val plans: List<AlignmentPaymentPlan>,
        val saleCount: Int,
        val totalAmount: Double
    ) {
        val hasWork: Boolean get() = plans.isNotEmpty()
    }

    /** Business timezone for "today" fallback. */
    val BUSINESS_ZONE: ZoneId = ZoneId.of("Asia/Jerusalem")

    fun remaining(commissionPrice: Double, totalPaid: Double): Double =
        CarSaleCommissionPaymentLogic.remaining(commissionPrice, totalPaid)

    /**
     * Amount that must be inserted to reach fully-paid (0 if already aligned / no commission).
     */
    fun alignmentAmount(commissionPrice: Double, totalPaid: Double): Double {
        if (commissionPrice <= 0.0) return 0.0
        val paid = totalPaid.coerceAtLeast(0.0)
        if (paid >= commissionPrice - CarSaleCommissionPaymentLogic.MONEY_EPS) return 0.0
        return (commissionPrice - paid).coerceAtLeast(0.0)
    }

    /**
     * Payment date: prefer valid [saleDate]; otherwise start of today in [BUSINESS_ZONE].
     */
    fun resolvePaymentDate(saleDate: Long, nowMillis: Long = System.currentTimeMillis()): Long {
        return if (saleDate > 0L) saleDate else startOfTodayMillis(nowMillis)
    }

    fun startOfTodayMillis(nowMillis: Long = System.currentTimeMillis()): Long {
        val zdt = ZonedDateTime.ofInstant(
            java.time.Instant.ofEpochMilli(nowMillis),
            BUSINESS_ZONE
        )
        return zdt.toLocalDate().atStartOfDay(BUSINESS_ZONE).toInstant().toEpochMilli()
    }

    fun buildPreview(
        sales: List<SaleAlignmentInput>,
        nowMillis: Long = System.currentTimeMillis()
    ): AlignmentPreview {
        val plans = sales.mapNotNull { sale ->
            val amount = alignmentAmount(sale.commissionPrice, sale.totalPaid)
            if (amount <= CarSaleCommissionPaymentLogic.MONEY_EPS) null
            else AlignmentPaymentPlan(
                carSaleId = sale.carSaleId,
                amount = amount,
                paymentDate = resolvePaymentDate(sale.saleDate, nowMillis)
            )
        }
        return AlignmentPreview(
            plans = plans,
            saleCount = plans.size,
            totalAmount = plans.sumOf { it.amount }
        )
    }
}
