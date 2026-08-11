package com.rentacar.app.commission.domain

import com.rentacar.app.commission.money.MoneyDecimal

/**
 * Supplier commission percentage tiers (integer percent values as stored on Supplier).
 */
data class SupplierCommissionTerms(
    val days1to6Percent: Int,
    val days7to23Percent: Int,
    val days24plusPercent: Int,
    val ratesMissingWarning: Boolean = false
) {
    fun percentForDays(days: Int): Int = when {
        days <= 6 -> days1to6Percent
        days <= 23 -> days7to23Percent
        else -> days24plusPercent
    }

    fun percentAsDecimal(days: Int): MoneyDecimal =
        MoneyDecimal.of(percentForDays(days).toLong())

    companion object {
        val DEFAULT = SupplierCommissionTerms(
            days1to6Percent = 15,
            days7to23Percent = 10,
            days24plusPercent = 7,
            ratesMissingWarning = true
        )

        fun fromSupplier(
            commissionDays1to6: Int?,
            commissionDays7to23: Int?,
            commissionDays24plus: Int?
        ): SupplierCommissionTerms {
            val missing = commissionDays1to6 == null ||
                commissionDays7to23 == null ||
                commissionDays24plus == null
            return SupplierCommissionTerms(
                days1to6Percent = commissionDays1to6 ?: DEFAULT.days1to6Percent,
                days7to23Percent = commissionDays7to23 ?: DEFAULT.days7to23Percent,
                days24plusPercent = commissionDays24plus ?: DEFAULT.days24plusPercent,
                ratesMissingWarning = missing
            )
        }
    }
}

data class RawCommissionReportRow(
    val sourceRowNumber: Int,
    val orderNumber: String,
    val invoiceNumber: String,
    val totalDays: Int,
    val customerName: String,
    val revenueExVat: MoneyDecimal,
    val commissionPercent: MoneyDecimal,
    val commissionAmount: MoneyDecimal,
    val agentName: String,
    val rowHash: String
) {
    val normalizedGroupKey: String
        get() = "${normalizeId(orderNumber)}|${normalizeId(invoiceNumber)}"

    companion object {
        fun normalizeId(raw: String): String {
            var s = raw.trim()
            if (s.endsWith(".0") && s.dropLast(2).all { it.isDigit() }) {
                s = s.dropLast(2)
            }
            // Strip trailing .0 from Excel numeric strings more generally
            if (s.contains('.') && s.matches(Regex("""^\d+\.0+$"""))) {
                s = s.substringBefore('.')
            }
            return s.trim()
        }
    }
}

data class NormalizedSupplierGroup(
    val groupKey: String,
    val orderNumber: String,
    val invoiceNumber: String,
    val totalDays: Int?,
    val commissionPercent: MoneyDecimal?,
    val revenueExVat: MoneyDecimal,
    val commissionAmount: MoneyDecimal,
    val customerName: String,
    val agentName: String,
    val sourceRowNumbers: List<Int>,
    val sourceRows: List<RawCommissionReportRow>,
    val isValid: Boolean,
    val validationErrors: List<String> = emptyList()
)

data class CommissionReportTotals(
    val revenueExVat: MoneyDecimal,
    val commissionAmount: MoneyDecimal
)

data class CommissionReportParseContext(
    val supplierId: Long,
    val reportYear: Int,
    val reportMonth: Int,
    val sourceFileName: String,
    val fileHash: String,
    val userUid: String
)

data class CommissionReportParseResult(
    val success: Boolean,
    val parserCode: Int,
    val parserVersion: Int,
    val worksheetName: String?,
    val rawRows: List<RawCommissionReportRow>,
    val normalizedGroups: List<NormalizedSupplierGroup>,
    val workbookTotals: CommissionReportTotals?,
    val rawSums: CommissionReportTotals,
    val normalizedSums: CommissionReportTotals,
    val totalsMatch: Boolean,
    val uniqueOrderCount: Int,
    val errors: List<String> = emptyList(),
    val warnings: List<String> = emptyList()
)
