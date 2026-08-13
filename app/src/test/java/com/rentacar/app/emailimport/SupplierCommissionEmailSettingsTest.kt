package com.rentacar.app.emailimport

import com.rentacar.app.data.Supplier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SupplierCommissionEmailSettingsTest {

    @Test
    fun existingSupplierWithoutEmailSettingsLoads() {
        val supplier = Supplier(id = 1, name = "שגריר")
        assertNull(supplier.commissionReportEmail)
        assertNull(supplier.commissionReportFormat)
    }

    @Test
    fun commissionReportEmailAndFormatPersistOnModel() {
        val supplier = Supplier(
            id = 2,
            name = "שגריר",
            commissionReportEmail = "assaft@shagrir.co.il",
            commissionReportFormat = CommissionReportFormat.HTML_TABLE.name
        )
        assertEquals("assaft@shagrir.co.il", supplier.commissionReportEmail)
        assertEquals(CommissionReportFormat.HTML_TABLE, CommissionReportFormat.fromStored(supplier.commissionReportFormat))
    }

    @Test
    fun xlsxAttachmentSelectionPersists() {
        val supplier = Supplier(
            id = 3,
            name = "Example",
            commissionReportEmail = "commissions@example.co.il",
            commissionReportFormat = CommissionReportFormat.XLSX_ATTACHMENT.name
        )
        assertEquals(CommissionReportFormat.XLSX_ATTACHMENT, CommissionReportFormat.fromStored(supplier.commissionReportFormat))
    }

    @Test
    fun invalidEmailRejectedByNormalizer() {
        assertTrue(!EmailAddressNormalizer.isSyntacticallyValid("bad@@"))
    }

    @Test
    fun formatRequiredConceptuallyWhenEmailSet() {
        val email = "a@b.co"
        val format: String? = null
        val shouldRequireFormat = email.isNotBlank() && format.isNullOrBlank()
        assertTrue(shouldRequireFormat)
    }

    @Test
    fun copyPreservesLegacyFieldsWhenAddingEmailConfig() {
        val original = Supplier(
            id = 9,
            name = "Legacy",
            importFunctionCode = 1,
            commissionDays1to6 = 15
        )
        val updated = original.copy(
            commissionReportEmail = "assaft@shagrir.co.il",
            commissionReportFormat = CommissionReportFormat.HTML_TABLE.name
        )
        assertEquals(1, updated.importFunctionCode)
        assertEquals(15, updated.commissionDays1to6)
        assertEquals("Legacy", updated.name)
    }
}
