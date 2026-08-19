package com.rentacar.app.emailimport

import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.money.MoneyDecimal

/**
 * Shared Shagrir cell-value parsing used by HTML and Clipboard paths.
 * Preserves existing percent semantics: 0.07 = 7%, 0.15 = 15%.
 */
object ShagrirReportFieldParser {

    fun parseOrderNumber(raw: String): String {
        val text = raw.trim()
        if (text.isEmpty()) error("מספר הזמנה ריק")
        if (!looksLikeOrderOrInvoice(text)) error("מספר הזמנה לא תקין: $text")
        return RawCommissionReportRow.normalizeId(text)
    }

    fun parseInvoiceNumber(raw: String): String {
        val text = raw.trim()
        if (text.isEmpty()) error("מספר חשבונית ריק")
        if (!looksLikeOrderOrInvoice(text)) error("מספר חשבונית לא תקין: $text")
        return RawCommissionReportRow.normalizeId(text)
    }

    fun parseDays(raw: String): Int {
        val text = raw.trim().replace(",", "")
        if (text.isEmpty()) error("ערך ימים ריק")
        return text.substringBefore('.').toIntOrNull()
            ?: error("ערך ימים לא תקין: $text")
    }

    fun parseMoney(raw: String): MoneyDecimal {
        val text = raw.trim()
        if (text.isEmpty()) error("סכום ריק")
        return MoneyDecimal.of(text.replace("₪", "").replace(",", "").trim())
    }

    fun parsePercent(raw: String): MoneyDecimal {
        val text = raw.replace("%", "").trim()
        if (text.isEmpty()) error("אחוז ריק")
        val numeric = text.replace(",", "").toDoubleOrNull()
            ?: return MoneyDecimal.of(text)
        val asPercent = if (numeric in 0.0..1.0 && numeric != 0.0 && numeric != 1.0) {
            numeric * 100.0
        } else {
            numeric
        }
        return MoneyDecimal.fromLegacyDouble(asPercent)
    }

    fun isTotalsLabel(text: String): Boolean {
        val n = HebrewHeaderNormalizer.normalize(text)
        return n.startsWith(HebrewHeaderNormalizer.normalize("סהכ")) ||
            n == HebrewHeaderNormalizer.normalize("סה\"כ") ||
            n == HebrewHeaderNormalizer.normalize("סה״כ")
    }

    fun looksLikeOrderOrInvoice(text: String): Boolean {
        val compact = text.trim().replace(",", "").replace(" ", "")
        if (compact.isEmpty()) return false
        val withoutDotZero = if (compact.endsWith(".0") && compact.dropLast(2).all { it.isDigit() }) {
            compact.dropLast(2)
        } else compact
        return withoutDotZero.all { it.isDigit() } && withoutDotZero.length in 1..18
    }

    fun looksLikeDecimal(text: String): Boolean {
        val compact = text.trim().replace(",", "").replace("₪", "").replace("%", "").replace(" ", "")
        if (compact.isEmpty()) return false
        return compact.toDoubleOrNull() != null
    }

    fun looksLikeIntegerDays(text: String): Boolean {
        val compact = text.trim().replace(",", "")
        if (compact.isEmpty()) return false
        val asInt = compact.substringBefore('.').toIntOrNull() ?: return false
        return asInt in 0..3660
    }
}
