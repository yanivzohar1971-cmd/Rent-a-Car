package com.rentacar.app.commission.domain

import com.rentacar.app.commission.money.MoneyDecimal

/**
 * Groups raw supplier commission rows by normalized order+invoice.
 */
object CommissionReportNormalizer {

    fun normalize(rawRows: List<RawCommissionReportRow>): List<NormalizedSupplierGroup> {
        if (rawRows.isEmpty()) return emptyList()

        return rawRows
            .groupBy { it.normalizedGroupKey }
            .entries
            .sortedBy { it.value.minOf { row -> row.sourceRowNumber } }
            .map { (key, rows) -> buildGroup(key, rows.sortedBy { it.sourceRowNumber }) }
    }

    private fun buildGroup(key: String, rows: List<RawCommissionReportRow>): NormalizedSupplierGroup {
        val errors = mutableListOf<String>()
        val orderNumber = rows.first().orderNumber.let { RawCommissionReportRow.normalizeId(it) }
        val invoiceNumber = rows.first().invoiceNumber.let { RawCommissionReportRow.normalizeId(it) }

        val distinctDays = rows.map { it.totalDays }.distinct()
        val distinctPercents = rows.map { it.commissionPercent }.distinct()

        val totalDays = when {
            distinctDays.size == 1 -> distinctDays.single()
            else -> {
                errors += "ימים סותרים בקבוצה: ${distinctDays.joinToString()}"
                null
            }
        }

        val commissionPercent = when {
            distinctPercents.size == 1 -> distinctPercents.single()
            else -> {
                errors += "אחוזי עמלה סותרים בקבוצה"
                null
            }
        }

        val revenue = rows.fold(MoneyDecimal.ZERO) { acc, row -> acc.plus(row.revenueExVat) }
        val commission = rows.fold(MoneyDecimal.ZERO) { acc, row -> acc.plus(row.commissionAmount) }

        return NormalizedSupplierGroup(
            groupKey = key,
            orderNumber = orderNumber,
            invoiceNumber = invoiceNumber,
            totalDays = totalDays,
            commissionPercent = commissionPercent,
            revenueExVat = revenue,
            commissionAmount = commission,
            customerName = rows.first().customerName,
            agentName = rows.first().agentName,
            sourceRowNumbers = rows.map { it.sourceRowNumber },
            sourceRows = rows,
            isValid = errors.isEmpty(),
            validationErrors = errors
        )
    }

    fun sumRevenue(rows: List<RawCommissionReportRow>): MoneyDecimal =
        rows.fold(MoneyDecimal.ZERO) { acc, row -> acc.plus(row.revenueExVat) }

    fun sumCommission(rows: List<RawCommissionReportRow>): MoneyDecimal =
        rows.fold(MoneyDecimal.ZERO) { acc, row -> acc.plus(row.commissionAmount) }

    fun sumGroupRevenue(groups: List<NormalizedSupplierGroup>): MoneyDecimal =
        groups.fold(MoneyDecimal.ZERO) { acc, g -> acc.plus(g.revenueExVat) }

    fun sumGroupCommission(groups: List<NormalizedSupplierGroup>): MoneyDecimal =
        groups.fold(MoneyDecimal.ZERO) { acc, g -> acc.plus(g.commissionAmount) }
}
