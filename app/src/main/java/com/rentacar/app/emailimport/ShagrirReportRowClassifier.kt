package com.rentacar.app.emailimport

import com.rentacar.app.commission.parser.ShagrirCommissionReportParser

enum class ShagrirRowKind {
    BLANK,
    VALID_DATA,
    TOTALS,
    FOOTER,
    MALFORMED
}

data class ShagrirRowShape(
    val orderBlank: Boolean,
    val orderOk: Boolean,
    val commissionOk: Boolean,
    val daysOk: Boolean,
    val customerOk: Boolean,
    val invoiceOk: Boolean,
    val revenueOk: Boolean,
    val percentOk: Boolean,
    val agentOk: Boolean,
    val nonBlankCount: Int,
    val columnCount: Int,
    val emptyFields: List<String>
) {
    val validDataShape: Boolean
        get() = orderOk && commissionOk && daysOk && customerOk &&
            invoiceOk && revenueOk && percentOk && agentOk

    /** Enough numeric/id fields to look like a commission record even if order is missing. */
    val reportNumericShape: Boolean
        get() = listOf(commissionOk, daysOk, invoiceOk, revenueOk, percentOk).count { it } >= 3

    fun numericShapeSummary(): String = listOf(
        "order=$orderOk",
        "commission=$commissionOk",
        "days=$daysOk",
        "invoice=$invoiceOk",
        "revenue=$revenueOk",
        "percent=$percentOk"
    ).joinToString(",")
}

/**
 * Distinguishes valid Shagrir data rows, totals, post-report footer/layout/signature,
 * and genuinely malformed rows inside the data section.
 *
 * Empty order number is NOT automatically a footer. Lookahead is required so a
 * broken row in the middle of the report still fails.
 */
object ShagrirReportRowClassifier {
    const val LOOKAHEAD_ROWS = 6

    fun cellMap(cells: List<String>, columnIndex: Map<String, Int>): Map<String, String> =
        ShagrirCommissionReportParser.REQUIRED_HEADERS.associateWith { col ->
            val idx = columnIndex[col] ?: return@associateWith ""
            cells.getOrNull(idx).orEmpty().trim()
        }

    fun inspect(
        cellsByCol: Map<String, String>,
        rawColumnCount: Int = cellsByCol.size
    ): ShagrirRowShape {
        fun v(col: String) = cellsByCol[col].orEmpty().trim()
        val order = v(ShagrirCommissionReportParser.COL_ORDER)
        val commission = v(ShagrirCommissionReportParser.COL_COMMISSION)
        val days = v(ShagrirCommissionReportParser.COL_DAYS)
        val customer = v(ShagrirCommissionReportParser.COL_CUSTOMER)
        val invoice = v(ShagrirCommissionReportParser.COL_INVOICE)
        val revenue = v(ShagrirCommissionReportParser.COL_REVENUE)
        val percent = v(ShagrirCommissionReportParser.COL_PERCENT)
        val agent = v(ShagrirCommissionReportParser.COL_AGENT)
        val values = listOf(order, commission, days, customer, invoice, revenue, percent, agent)
        val empty = buildList {
            if (order.isEmpty()) add(ShagrirCommissionReportParser.COL_ORDER)
            if (commission.isEmpty()) add(ShagrirCommissionReportParser.COL_COMMISSION)
            if (days.isEmpty()) add(ShagrirCommissionReportParser.COL_DAYS)
            if (customer.isEmpty()) add(ShagrirCommissionReportParser.COL_CUSTOMER)
            if (invoice.isEmpty()) add(ShagrirCommissionReportParser.COL_INVOICE)
            if (revenue.isEmpty()) add(ShagrirCommissionReportParser.COL_REVENUE)
            if (percent.isEmpty()) add(ShagrirCommissionReportParser.COL_PERCENT)
            if (agent.isEmpty()) add(ShagrirCommissionReportParser.COL_AGENT)
        }
        return ShagrirRowShape(
            orderBlank = order.isEmpty(),
            orderOk = ShagrirReportFieldParser.looksLikeOrderOrInvoice(order),
            commissionOk = ShagrirReportFieldParser.looksLikeDecimal(commission),
            daysOk = ShagrirReportFieldParser.looksLikeIntegerDays(days),
            customerOk = customer.isNotBlank(),
            invoiceOk = ShagrirReportFieldParser.looksLikeOrderOrInvoice(invoice),
            revenueOk = ShagrirReportFieldParser.looksLikeDecimal(revenue),
            percentOk = ShagrirReportFieldParser.looksLikeDecimal(percent),
            agentOk = agent.isNotBlank(),
            nonBlankCount = values.count { it.isNotBlank() },
            columnCount = rawColumnCount,
            emptyFields = empty
        )
    }

