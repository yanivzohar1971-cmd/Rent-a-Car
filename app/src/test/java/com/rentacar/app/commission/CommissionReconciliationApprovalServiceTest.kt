package com.rentacar.app.commission

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.data.CommissionReconciliationItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionReconciliationApprovalServiceTest {

    @Test
    fun safeBulk_excludesAmbiguousAndConflicts() {
        val safe = item(ReconciliationMatchStatus.FULL_MATCH, CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE)
        val ambiguous = item(
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES,
            CommissionLifecycleClassification.AMBIGUOUS
        )
        val conflict = item(
            ReconciliationMatchStatus.RETURN_DATE_CONFLICT,
            CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT
        )
        val filtered = CommissionReconciliationApprovalService.filterSafeBulk(
            listOf(safe, ambiguous, conflict)
        )
        assertEquals(1, filtered.size)
        assertEquals(ReconciliationMatchStatus.FULL_MATCH.name, filtered.single().matchStatus)
    }

    @Test
    fun noAutomaticApprovalDuringPreview_pendingState() {
        val item = item(
            ReconciliationMatchStatus.FULL_MATCH,
            CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE
        )
        assertTrue(item.approvalState == "PENDING")
    }

    private fun item(
        status: ReconciliationMatchStatus,
        lifecycle: CommissionLifecycleClassification
    ) = CommissionReconciliationItem(
        id = 1,
        importId = 1,
        supplierId = 1,
        normalizedGroupKey = "a|b",
        reservationId = 1,
        internalEventId = "e1",
        supplierOrderNumber = "1",
        supplierInvoiceNumber = "1",
        supplierCustomerName = "X",
        supplierDays = 30,
        supplierRevenue = "100",
        supplierPercent = "7",
        supplierCommission = "7",
        internalPeriodStart = 1,
        internalPeriodEnd = 2,
        internalDays = 30,
        internalPercent = "7",
        internalCommission = "7",
        deviation = "0",
        matchStatus = status.name,
        lifecycleClassification = lifecycle.name,
        proposedActualReturnDate = null,
        approvalState = "PENDING",
        userUid = "uid"
    )
}
