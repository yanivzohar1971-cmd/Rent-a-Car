package com.rentacar.app.commission.presentation

import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.SupplierPriceListItem
import java.math.BigDecimal
import java.math.RoundingMode

enum class TariffBasisKind {
    DAILY,
    WEEKLY,
    MONTHLY,
    MIXED_UNPROVEN,
    UNKNOWN
}

enum class PriceSourceKind {
    RESERVATION_AGREED_PRICE,
    PRICE_LIST_HISTORICAL_PERIOD,
    PRICE_LIST_CURRENT_ESTIMATE,
    MISSING
}

/**
 * Diagnostic pricing/revenue layer for reconciliation cards and Excel.
 * Does not alter commission formulas — explains the rental-income basis.
 */
data class RentalPricingPresentation(
    val supplierRevenueExVat: MoneyDecimal?,
    val applicationRentalRevenueExVat: MoneyDecimal?,
    val revenueDifference: MoneyDecimal?,
    val tariffBasis: TariffBasisKind,
    val tariffBasisHebrew: String,
    val unitPriceLabelHebrew: String,
    val unitPriceFormatted: String?,
    val monthlyPriceFormatted: String?,
    val weeklyPriceFormatted: String?,
    val dailyPriceFormatted: String?,
    val chargedUnitsLabelHebrew: String,
    val applicationCommissionPercentFormatted: String?,
    val priceSource: PriceSourceKind,
    val priceSourceHebrew: String,
    val priceWarningHebrew: String?,
    val tariffTransitionHebrew: String?,
    val pricingNeedsReview: Boolean,
    val explanationHebrew: String
)

object RentalPricingMapper {

    fun build(
        supplierRevenueExVatText: String?,
        reservation: Reservation?,
        priceListItem: SupplierPriceListItem?,
        priceListMatchedPeriod: Boolean,
        applicationCommissionPercentText: String?
    ): RentalPricingPresentation {
        val supplierRevenue = MoneyDecimal.ofNullable(supplierRevenueExVatText)
        val appRevenue = reservation?.let { agreedPriceExVat(it) }
        val revenueDiff = if (supplierRevenue != null && appRevenue != null) {
            supplierRevenue.minus(appRevenue)
        } else null

        val tariff = tariffFromPeriod(reservation?.periodTypeDays)
        val listDaily = priceListItem?.dailyPriceNis?.let { MoneyDecimal.fromLegacyDouble(it) }
        val listWeekly = priceListItem?.weeklyPriceNis?.let { MoneyDecimal.fromLegacyDouble(it) }
        val listMonthly = priceListItem?.monthlyPriceNis?.let { MoneyDecimal.fromLegacyDouble(it) }

        val (source, sourceHe, warning) = resolveSource(
            reservation = reservation,
            hasListPrice = listDaily != null || listWeekly != null || listMonthly != null,
            matchedPeriod = priceListMatchedPeriod
        )

        val unitLabel = when (tariff) {
            TariffBasisKind.MONTHLY -> "מחיר חודשי"
            TariffBasisKind.WEEKLY -> "מחיר שבועי"
            TariffBasisKind.DAILY -> "מחיר יומי"
            TariffBasisKind.MIXED_UNPROVEN -> "תעריף"
            TariffBasisKind.UNKNOWN -> "מחיר"
        }

        val unitPrice = when (tariff) {
            TariffBasisKind.MONTHLY -> listMonthly
            TariffBasisKind.WEEKLY -> listWeekly
            TariffBasisKind.DAILY -> listDaily
            else -> null
        }

        val revenueMismatch = revenueDiff != null &&
            revenueDiff.abs() > MoneyDecimal.DEFAULT_TOLERANCE

        // No tariff-transition history exists — never invent weekly→monthly.
        val unprovenTransition = revenueMismatch &&
            tariff == TariffBasisKind.MONTHLY &&
            reservation != null

        val pricingNeedsReview = source == PriceSourceKind.MISSING ||
            unprovenTransition ||
            (source == PriceSourceKind.PRICE_LIST_CURRENT_ESTIMATE && revenueMismatch)

        val transitionHe = when {
            unprovenTransition -> "חשד לשינוי תעריף — דורש בדיקה"
            else -> null
        }

        val explanation = buildString {
            when (tariff) {
                TariffBasisKind.MONTHLY -> append("ההשכרה מחושבת במסלול חודשי.")
                TariffBasisKind.WEEKLY -> append("ההשכרה מחושבת במסלול שבועי.")
                TariffBasisKind.DAILY -> append("ההשכרה מחושבת במסלול יומי.")
                else -> append("סוג התעריף אינו חד־משמעי.")
            }
            if (revenueMismatch) {
                append(" הפער בעמלה עשוי לנבוע מבסיס הכנסה שונה.")
            }
            if (unprovenTransition) {
                append(" לא נמצא תיעוד מעבר משבועי לחודשי — נדרשת בדיקה ידנית.")
            }
        }

        val unitsLabel = when (tariff) {
            TariffBasisKind.MONTHLY -> "יחידות חיוב: מחזורים/ימים לפי חישוב העמלה"
            TariffBasisKind.WEEKLY -> "יחידות חיוב: שבועות/ימים לפי חישוב העמלה"
            TariffBasisKind.DAILY -> "יחידות חיוב: ימים לפי חישוב העמלה"
            else -> "יחידות חיוב: לפי חישוב העמלה"
        }

        return RentalPricingPresentation(
            supplierRevenueExVat = supplierRevenue,
            applicationRentalRevenueExVat = appRevenue,
            revenueDifference = revenueDiff,
            tariffBasis = if (unprovenTransition) TariffBasisKind.MIXED_UNPROVEN else tariff,
            tariffBasisHebrew = tariffHebrew(
                if (unprovenTransition) TariffBasisKind.MIXED_UNPROVEN else tariff
            ),
            unitPriceLabelHebrew = unitLabel,
            unitPriceFormatted = unitPrice?.let { FinancialDisplayFormatter.formatMoney(it) }
                ?: if (source == PriceSourceKind.MISSING) null
                else appRevenue?.let { FinancialDisplayFormatter.formatMoney(it) },
            monthlyPriceFormatted = listMonthly?.let { FinancialDisplayFormatter.formatMoney(it) },
            weeklyPriceFormatted = listWeekly?.let { FinancialDisplayFormatter.formatMoney(it) },
            dailyPriceFormatted = listDaily?.let { FinancialDisplayFormatter.formatMoney(it) },
            chargedUnitsLabelHebrew = unitsLabel,
            applicationCommissionPercentFormatted =
                applicationCommissionPercentText?.let { FinancialDisplayFormatter.formatPercent(it) }
                    ?: reservation?.commissionPercentUsed?.let {
                        FinancialDisplayFormatter.formatPercent(it)
                    },
            priceSource = source,
            priceSourceHebrew = sourceHe,
            priceWarningHebrew = warning,
            tariffTransitionHebrew = transitionHe,
            pricingNeedsReview = pricingNeedsReview,
            explanationHebrew = explanation
        )
    }