    fun classify(
        cellsByCol: Map<String, String>,
        validRowsParsed: Int,
        followingRows: List<Map<String, String>>,
        rawColumnCount: Int = cellsByCol.size
    ): ShagrirRowKind {
        val shape = inspect(cellsByCol, rawColumnCount)
        if (shape.nonBlankCount == 0) return ShagrirRowKind.BLANK

        val order = cellsByCol[ShagrirCommissionReportParser.COL_ORDER].orEmpty()
        if (ShagrirReportFieldParser.isTotalsLabel(order) ||
            (shape.orderBlank && cellsByCol.values.any { ShagrirReportFieldParser.isTotalsLabel(it) })
        ) {
            return ShagrirRowKind.TOTALS
        }

        if (shape.validDataShape) return ShagrirRowKind.VALID_DATA

        val laterHasValid = followingRows.take(LOOKAHEAD_ROWS).any { inspect(it).validDataShape }

        if (validRowsParsed == 0) return ShagrirRowKind.MALFORMED

        // Broken / empty-order row still inside the report must fail, never become a footer.
        if (laterHasValid) return ShagrirRowKind.MALFORMED

        val joined = cellsByCol.values.joinToString(" ")
        if (hasStrongFooterEvidence(joined, shape, cellsByCol)) return ShagrirRowKind.FOOTER
        if (shape.orderBlank && !shape.reportNumericShape) return ShagrirRowKind.FOOTER
        if (!shape.orderOk && !shape.reportNumericShape) return ShagrirRowKind.FOOTER

        return ShagrirRowKind.MALFORMED
    }

    fun malformedReason(cellsByCol: Map<String, String>): String {
        val shape = inspect(cellsByCol)
        val order = cellsByCol[ShagrirCommissionReportParser.COL_ORDER].orEmpty()
        return when {
            order.isBlank() -> "מספר הזמנה ריק"
            !shape.orderOk -> "מספר הזמנה לא תקין"
            !shape.commissionOk -> "עמלה אינה מספר"
            !shape.daysOk -> "ימים אינם מספר תקין"
            !shape.customerOk -> "שם מנוי ריק"
            !shape.invoiceOk -> "מספר חשבונית לא תקין"
            !shape.revenueOk -> "הכנסה אינה מספר"
            !shape.percentOk -> "אחוז אינו מספר"
            !shape.agentOk -> "שם סוכן ריק"
            else -> "שורה לא תקינה"
        }
    }

    fun looksLikeFooterText(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return false
        val lower = trimmed.lowercase()
        val n = HebrewHeaderNormalizer.normalize(trimmed)
        val englishHints = listOf(
            "none selected", "skip to content", "using gmail", "inbox",
            "http://", "https://", "unsubscribe", "get outlook", "sent from",
            "copyright", "www.", "signature"
        )
        if (englishHints.any { lower.contains(it) }) return true
        val hebrewHints = listOf(
            "בברכה", "בכבודרב", "טלפון", "פקס", "נייד", "כתובת",
            "שגרירחברה", "כלהזכויות"
        )
        if (hebrewHints.any { n.contains(it) }) return true
        if (n == HebrewHeaderNormalizer.normalize("שגריר")) return true
        if (Regex("""^\+?\d[\d\-\s]{6,}$""").matches(trimmed)) return true
        if (trimmed.contains("@") && !ShagrirReportFieldParser.looksLikeDecimal(trimmed)) return true
        return false
    }

    private fun hasStrongFooterEvidence(
        joined: String,
        shape: ShagrirRowShape,
        cellsByCol: Map<String, String>
    ): Boolean {
        if (shape.reportNumericShape) return false
        if (looksLikeFooterText(joined) || cellsByCol.values.any { looksLikeFooterText(it) }) return true
        if (shape.nonBlankCount <= 2) return true
        if (shape.columnCount in 1..2) return true
        return false
    }
}
