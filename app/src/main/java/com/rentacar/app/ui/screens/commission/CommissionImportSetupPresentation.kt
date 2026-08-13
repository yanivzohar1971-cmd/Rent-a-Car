package com.rentacar.app.ui.screens.commission

import com.rentacar.app.emailimport.CommissionReportFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Pure presentation helpers for the commission import SETUP UI.
 * No business logic — formatting only.
 */
object CommissionImportSetupPresentation {

    private val HEBREW_MONTHS = listOf(
        "",
        "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
        "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
    )

    private val DATE_FMT = DateTimeFormatter.ofPattern("dd/MM/yyyy")

    fun screenTitle(supplierName: String?): String {
        val name = supplierName?.takeIf { it.isNotBlank() } ?: "ספק"
        return "יבוא דוח עמלות – $name"
    }

    fun hebrewMonthYear(yearMonth: YearMonth): String {
        val month = HEBREW_MONTHS.getOrElse(yearMonth.monthValue) { yearMonth.monthValue.toString() }
        return "$month ${yearMonth.year}"
    }

    fun formatChipLabel(storedFormat: String?): String? =
        CommissionReportFormat.fromStored(storedFormat)?.hebrewLabel()

    fun friendlyCutoffTitle(cutoff: LocalDate): String =
        "כולל יציאות לפני ${cutoff.format(DATE_FMT)}"

    fun friendlyCutoffSubtitle(): String = "לפי תאריך יציאה בלבד"

    fun formatReportReceivedAt(epochMillis: Long): String {
        if (epochMillis <= 0L) return "—"
        return java.text.SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
            .format(java.util.Date(epochMillis))
    }

    fun isNoMatchingReportsMessage(message: String?): Boolean {
        if (message.isNullOrBlank()) return false
        return message.contains("לא נמצאו הודעות") ||
            message.contains("לא נמצא דוח")
    }

    /** Never show raw parser template labels in normal SETUP UI. */
    fun shouldHideInternalTemplateInSetup(): Boolean = true
}
