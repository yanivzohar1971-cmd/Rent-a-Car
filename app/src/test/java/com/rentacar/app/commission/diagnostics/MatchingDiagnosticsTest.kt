package com.rentacar.app.commission.diagnostics

import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.NormalizedSupplierGroup
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.ui.vm.CommissionImportSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class MatchingDiagnosticsTest {

    private val tz = ZoneId.of("Asia/Jerusalem")
    private val cutoff = LocalDate.of(2026, 7, 1)
    private val cutoffMillis = CommissionBusinessDates.toStartOfDayMillis(cutoff)

    @Test
    fun slice_includesBeforeCutoffAndExcludesJuly1WrongSupplierAndCancelled() {
        val before = reservation(1, dateFrom = date(2026, 6, 30), order = "A")
        val onCutoff = reservation(2, dateFrom = date(2026, 7, 1), order = "B")
        val after = reservation(3, dateFrom = date(2026, 7, 2), order = "C")
        val wrong = reservation(4, supplierId = 9, dateFrom = date(2026, 6, 1), order = "D")
        val cancelled = reservation(5, dateFrom = date(2026, 6, 1), order = "E", status = ReservationStatus.Cancelled)
        val sliced = CommissionReconciliationService.sliceCandidates(
            listOf(before, onCutoff, after, wrong, cancelled),
            supplierId = 5,
            departureCutoffExclusive = cutoff
        )
        assertEquals(listOf(1L), sliced.map { it.id })
    }

    @Test
    fun createdAtAndUpdatedAtDoNotAffectCutoff() {
        val r = reservation(1, dateFrom = date(2026, 6, 15), order = "X").copy(
            createdAt = date(2026, 8, 1),
            updatedAt = date(2026, 8, 2)
        )
        val sliced = CommissionReconciliationService.sliceCandidates(
            listOf(r),
            supplierId = 5,
            departureCutoffExclusive = cutoff
        )
        assertEquals(1, sliced.size)
    }

    @Test
    fun exactSupplierOrderMatch_andExternalFallback_andNoFuzzy() {
        val byOrder = reservation(1, order = "28004")
        val byExt = reservation(2, order = null, external = "27680")
        val similar = reservation(3, order = "280044")
        assertEquals(
            listOf(1L),
            CommissionReconciliationService.listReservationMatches("28004", listOf(byOrder, similar)).map { it.id }
        )
        assertEquals(
            listOf(2L),
            CommissionReconciliationService.listReservationMatches("27680", listOf(byExt, similar)).map { it.id }
        )
        assertTrue(
            CommissionReconciliationService.listReservationMatches("3839", listOf(byOrder, byExt, similar)).isEmpty()
        )
    }

    @Test
    fun diagnosis_noIdentifierMatch_whenPoolExistsButOrderAbsent() {
        val pool = listOf(reservation(24, order = "3024546"))
        val diag = MatchingDiagnostics.diagnoseUnmatched(
            orderNumber = "28004",
            allReservations = pool,
            supplierId = 5,
            cutoffMillis = cutoffMillis,
            eligible = pool
        )
        assertEquals(MatchingDiagnostics.REASON_NO_IDENTIFIER_MATCH, diag["reasonCode"])
        assertEquals(1, diag["candidatePoolSize"])
        assertEquals(0, diag["supplierOrderExactMatches"])
        assertEquals(0, diag["externalContractExactMatches"])
    }

    @Test
    fun diagnosis_candidateFound_for3024546() {
        val pool = listOf(reservation(24, order = "3024546"))
        val diag = MatchingDiagnostics.diagnoseUnmatched(
            orderNumber = "3024546",
            allReservations = pool,
            supplierId = 5,
            cutoffMillis = cutoffMillis,
            eligible = pool
        )
        assertEquals(MatchingDiagnostics.REASON_CANDIDATE_FOUND, diag["reasonCode"])
        assertEquals(1, diag["supplierOrderExactMatches"])
    }

    @Test
    fun diagnosis_wrongSupplierAndAfterCutoff() {
        val wrong = reservation(10, supplierId = 1, order = "27680")
        val late = reservation(11, dateFrom = date(2026, 7, 15), order = "27680")
        val wrongDiag = MatchingDiagnostics.diagnoseUnmatched(
            "27680", listOf(wrong), 5, cutoffMillis, emptyList()
        )
        assertEquals(MatchingDiagnostics.REASON_ALL_CANDIDATES_WRONG_SUPPLIER, wrongDiag["reasonCode"])
        val lateDiag = MatchingDiagnostics.diagnoseUnmatched(
            "27680", listOf(late), 5, cutoffMillis, emptyList()
        )
        assertEquals(MatchingDiagnostics.REASON_ALL_CANDIDATES_AFTER_CUTOFF, lateDiag["reasonCode"])
    }

    @Test
    fun emptyIdentifier() {
        val diag = MatchingDiagnostics.diagnoseUnmatched(
            "  ", listOf(reservation(1, order = "1")), 5, cutoffMillis, listOf(reservation(1, order = "1"))
        )
        assertEquals(MatchingDiagnostics.REASON_IDENTIFIER_FIELD_EMPTY, diag["reasonCode"])
    }

    @Test
    fun repeatedReportOrders_remainSeparateItems() {
        val g1 = group("28004", "inv-a")
        val g2 = group("28004", "inv-b")
        val result = CommissionReconciliationService.reconcile(
            CommissionReconciliationService.Input(
                supplier = com.rentacar.app.data.Supplier(id = 5, name = "שגריר"),
                reportYear = 2026,
                reportMonth = 7,
                departureCutoff = cutoff,
                normalizedGroups = listOf(g1, g2),
                candidateReservations = emptyList(),
                customersById = emptyMap(),
                terms = com.rentacar.app.commission.domain.SupplierCommissionTerms(15, 10, 7),
                settledEvents = emptyList(),
                trackingOverrides = emptyList(),
                userUid = "uid"
            )
        )
        assertEquals(2, result.items.size)
        assertTrue(result.items.all { it.matchStatus == ReconciliationMatchStatus.SUPPLIER_ONLY.name })
    }

    @Test
    fun jsonIncludesCandidateSliceAndReadyFlags() {
        val eligible = reservation(24, order = "3024546")
        val unmatched = item("28004|1", "28004", ReconciliationMatchStatus.SUPPLIER_ONLY)
        val json = CommissionReconciliationReportBuilder.toJson(
            ReconciliationReportSnapshot(
                sessionId = "s",
                generatedAtMs = 1L,
                sourceType = CommissionImportSource.EMAIL,
                supplier = com.rentacar.app.data.Supplier(id = 5, name = "שגריר"),
                reportYearMonth = YearMonth.of(2026, 7),
                parserLabel = "x",
                emailUid = null,
                emailMatchType = null,
                sourceFileName = "email",
                parseResult = null,
                items = listOf(unmatched),
                historicalItems = emptyList(),
                kpis = null,
                slicedCandidates = listOf(eligible),
                allReservations = listOf(eligible),
                manualSelections = emptyMap(),
                actions = emptyList(),
                parserExecuted = true,
                normalizerExecuted = true,
                automaticMatchingExecuted = true,
                manualMatchingOpened = false,
                finalImportExecuted = false,
                parseFailureMessage = null
            )
        )
        assertTrue(json.contains("matchingDiagnostics"))
        assertTrue(json.contains("NO_IDENTIFIER_MATCH"))
        assertTrue(json.contains("ShagrirHtmlTableReportParser"))
        assertTrue(json.contains("\"matchingComplete\": false"))
        assertTrue(json.contains("importAllowedWithSkippedSupplierRows"))
        assertFalse(json.contains("\"reconciliationReady\": true"))
        assertEquals(2, com.google.gson.JsonParser.parseString(json).asJsonObject.get("schemaVersion").asInt)
    }

    @Test
    fun parserNameBySource() {
        assertEquals(
            "ShagrirHtmlTableReportParser",
            MatchingDiagnostics.actualParserName(CommissionImportSource.EMAIL, "Shagrir Commission Excel V1", "HTML")
        )
        assertEquals(
            "ShagrirClipboardParser",
            MatchingDiagnostics.actualParserName(CommissionImportSource.CLIPBOARD, "Excel", "CLIPBOARD")
        )
        assertEquals(
            "Shagrir Commission Excel V1",
            MatchingDiagnostics.actualParserName(
                CommissionImportSource.MANUAL_FILE,
                "Shagrir Commission Excel V1",
                "עמלות"
            )
        )
    }

    private fun reservation(
        id: Long,
        supplierId: Long = 5,
        dateFrom: Long = date(2026, 6, 1),
        order: String? = null,
        external: String? = null,
        status: ReservationStatus = ReservationStatus.Confirmed
    ) = Reservation(
        id = id,
        customerId = 1,
        supplierId = supplierId,
        branchId = 1,
        carTypeId = 1,
        dateFrom = dateFrom,
        dateTo = dateFrom,
        agreedPrice = 100.0,
        kmIncluded = 1,
        requiredHoldAmount = 1,
        status = status,
        supplierOrderNumber = order,
        externalContractNumber = external
    )

    private fun date(y: Int, m: Int, d: Int): Long =
        LocalDate.of(y, m, d).atStartOfDay(tz).toInstant().toEpochMilli()

    private fun group(order: String, invoice: String) = NormalizedSupplierGroup(
        groupKey = "$order|$invoice",
        orderNumber = order,
        invoiceNumber = invoice,
        totalDays = 5,
        commissionPercent = MoneyDecimal.of("15"),
        revenueExVat = MoneyDecimal.of("100"),
        commissionAmount = MoneyDecimal.of("15"),
        customerName = "A",
        agentName = "B",
        sourceRowNumbers = listOf(2),
        sourceRows = emptyList(),
        isValid = true
    )

    private fun item(key: String, order: String, status: ReconciliationMatchStatus) =
        CommissionReconciliationItem(
            id = 1,
            importId = 0,
            supplierId = 5,
            normalizedGroupKey = key,
            reservationId = null,
            internalEventId = null,
            supplierOrderNumber = order,
            supplierInvoiceNumber = "i",
            supplierCustomerName = null,
            supplierDays = 1,
            supplierRevenue = "1",
            supplierPercent = "15",
            supplierCommission = "15",
            internalPeriodStart = null,
            internalPeriodEnd = null,
            internalDays = null,
            internalPercent = null,
            internalCommission = null,
            deviation = null,
            matchStatus = status.name,
            lifecycleClassification = CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT.name,
            proposedActualReturnDate = null,
            approvalState = "PENDING",
            userUid = "uid"
        )
}
