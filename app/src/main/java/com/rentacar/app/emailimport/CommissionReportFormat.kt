package com.rentacar.app.emailimport

/**
 * Per-supplier commission report source format for email import.
 * Stored on [com.rentacar.app.data.Supplier.commissionReportFormat] as the enum name.
 */
enum class CommissionReportFormat {
    HTML_TABLE,
    XLSX_ATTACHMENT;

    fun hebrewLabel(): String = when (this) {
        HTML_TABLE -> "טבלה בגוף המייל"
        XLSX_ATTACHMENT -> "קובץ Excel מצורף"
    }

    companion object {
        fun fromStored(value: String?): CommissionReportFormat? {
            if (value.isNullOrBlank()) return null
            return entries.firstOrNull { it.name.equals(value.trim(), ignoreCase = true) }
        }
    }
}
