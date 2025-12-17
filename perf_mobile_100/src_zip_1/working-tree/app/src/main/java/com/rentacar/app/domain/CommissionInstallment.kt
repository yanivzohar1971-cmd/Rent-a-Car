package com.rentacar.app.domain

import java.time.YearMonth

/**
 * Represents a single commission installment unit.
 * 
 * Each installment represents one commission payment for a specific order and period:
 * - For non-monthly rentals: one installment per order (when order starts and closes in same month).
 * - For monthly rentals: one installment per completed 30-day period.
 * 
 * The installment includes the order reference (orderId), period dates (periodStart, periodEnd),
 * payout month (when commission is paid), and the calculated commission amount.
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