    fun agreedPriceExVat(reservation: Reservation): MoneyDecimal {
        val agreed = MoneyDecimal.fromLegacyDouble(reservation.agreedPrice)
        return if (reservation.includeVat) {
            val vat = reservation.vatPercentAtCreation
                ?.takeIf { it > 0.0 }
                ?: 17.0
            val divisor = BigDecimal.ONE.add(
                BigDecimal.valueOf(vat).divide(BigDecimal("100"), 10, RoundingMode.HALF_UP)
            )
            MoneyDecimal.of(
                agreed.value.divide(divisor, 10, RoundingMode.HALF_UP)
            )
        } else {
            agreed
        }
    }

    private fun tariffFromPeriod(periodTypeDays: Int?): TariffBasisKind = when (periodTypeDays) {
        1 -> TariffBasisKind.DAILY
        7 -> TariffBasisKind.WEEKLY
        24, 30 -> TariffBasisKind.MONTHLY
        null -> TariffBasisKind.UNKNOWN
        else -> TariffBasisKind.UNKNOWN
    }

    private fun tariffHebrew(kind: TariffBasisKind): String = when (kind) {
        TariffBasisKind.DAILY -> "יומי"
        TariffBasisKind.WEEKLY -> "שבועי"
        TariffBasisKind.MONTHLY -> "חודשי"
        TariffBasisKind.MIXED_UNPROVEN -> "חשד למעבר תעריף"
        TariffBasisKind.UNKNOWN -> "לא ידוע"
    }

    private fun resolveSource(
        reservation: Reservation?,
        hasListPrice: Boolean,
        matchedPeriod: Boolean
    ): Triple<PriceSourceKind, String, String?> {
        if (reservation == null) {
            return Triple(
                PriceSourceKind.MISSING,
                "מחיר מקור לא נמצא",
                "אין הזמנה תואמת לתמחור"
            )
        }
        // Preferred: reservation agreed price (snapshot of deal)
        if (reservation.agreedPrice > 0.0) {
            return Triple(
                PriceSourceKind.RESERVATION_AGREED_PRICE,
                "מחיר מוסכם מההזמנה",
                null
            )
        }
        if (hasListPrice && matchedPeriod) {
            return Triple(
                PriceSourceKind.PRICE_LIST_HISTORICAL_PERIOD,
                "מחירון ספק לחודש היציאה",
                null
            )
        }
        if (hasListPrice) {
            return Triple(
                PriceSourceKind.PRICE_LIST_CURRENT_ESTIMATE,
                "מחירון ספק נוכחי (הערכה)",
                "המחיר מוערך ממחירון נוכחי — לא מההזמנה"
            )
        }
        return Triple(
            PriceSourceKind.MISSING,
            "מחיר מקור לא נמצא",
            "לא נמצא מחיר מוסכם או מחירון תואם"
        )
    }
}
