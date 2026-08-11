package com.rentacar.app.ui.vm

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.data.CommissionReconciliationItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionReconciliationFilterTest {

    @Test
    fun matchingFilter_returnsOnlyDirectionMatches() {
        val items = listOf(
            item(1, ReconciliationMatchStatus.FULL_MATCH, supplier = "15", internal = "15"),
            item(2, ReconciliationMatchStatus.AMOUNT_MISMATCH, supplier = "100", internal = "80"),
            item(3, ReconciliationMatchStatus.SUPPLIER_ONLY, supplier = "50", internal = null)
        )
        val filtered = filterReconciliationItems(items, emptyList(), CommissionReconFilter.MATCHING)
        assertEquals(1, filtered.size)
        assertEquals(1L, filtered.single().id)
    }

    @Test
    fun emptyFilterResult_isEmptyList() {
        val items = listOf(item(1, ReconciliationMatchStatus.FULL_MATCH))
        val filtered = filterReconciliationItems(items, emptyList(), CommissionReconFilter.HISTORICAL)
        assertTrue(filtered.isEmpty())
    }

    @Test
    fun kpiTotalsUnaffectedByFilter_countsDifferButSourceUnchanged() {
        val items = listOf(
            item(1, ReconciliationMatchStatus.FULL_MATCH, supplier = "15", internal = "15"),
            item(2, ReconciliationMatchStatus.AMOUNT_MISMATCH, supplier = "100", internal = "80")
        )
        val all = filterReconciliationItems(items, emptyList(), CommissionReconFilter.ALL)
        val matching = filterReconciliationItems(items, emptyList(), CommissionReconFilter.MATCHING)
        assertEquals(2, all.size)
        assertEquals(1, matching.size)
        assertEquals(2, items.size)
    }

    @Test
    fun open30Filter_usesLifecycle() {
        val items = listOf(
            item(
                1,
                ReconciliationMatchStatus.FULL_MATCH,
                CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE
            ),
            item(
                2,
                ReconciliationMatchStatus.FULL_MATCH,
                CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT
            )
        )
        val filtered = filterReconciliationItems(items, emptyList(), CommissionReconFilter.OPEN_30)
        assertEquals(1, filtered.size)
        assertEquals(1L, filtered.single().id)
    }

    @Test
    fun underpaidFilter_returnsOnlyUnderpaid() {
        val items = listOf(
            item(1, ReconciliationMatchStatus.AMOUNT_MISMATCH, supplier = "80", internal = "100"),
            item(2, ReconciliationMatchStatus.AMOUNT_MISMATCH, supplier = "120", internal = "100")
        )
        val filtered = filterReconciliationItems(items, emptyList(), CommissionReconFilter.UNDERPAID)
        assertEquals(1, filtered.size)
        assertEquals(1L, filtered.single().id)
    }

    private fun item(
        id: Long,
        status: ReconciliationMatchStatus,
        lifecycle: CommissionLifecycleClassification = CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT,
        supplier: String? = "15",
        internal: String? = "15"
    ) = CommissionReconciliationItem(
        id = id,
        importId = 1,
        supplierId = 1,
        normalizedGroupKey = "k$id",
        reservationId = if (status == ReconciliationMatchStatus.SUPPLIER_ONLY) null else id,
        internalEventId = if (internal == null) null else "e$id",
        supplierOrderNumber = "$id",
        supplierInvoiceNumber = "i$id",
        supplierCustomerName = "C",
        supplierDays = 5,
        supplierRevenue = "100",
        supplierPercent = "15",
        supplierCommission = supplier,
        internalPeriodStart = null,
        internalPeriodEnd = null,
        internalDays = 5,
        internalPercent = "15",
        internalCommission = internal,
        deviation = "0",
        matchStatus = status.name,
        lifecycleClassification = lifecycle.name,
        proposedActualReturnDate = null,
        approvalState = "PENDING",
        userUid = "uid"
    )
}
