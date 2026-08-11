package com.rentacar.app.domain

import com.rentacar.app.commission.domain.SupplierCommissionTerms

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
    //
    // Prefer overloads that accept [SupplierCommissionTerms] for reconciliation.
    // Legacy path keeps hardcoded defaults for existing screens/exporters.
    fun calculate(days: Int, price: Double): CommissionResult =
        calculate(days = days, price = price, terms = null, forcePercent = null)

    fun calculate(
        days: Int,
        price: Double,
        terms: SupplierCommissionTerms?,
        forcePercent: Double? = null
    ): CommissionResult {
        require(days > 0) { "days must be positive" }
        require(price >= 0) { "price cannot be negative" }

        val percent = when {
            forcePercent != null -> forcePercent
            terms != null -> terms.percentForDays(days) / 100.0
            days <= 6 -> 0.15
            days <= 23 -> 0.10
            else -> 0.07
        }

        var commission = price * percent

        if (days > 30 && forcePercent == null) {
            val extraDays = days - 30
            val extraMonths = extraDays / 30.0
            val monthlyRate = terms?.let { it.days24plusPercent / 100.0 } ?: 0.07
            commission += price * monthlyRate * extraMonths
        }

        return CommissionResult(percent = percent, amount = commission)
    }
}
