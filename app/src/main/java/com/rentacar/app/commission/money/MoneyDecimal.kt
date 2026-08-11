package com.rentacar.app.commission.money

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Lossless monetary/percentage value for commission reconciliation.
 * Persist via [toExactString]; display via [toDisplayString].
 */
data class MoneyDecimal private constructor(val value: BigDecimal) : Comparable<MoneyDecimal> {

    fun toExactString(): String = value.stripTrailingZeros().toPlainString()

    fun toDisplayString(scale: Int = DISPLAY_SCALE): String =
        value.setScale(scale, RoundingMode.HALF_UP).toPlainString()

    fun toDisplayBigDecimal(scale: Int = DISPLAY_SCALE): BigDecimal =
        value.setScale(scale, RoundingMode.HALF_UP)

    fun abs(): MoneyDecimal = MoneyDecimal(value.abs())

    fun plus(other: MoneyDecimal): MoneyDecimal = MoneyDecimal(value.add(other.value))

    fun minus(other: MoneyDecimal): MoneyDecimal = MoneyDecimal(value.subtract(other.value))

    fun times(other: MoneyDecimal): MoneyDecimal = MoneyDecimal(value.multiply(other.value))

    fun times(factor: Int): MoneyDecimal = MoneyDecimal(value.multiply(BigDecimal.valueOf(factor.toLong())))

    fun divide(divisor: Int, scale: Int = INTERNAL_SCALE): MoneyDecimal {
        require(divisor != 0)
        return MoneyDecimal(
            value.divide(BigDecimal.valueOf(divisor.toLong()), scale, RoundingMode.HALF_UP)
        )
    }

    fun percentOf(base: MoneyDecimal): MoneyDecimal =
        MoneyDecimal(
            base.value.multiply(value)
                .divide(BigDecimal("100"), INTERNAL_SCALE, RoundingMode.HALF_UP)
        )

    fun matchesWithinTolerance(
        other: MoneyDecimal,
        tolerance: MoneyDecimal = DEFAULT_TOLERANCE
    ): Boolean = absDeviation(other) <= tolerance

    fun absDeviation(other: MoneyDecimal): MoneyDecimal =
        MoneyDecimal(value.subtract(other.value).abs())

    override fun compareTo(other: MoneyDecimal): Int = value.compareTo(other.value)

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MoneyDecimal) return false
        return value.compareTo(other.value) == 0
    }

    override fun hashCode(): Int = value.stripTrailingZeros().hashCode()

    companion object {
        const val DISPLAY_SCALE = 2
        const val INTERNAL_SCALE = 10
        val ZERO: MoneyDecimal = MoneyDecimal(BigDecimal.ZERO)
        val DEFAULT_TOLERANCE: MoneyDecimal = of("0.01")

        fun of(text: String): MoneyDecimal {
            val normalized = text.trim()
                .replace(",", "")
                .replace("%", "")
                .replace("\u00A0", "")
                .replace("₪", "")
            require(normalized.isNotEmpty()) { "empty money text" }
            return MoneyDecimal(BigDecimal(normalized))
        }

        fun of(value: BigDecimal): MoneyDecimal = MoneyDecimal(value)

        fun of(value: Long): MoneyDecimal = MoneyDecimal(BigDecimal.valueOf(value))

        fun ofNullable(text: String?): MoneyDecimal? =
            text?.takeIf { it.isNotBlank() }?.let { of(it) }

        /** Prefer exact text; use only when bridging legacy Double domain values. */
        fun fromLegacyDouble(value: Double): MoneyDecimal =
            MoneyDecimal(BigDecimal.valueOf(value))
    }
}
