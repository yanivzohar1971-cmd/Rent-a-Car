package com.rentacar.app.commission.presentation

import com.rentacar.app.commission.money.MoneyDecimal
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

/**
 * Shared money / percent display formatting for reconciliation UI and Excel.
 * Never surface raw Double binary artifacts (e.g. 7.000000000000001%).
 */
object FinancialDisplayFormatter {

    private val heIl = Locale("he", "IL")

    private val moneyNumberFormat: NumberFormat = NumberFormat.getNumberInstance(heIl).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
        isGroupingUsed = true
    }

    fun formatMoney(amount: MoneyDecimal): String =
        "₪${moneyNumberFormat.format(amount.toDisplayBigDecimal())}"

    fun formatMoney(text: String?): String {
        val md = MoneyDecimal.ofNullable(text) ?: return "—"
        return formatMoney(md)
    }

    fun formatMoneyOrEmpty(amount: MoneyDecimal?): String =
        amount?.let { formatMoney(it) }.orEmpty()

    fun formatPercent(value: BigDecimal): String {
        val normalized = value.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros()
        return normalized.toPlainString() + "%"
    }

    fun formatPercent(text: String?): String {
        val md = MoneyDecimal.ofNullable(text) ?: return "—"
        return formatPercent(md.value)
    }

    fun formatPercent(value: Double): String = formatPercent(BigDecimal.valueOf(value))
}
