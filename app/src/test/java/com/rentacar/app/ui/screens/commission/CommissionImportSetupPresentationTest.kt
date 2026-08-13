package com.rentacar.app.ui.screens.commission

import com.rentacar.app.emailimport.CommissionReportFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class CommissionImportSetupPresentationTest {

    @Test
    fun screenTitle_usesSupplierName() {
        assertEquals(
            "יבוא דוח עמלות – שגריר",
            CommissionImportSetupPresentation.screenTitle("שגריר")
        )
    }

    @Test
    fun hebrewMonthYear_formatsJuly2026() {
        assertEquals(
            "יולי 2026",
            CommissionImportSetupPresentation.hebrewMonthYear(YearMonth.of(2026, 7))
        )
    }

    @Test
    fun formatChip_htmlTableFriendly() {
        assertEquals(
            "טבלה בגוף המייל",
            CommissionImportSetupPresentation.formatChipLabel(CommissionReportFormat.HTML_TABLE.name)
        )
    }

    @Test
    fun formatChip_xlsxFriendly() {
        assertEquals(
            "קובץ Excel מצורף",
            CommissionImportSetupPresentation.formatChipLabel(CommissionReportFormat.XLSX_ATTACHMENT.name)
        )
    }

    @Test
    fun formatChip_nullWhenUnset() {
        assertNull(CommissionImportSetupPresentation.formatChipLabel(null))
        assertNull(CommissionImportSetupPresentation.formatChipLabel(""))
    }

    @Test
    fun friendlyCutoff_noDateFromTerminology() {
        val title = CommissionImportSetupPresentation.friendlyCutoffTitle(LocalDate.of(2026, 7, 1))
        assertEquals("כולל יציאות לפני 01/07/2026", title)
        assertFalse(title.contains("dateFrom", ignoreCase = true))
        assertEquals("לפי תאריך יציאה בלבד", CommissionImportSetupPresentation.friendlyCutoffSubtitle())
    }

    @Test
    fun hidesInternalTemplateInSetup() {
        assertTrue(CommissionImportSetupPresentation.shouldHideInternalTemplateInSetup())
        assertFalse(
            CommissionImportSetupPresentation.screenTitle("שגריר")
                .contains("Shagrir Commission Excel", ignoreCase = true)
        )
    }

    @Test
    fun detectsNoMatchingReportsMessage() {
        assertTrue(
            CommissionImportSetupPresentation.isNoMatchingReportsMessage("לא נמצאו הודעות תואמות")
        )
        assertFalse(
            CommissionImportSetupPresentation.isNoMatchingReportsMessage("לא ניתן להתחבר לתיבת המייל")
        )
    }
}
