package com.rentacar.app.data

/**
 * Pure calculation / validation for car-sale commission payments.
 * [CarSale.commissionPrice] is the authoritative total; remaining is never persisted.
 */
object CarSaleCommissionPaymentLogic {

    const val MONEY_EPS = 0.0001

    enum class PaymentStatus {
        NO_COMMISSION,
        UNPAID,
        PARTIAL,
        PAID
    }

    /**
     * Sales Management commission-collection filter (UI only; not persisted).
     * Distinct from [PaymentStatus]: OPEN covers both UNPAID and PARTIAL.
     */
    enum class CommissionCollectionFilter {
        ALL,
        OPEN,
        CLOSED
    }

    data class Totals(
        val totalPaid: Double,
        val remaining: Double,
        val fullyPaid: Boolean
    )

    sealed class ValidationResult {
        data object Ok : ValidationResult()
        data class Error(val messageHe: String) : ValidationResult()
    }

    fun totalPaid(amounts: Iterable<Double>): Double =
        amounts.sum().coerceAtLeast(0.0)

    fun remaining(commissionPrice: Double, totalPaid: Double): Double =
        (commissionPrice - totalPaid.coerceAtLeast(0.0)).coerceAtLeast(0.0)

    /**
     * Derived payment-collection status for Sales Management.
     * Uses [MONEY_EPS] so tiny floating-point overshoots still count as PAID.
     */
    fun paymentStatus(commissionPrice: Double, totalPaid: Double): PaymentStatus {
        if (commissionPrice <= 0.0) return PaymentStatus.NO_COMMISSION
        val paid = totalPaid.coerceAtLeast(0.0)
        if (paid <= 0.0) return PaymentStatus.UNPAID
        if (paid >= commissionPrice - MONEY_EPS) return PaymentStatus.PAID
        return PaymentStatus.PARTIAL
    }

    fun accessibilityLabelHe(status: PaymentStatus): String =
        when (status) {
            PaymentStatus.NO_COMMISSION -> "ללא עמלה"
            PaymentStatus.UNPAID -> "עמלה לא שולמה"
            PaymentStatus.PARTIAL -> "עמלה שולמה חלקית"
            PaymentStatus.PAID -> "עמלה שולמה במלואה"
        }

    /**
     * Commission collection filter for Sales Management.
     * OPEN = UNPAID or PARTIAL; CLOSED = PAID; NO_COMMISSION only matches ALL.
     */
    fun matchesCommissionFilter(
        filter: CommissionCollectionFilter,
        commissionPrice: Double,
        totalPaid: Double
    ): Boolean {
        return when (filter) {
            CommissionCollectionFilter.ALL -> true
            CommissionCollectionFilter.OPEN -> {
                val status = paymentStatus(commissionPrice, totalPaid)
                status == PaymentStatus.UNPAID || status == PaymentStatus.PARTIAL
            }
            CommissionCollectionFilter.CLOSED ->
                paymentStatus(commissionPrice, totalPaid) == PaymentStatus.PAID
        }
    }

    fun totals(commissionPrice: Double, paymentAmounts: Iterable<Double>): Totals {
        val paid = totalPaid(paymentAmounts)
        val rem = remaining(commissionPrice, paid)
        val fullyPaid = commissionPrice > 0.0 && paid >= commissionPrice - MONEY_EPS
        return Totals(totalPaid = paid, remaining = rem, fullyPaid = fullyPaid)
    }

    fun validatePaymentAmount(
        amount: Double?,
        commissionPrice: Double,
        alreadyPaidExcludingThis: Double
    ): ValidationResult {
        if (amount == null) {
            return ValidationResult.Error("יש להזין סכום ששולם")
        }
        if (amount <= 0.0) {
            return ValidationResult.Error("סכום התשלום חייב להיות גדול מאפס")
        }
        if (commissionPrice <= 0.0) {
            return ValidationResult.Error("אין עמלה לתשלום")
        }
        val rem = (commissionPrice - alreadyPaidExcludingThis).coerceAtLeast(0.0)
        if (amount > rem + MONEY_EPS) {
            return ValidationResult.Error("סכום התשלום גדול מהיתרה לתשלום")
        }
        return ValidationResult.Ok
    }

    fun validatePaymentDate(paymentDate: Long?): ValidationResult {
        if (paymentDate == null || paymentDate <= 0L) {
            return ValidationResult.Error("יש לבחור תאריך תשלום")
        }
        return ValidationResult.Ok
    }

    /**
     * Blocks lowering total commission below already-recorded payments.
     */
    fun validateCommissionAgainstPaid(
        newCommissionPrice: Double?,
        totalPaid: Double
    ): ValidationResult {
        if (newCommissionPrice == null || newCommissionPrice < 0.0) {
            return ValidationResult.Error("יש להזין סכום עמלה תקין")
        }
        if (totalPaid > newCommissionPrice + MONEY_EPS) {
            return ValidationResult.Error(
                "לא ניתן להקטין את העמלה מתחת לסכום שכבר שולם (₪${formatAmount(totalPaid)}). " +
                    "יש לתקן או למחוק תשלומים קיימים תחילה."
            )
        }
        return ValidationResult.Ok
    }

    fun validatePaymentsDoNotExceedCommission(
        commissionPrice: Double,
        paymentAmounts: Iterable<Double>
    ): ValidationResult {
        val paid = totalPaid(paymentAmounts)
        if (paid > commissionPrice + MONEY_EPS) {
            return ValidationResult.Error("סך תשלומי העמלה גדול מסכום העמלה")
        }
        return ValidationResult.Ok
    }

    fun formatAmount(value: Double): String {
        return if (value == value.toLong().toDouble()) {
            value.toLong().toString()
        } else {
            String.format("%.2f", value)
        }
    }
}
