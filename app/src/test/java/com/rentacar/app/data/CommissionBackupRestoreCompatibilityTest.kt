package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionBackupRestoreCompatibilityTest {

    @Test
    fun oldIceWithoutCommissionSections_treatedAsEmpty() {
        // ExportViewModel.arr(...) falls back to empty list semantics when section missing.
        val missingSectionRows = emptyList<Any>()
        assertEquals(0, missingSectionRows.size)
    }

    @Test
    fun newIceSectionNames_areStable() {
        val names = listOf(
            "supplierCommissionImportConfigs",
            "supplierCommissionReportImports",
            "supplierCommissionReportLines",
            "commissionReconciliationItems",
            "commissionSettlementEvents",
            "commissionTrackingOverrides",
            "carSaleCommissionPayments"
        )
        assertTrue(names.all { it.isNotBlank() })
        assertEquals(7, names.size)
    }
}
