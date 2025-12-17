package com.rentacar.app.domain

import kotlin.math.ceil

data class CommissionResult(
    val percent: Double,
    val amount: Double
)

object CommissionCalculator {
    // Rules per spec
    // Daily: 1–6 days → 15%
    // Weekly: 7–23 days → 10%
    // Monthly: 24+ days → 7%
    // Ongoing monthly: additional 7% per extra month (pro-rata)
    fun calculate(days: Int, price: Double): CommissionResult {
        require(days > 0) { "days must be positive" }
        require(price >= 0) { "price cannot be negative" }

        val percent = when {
            days <= 6 -> 0.15
            days <= 23 -> 0.10
            else -> 0.07
        }

        var commission = price * percent

        if (days > 30) {
            val extraDays = days - 30
            val extraMonths = extraDays / 30.0
            commission += price * 0.07 * extraMonths
        }

        return CommissionResult(percent = percent, amount = commission)
    }
}


