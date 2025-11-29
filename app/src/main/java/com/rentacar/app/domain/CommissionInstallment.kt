package com.rentacar.app.domain

import java.time.YearMonth

/**
 * Represents a single commission installment unit.
 * 
 * For non-monthly rentals: one installment per order.
 * For monthly rentals: one installment per completed 30-day period.
 */
data class CommissionInstallment(
    val id: String, // Unique ID for this installment
    val orderId: Long,
    val isMonthlyRental: Boolean,
    val periodStart: Long, // Timestamp
    val periodEnd: Long, // Timestamp
    val payoutMonth: String, // Format: "YYYY-MM" (e.g., "2024-12")
    val amount: Double,
    val status: CommissionStatus = CommissionStatus.UNPAID,
    val paidAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
) {
    companion object {
        fun generateId(orderId: Long, periodStart: Long, periodEnd: Long): String {
            return "${orderId}_${periodStart}_${periodEnd}"
        }
    }
}

enum class CommissionStatus {
    UNPAID,
    PAID,
    HOLD
}

