package com.rentacar.app.commission.diagnostics

import com.google.gson.JsonParser
import com.rentacar.app.commission.CommissionReconciliationService
import com.rentacar.app.commission.CommissionReportParserCodes
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.CommissionReportParseResult
import com.rentacar.app.commission.domain.CommissionReportTotals
import com.rentacar.app.commission.domain.NormalizedSupplierGroup
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.ui.vm.CommissionImportSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class CommissionReconciliationReportBuilderTest {

    private val tz = ZoneId.of("Asia/Jerusalem")

    @Test
    fun jsonAfterSuccessfulParsing_containsSourceAndCounts() {
        val parse = parseResult(rowCount = 12, success = true)
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parse, items = emptyList(), automaticMatchingExecuted = false)
        )
        val root = JsonParser.parseString(json).asJsonObject
        assertEquals(2, root.get("schemaVersion").asInt)
        assertEquals("EMAIL", root.getAsJsonObject("source").get("type").asString)
        assertEquals("שגריר", root.getAsJsonObject("source").get("supplierName").asString)
        assertEquals(12, root.getAsJsonObject("summary").get("parsedRowCount").asInt)
        assertEquals(12, root.getAsJsonObject("summary").get("sourceRowCount").asInt)
        assertTrue(root.getAsJsonObject("execution").get("parserExecuted").asBoolean)
        assertFalse(root.getAsJsonObject("execution").get("finalImportExecuted").asBoolean)
        assertTrue(json.contains("שגריר"))
    }

    @Test
    fun jsonAfterParserError_exportsMessageAndRowEvidence() {
        val parse = parseResult(
            rowCount = 7,
            success = false,
            errors = listOf("שורה 11 - מספר הזמנה ריק")
        )
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parse,
                items = emptyList(),
                parseFailureMessage = null,
                automaticMatchingExecuted = false
            )
        )
        val root = JsonParser.parseString(json).asJsonObject
        val err = root.getAsJsonArray("parseErrors").get(0).asJsonObject
        assertEquals(11, err.get("sourceRow").asInt)
        assertEquals("מספר הזמנה", err.get("field").asString)
        assertEquals("EMPTY_FIELD", err.get("code").asString)
        assertEquals("שורה 11 - מספר הזמנה ריק", err.get("message").asString)
        assertFalse(err.get("consideredDataRow").asBoolean)
        assertTrue(err.get("hadRowsBefore").asBoolean)
        assertFalse(err.get("hadRowsAfter").asBoolean)
        assertTrue(root.getAsJsonObject("summary").get("parseErrorCount").asInt >= 1)
        assertFalse(root.getAsJsonObject("summary").get("reconciliationReady").asBoolean)
    }

    @Test
    fun jsonAutoMatchedRow_usesEngineMatchWithoutFabricatingScore() {
        val group = group("9001", "inv-1", sourceRow = 3)
        val reservation = reservation(id = 11, order = "9001")
        val recon = CommissionReconciliationService.reconcile(input(listOf(group), listOf(reservation)))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseFromGroups(listOf(group)),
                items = recon.items,
                sliced = listOf(reservation)
            )
        )
        val row = JsonParser.parseString(json).asJsonObject.getAsJsonArray("rows").get(0).asJsonObject
        assertEquals("AUTO_MATCHED", row.get("matchStatus").asString)
        assertEquals(11L, row.getAsJsonObject("autoMatch").get("reservationId").asLong)
        assertTrue(row.getAsJsonObject("autoMatch").get("reasonCodes").asJsonArray.size() > 0)
        assertTrue(row.get("autoMatch").asJsonObject.get("score").isJsonNull)
        val counts = JsonParser.parseString(json).asJsonObject.getAsJsonObject("summary")
        assertEquals(1, counts.get("autoMatchedCount").asInt)
        assertEquals(0, counts.get("ambiguousCount").asInt)
    }

    @Test
    fun jsonAmbiguousRow_listsCandidatesAndDoesNotAutoSelect() {
        val group = group("1", "inv-a", sourceRow = 4)
        val a = reservation(id = 21, order = "1")
        val b = reservation(id = 22, order = "1")
        val recon = CommissionReconciliationService.reconcile(input(listOf(group), listOf(a, b)))
        assertEquals(
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name,
            recon.items.single().matchStatus
        )
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseFromGroups(listOf(group)),
                items = recon.items,
                sliced = listOf(a, b)
            )
        )
        val row = JsonParser.parseString(json).asJsonObject.getAsJsonArray("rows").get(0).asJsonObject
        assertEquals("AMBIGUOUS", row.get("matchStatus").asString)
        assertEquals(2, row.get("candidateCount").asInt)
        assertTrue(row.get("manualSelection").isJsonNull)
        assertTrue(row.get("autoMatch").isJsonNull)
        val reasons = row.getAsJsonArray("candidates").get(0).asJsonObject.getAsJsonArray("reasonCodes")
        assertTrue(reasons.toString().contains("ORDER_NUMBER_MATCH"))
        assertTrue(
            ReconciliationDiagnosticClassifier.canChooseMatch(
                ReconciliationDiagnosticStatus.AMBIGUOUS,
                2
            )
        )
    }

    @Test
    fun jsonUnmatchedRow_hasZeroCandidatesAndNoChooseMatch() {
        val group = group("404", "inv-x", sourceRow = 5)
        val recon = CommissionReconciliationService.reconcile(input(listOf(group), emptyList()))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parseFromGroups(listOf(group)), items = recon.items, sliced = emptyList())
        )
        val row = JsonParser.parseString(json).asJsonObject.getAsJsonArray("rows").get(0).asJsonObject
        assertEquals("UNMATCHED", row.get("matchStatus").asString)
        assertEquals(0, row.get("candidateCount").asInt)
        assertFalse(
            ReconciliationDiagnosticClassifier.canChooseMatch(
                ReconciliationDiagnosticStatus.UNMATCHED,
                0
            )
        )
        val remaining = JsonParser.parseString(json).asJsonObject.getAsJsonArray("remainingIssues")
        assertNotNull(remaining)
    }

    @Test
    fun jsonAfterManualSelection_marksOnlyThatRow() {
        val ambiguous = group("1", "inv-a", sourceRow = 7)
        val unmatched = group("404", "inv-b", sourceRow = 8)
        val a = reservation(id = 31, order = "1")
        val b = reservation(id = 32, order = "1")
        val recon = CommissionReconciliationService.reconcile(
            input(listOf(ambiguous, unmatched), listOf(a, b))
        )
        val chosen = CommissionReconciliationService.reconcile(
            input(listOf(ambiguous), listOf(a)).copy(candidateReservations = listOf(a))
        )
        val merged = ReconciliationManualMatchOverlay.replaceGroup(
            recon.items,
            ambiguous.groupKey,
            chosen.items
        )
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseFromGroups(listOf(ambiguous, unmatched)),
                items = merged,
                sliced = listOf(a, b),
                manual = mapOf(ambiguous.groupKey to 31L),
                actions = listOf(
                    ReconciliationDebugAction(code = "MANUAL_MATCH_OPENED", rowIndex = 7, groupKey = ambiguous.groupKey),
                    ReconciliationDebugAction(
                        code = "MANUAL_MATCH_SELECTED",
                        rowIndex = 7,
                        reservationId = 31L,
                        groupKey = ambiguous.groupKey
                    )
                ),
                manualMatchingOpened = true
            )
        )
        val rows = JsonParser.parseString(json).asJsonObject.getAsJsonArray("rows")
        val byOrder = rows.associate { el ->
            el.asJsonObject.get("supplierOrderNumber").asString to el.asJsonObject
        }
        assertEquals("MANUALLY_MATCHED", byOrder.getValue("1").get("matchStatus").asString)
        assertEquals(31L, byOrder.getValue("1").getAsJsonObject("manualSelection").get("selectedReservationId").asLong)
        assertEquals(7, byOrder.getValue("1").get("sourceRow").asInt)
        assertEquals("UNMATCHED", byOrder.getValue("404").get("matchStatus").asString)
        assertTrue(byOrder.getValue("404").get("manualSelection").isJsonNull)
        val summary = JsonParser.parseString(json).asJsonObject.getAsJsonObject("summary")
        assertEquals(1, summary.get("manuallyMatchedCount").asInt)
        assertEquals(1, summary.get("unmatchedCount").asInt)
        val opened = JsonParser.parseString(json).asJsonObject.getAsJsonArray("actions").get(0).asJsonObject
        assertTrue(opened.get("groupKeyPresent").asBoolean)
    }

    @Test
    fun changingManualSelection_replacesPreviousChoice() {
        val group = group("1", "inv-a", sourceRow = 7)
        val first = reservation(id = 41, order = "1")
        val second = reservation(id = 42, order = "1")
        val engine = CommissionReconciliationService.reconcile(input(listOf(group), listOf(first, second)))
        val afterFirst = ReconciliationManualMatchOverlay.replaceGroup(
            engine.items,
            group.groupKey,
            CommissionReconciliationService.reconcile(input(listOf(group), listOf(first))).items
        )
        val afterSecond = ReconciliationManualMatchOverlay.replaceGroup(
            afterFirst,
            group.groupKey,
            CommissionReconciliationService.reconcile(input(listOf(group), listOf(second))).items
        )
        assertEquals(1, afterSecond.size)
        assertEquals(42L, afterSecond.single().reservationId)
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseFromGroups(listOf(group)),
                items = afterSecond,
                sliced = listOf(first, second),
                manual = mapOf(group.groupKey to 42L)
            )
        )
        val row = JsonParser.parseString(json).asJsonObject.getAsJsonArray("rows").get(0).asJsonObject
        assertEquals(42L, row.getAsJsonObject("manualSelection").get("selectedReservationId").asLong)
        assertFalse(row.getAsJsonObject("manualSelection").get("selectedReservationId").asLong == 41L)
    }

    @Test
    fun candidateReasons_areExportedFromExistingEngine() {
        val reservation = reservation(id = 51, order = "9001")
        val reasons = CommissionReconciliationService.matchReasonCodes("9001", reservation)
        assertTrue(reasons.contains("ORDER_NUMBER_MATCH"))
        assertTrue(reasons.contains("SUPPLIER_MATCH"))
        assertTrue(reasons.contains("DEPARTURE_BEFORE_CUTOFF"))
        assertFalse(reasons.contains("ORDER_NUMBER_SIMILAR"))
        val hebrew = reasons.map { CommissionReconciliationService.matchReasonHebrew(it) }
        assertTrue(hebrew.contains("מספר הזמנה תואם"))
        val candidates = CommissionReconciliationReportBuilder.candidatesFor("9001", listOf(reservation))
        assertEquals(reasons, candidates.single().reasonCodes)
    }

    @Test
    fun finalImportExecuted_remainsFalseBeforeConfirmation() {
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parseResult(3, true), items = emptyList(), finalImportExecuted = false)
        )
        val execution = JsonParser.parseString(json).asJsonObject.getAsJsonObject("execution")
        assertFalse(execution.get("finalImportExecuted").asBoolean)
        assertFalse(json.contains("FINAL_IMPORT_EXECUTED"))
    }

    @Test
    fun arbitrarySourceRowCounts_areNotHardcoded() {
        for (count in listOf(2, 12, 51, 80)) {
            val parse = parseResult(count, true)
            val json = CommissionReconciliationReportBuilder.toJson(snapshot(parse = parse, items = emptyList()))
            val summary = JsonParser.parseString(json).asJsonObject.getAsJsonObject("summary")
            assertEquals(count, summary.get("parsedRowCount").asInt)
            assertFalse(json.contains("\"expectedRowCount\""))
            assertFalse(json.contains("43 rows"))
            assertFalse(json.contains("44 rows"))
        }
    }

    @Test
    fun utf8HebrewSurvivesFileExport() {
        val parse = parseResult(2, false, errors = listOf("שורה 3 - מספר הזמנה ריק"))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parse, items = emptyList(), parseFailureMessage = "פענוח נכשל")
        )
        val dir = createTempDir(prefix = "recon_json_utf8_")
        try {
            val file = CommissionReconciliationReportStore.persistToDir(dir, json)
            assertEquals("commission-reconciliation-latest.json", file.name)
            val roundTrip = file.readText(Charsets.UTF_8)
            assertEquals(json, roundTrip)
            assertTrue(roundTrip.contains("מספר הזמנה ריק"))
            assertTrue(roundTrip.contains("שגריר"))
            assertTrue(roundTrip.contains("פענוח נכשל"))
        } finally {
            dir.deleteRecursively()
        }
    }

    @Test
    fun credentialsAreAbsentFromExport() {
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseResult(1, true),
                items = emptyList(),
                parseFailureMessage = "auth failed without password"
            )
        )
        assertFalse(CommissionReconciliationReportBuilder.containsForbiddenSecrets(json))
        assertFalse(json.contains("App Password", ignoreCase = true))
        assertFalse(json.contains("gmail", ignoreCase = true) && json.contains("password", ignoreCase = true))
        assertFalse(json.contains("private_key"))
        assertFalse(json.contains("AIza"))
        val poisoned = """{"password":"secret-value","supplierName":"שגריר"}"""
        assertTrue(CommissionReconciliationReportBuilder.containsForbiddenSecrets(poisoned))
    }

    @Test
    fun exportWorksWhenReconciliationReadyIsFalse() {
        val parse = parseResult(1, false, errors = listOf("שורה 3 - מספר הזמנה ריק"))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parse, items = emptyList(), automaticMatchingExecuted = false)
        )
        val summary = JsonParser.parseString(json).asJsonObject.getAsJsonObject("summary")
        assertFalse(summary.get("reconciliationReady").asBoolean)
        assertTrue(json.contains("parseErrors"))
        assertNotNull(JsonParser.parseString(json).asJsonObject.get("sessionId"))
        assertTrue(JsonParser.parseString(json).asJsonObject.has("rows"))
    }

    @Test
    fun manualMatchDialogReceivesCorrectSourceRow() {
        val group = group("77", "inv-7", sourceRow = 7)
        val a = reservation(id = 61, order = "77")
        val b = reservation(id = 62, order = "77")
        val recon = CommissionReconciliationService.reconcile(input(listOf(group), listOf(a, b)))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(
                parse = parseFromGroups(listOf(group)),
                items = recon.items,
                sliced = listOf(a, b),
                actions = listOf(
                    ReconciliationDebugAction(code = "MANUAL_MATCH_OPENED", rowIndex = 7, groupKey = group.groupKey)
                )
            )
        )
        val root = JsonParser.parseString(json).asJsonObject
        val row = root.getAsJsonArray("rows").get(0).asJsonObject
        assertEquals(7, row.get("sourceRow").asInt)
        assertEquals(group.groupKey, row.get("groupKey").asString)
        val action = root.getAsJsonArray("actions").get(0).asJsonObject
        assertEquals("MANUAL_MATCH_OPENED", action.get("code").asString)
        assertEquals(7, action.get("rowIndex").asInt)
        assertFalse(action.get("groupKeyPresent").asBoolean.not())
    }

    @Test
    fun unresolvedCountReason_blocksFinalImport() {
        val group = group("1", "inv-a", sourceRow = 4)
        val recon = CommissionReconciliationService.reconcile(
            input(listOf(group), listOf(reservation(1, order = "1"), reservation(2, order = "1")))
        )
        val counts = CommissionReconciliationReportBuilder.counts(
            snapshot(parse = parseFromGroups(listOf(group)), items = recon.items)
        )
        assertEquals(1, counts.unresolvedCount)
        assertEquals("נותרה שורה אחת שדורשת התאמה", counts.importBlockedReason())
        val three = listOf(
            item("a|1", ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES),
            item("b|1", ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES),
            item("c|1", ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES)
        )
        val threeCounts = CommissionReconciliationReportBuilder.counts(
            snapshot(parse = parseResult(3, true), items = three)
        )
        assertEquals("נותרו 3 שורות שדורשות התאמה", threeCounts.importBlockedReason())
        val parseFail = CommissionReconciliationReportBuilder.counts(
            snapshot(
                parse = parseResult(0, false, errors = listOf("שורה 1 - מספר הזמנה ריק")),
                items = emptyList()
            )
        )
        assertEquals("קיימת שגיאת פענוח אחת בדוח", parseFail.importBlockedReason())
    }

    @Test
    fun existingAutomaticMatchBehavior_unchangedForUniqueAndMultiple() {
        val unique = CommissionReconciliationService.reconcile(
            input(listOf(group("9001", "1")), listOf(reservation(id = 1, order = "9001")))
        )
        assertEquals(1L, unique.items.single().reservationId)
        val multiple = CommissionReconciliationService.reconcile(
            input(
                listOf(group("1", "1")),
                listOf(reservation(id = 1, order = "1"), reservation(id = 2, order = "1"))
            )
        )
        assertEquals(
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name,
            multiple.items.single().matchStatus
        )
        assertNull(multiple.items.single().reservationId)
        val none = CommissionReconciliationService.reconcile(
            input(listOf(group("404", "1")), emptyList())
        )
        assertEquals(ReconciliationMatchStatus.SUPPLIER_ONLY.name, none.items.single().matchStatus)
    }

    @Test
    fun jsonDoesNotIncludeCustomerNamesOnCandidates() {
        val group = group("1", "inv-a", sourceRow = 4)
        val a = reservation(id = 21, order = "1")
        val b = reservation(id = 22, order = "1")
        val recon = CommissionReconciliationService.reconcile(input(listOf(group), listOf(a, b)))
        val json = CommissionReconciliationReportBuilder.toJson(
            snapshot(parse = parseFromGroups(listOf(group)), items = recon.items, sliced = listOf(a, b))
        )
        val candidate = JsonParser.parseString(json).asJsonObject
            .getAsJsonArray("rows").get(0).asJsonObject
            .getAsJsonArray("candidates").get(0).asJsonObject
        assertFalse(candidate.has("customerName"))
        assertFalse(candidate.has("appCustomerName"))
        assertTrue(candidate.has("reservationId"))
        assertTrue(candidate.has("orderNumber"))
    }

    private fun snapshot(
        parse: CommissionReportParseResult?,
        items: List<CommissionReconciliationItem>,
        sliced: List<Reservation> = emptyList(),
        manual: Map<String, Long> = emptyMap(),
        actions: List<ReconciliationDebugAction> = listOf(ReconciliationDebugAction(code = "REPORT_PARSED")),
        parseFailureMessage: String? = null,
        automaticMatchingExecuted: Boolean = true,
        manualMatchingOpened: Boolean = false,
        finalImportExecuted: Boolean = false
    ) = ReconciliationReportSnapshot(
        sessionId = "test-session",
        generatedAtMs = 1_700_000_000_000L,
        sourceType = CommissionImportSource.EMAIL,
        supplier = Supplier(id = 9, name = "שגריר"),
        reportYearMonth = YearMonth.of(2026, 7),
        parserLabel = "Shagrir HTML",
        emailUid = 55L,
        emailMatchType = "EXACT",
        sourceFileName = "report.html",
        parseResult = parse,
        items = items,
        historicalItems = emptyList(),
        kpis = null,
        slicedCandidates = sliced,
        manualSelections = manual,
        actions = actions,
        parserExecuted = true,
        normalizerExecuted = parse != null,
        automaticMatchingExecuted = automaticMatchingExecuted,
        manualMatchingOpened = manualMatchingOpened,
        finalImportExecuted = finalImportExecuted,
        parseFailureMessage = parseFailureMessage
    )

    private fun parseResult(
        rowCount: Int,
        success: Boolean,
        errors: List<String> = emptyList()
    ): CommissionReportParseResult {
        val rows = (0 until rowCount).map { i ->
            rawRow(sourceRow = 3 + i, order = "${1000 + i}", invoice = "i$i")
        }
        val groups = rows.map {
            group(it.orderNumber, it.invoiceNumber, sourceRow = it.sourceRowNumber)
        }
        val sums = CommissionReportTotals(MoneyDecimal.of("100"), MoneyDecimal.of("15"))
        return CommissionReportParseResult(
            success = success && errors.isEmpty(),
            parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
            parserVersion = 1,
            worksheetName = "HTML",
            rawRows = rows,
            normalizedGroups = groups,
            workbookTotals = sums,
            rawSums = sums,
            normalizedSums = sums,
            totalsMatch = success,
            uniqueOrderCount = rows.size,
            errors = errors
        )
    }

    private fun parseFromGroups(groups: List<NormalizedSupplierGroup>): CommissionReportParseResult {
        val rows = groups.flatMap { it.sourceRows.ifEmpty { it.sourceRowNumbers.map { n ->
            rawRow(n, it.orderNumber, it.invoiceNumber)
        } } }
        val sums = CommissionReportTotals(MoneyDecimal.of("100"), MoneyDecimal.of("15"))
        return CommissionReportParseResult(
            success = true,
            parserCode = CommissionReportParserCodes.SHAGRIR_EXCEL_V1,
            parserVersion = 1,
            worksheetName = "HTML",
            rawRows = rows,
            normalizedGroups = groups,
            workbookTotals = sums,
            rawSums = sums,
            normalizedSums = sums,
            totalsMatch = true,
            uniqueOrderCount = groups.map { it.orderNumber }.toSet().size
        )
    }

    private fun input(
        groups: List<NormalizedSupplierGroup>,
        reservations: List<Reservation>
    ) = CommissionReconciliationService.Input(
        supplier = Supplier(id = 1, name = "שגריר"),
        reportYear = 2026,
        reportMonth = 7,
        departureCutoff = LocalDate.of(2026, 7, 1),
        normalizedGroups = groups,
        candidateReservations = reservations,
        customersById = reservations.associate {
            it.customerId to Customer(id = it.customerId, firstName = "A", lastName = "B", phone = "1")
        },
        terms = SupplierCommissionTerms(15, 10, 7),
        settledEvents = emptyList(),
        trackingOverrides = emptyList(),
        userUid = "uid"
    )

    private fun group(
        order: String,
        invoice: String,
        sourceRow: Int = 3
    ) = NormalizedSupplierGroup(
        groupKey = "$order|$invoice",
        orderNumber = order,
        invoiceNumber = invoice,
        totalDays = 5,
        commissionPercent = MoneyDecimal.of("15"),
        revenueExVat = MoneyDecimal.of("100"),
        commissionAmount = MoneyDecimal.of("15"),
        customerName = "A B",
        agentName = "Agent",
        sourceRowNumbers = listOf(sourceRow),
        sourceRows = listOf(rawRow(sourceRow, order, invoice)),
        isValid = true
    )

    private fun rawRow(sourceRow: Int, order: String, invoice: String) = RawCommissionReportRow(
        sourceRowNumber = sourceRow,
        orderNumber = order,
        invoiceNumber = invoice,
        totalDays = 5,
        customerName = "A B",
        revenueExVat = MoneyDecimal.of("100"),
        commissionPercent = MoneyDecimal.of("15"),
        commissionAmount = MoneyDecimal.of("15"),
        agentName = "Agent",
        rowHash = "$sourceRow-$order"
    )

    private fun reservation(
        id: Long,
        order: String? = null
    ) = Reservation(
        id = id,
        customerId = 1,
        supplierId = 1,
        branchId = 1,
        carTypeId = 1,
        dateFrom = LocalDate.of(2026, 6, 1).atStartOfDay(tz).toInstant().toEpochMilli(),
        dateTo = LocalDate.of(2026, 6, 10).atStartOfDay(tz).toInstant().toEpochMilli(),
        agreedPrice = 100.0,
        kmIncluded = 100,
        requiredHoldAmount = 500,
        periodTypeDays = 1,
        status = ReservationStatus.Confirmed,
        supplierOrderNumber = order
    )

    private fun item(
        groupKey: String,
        status: ReconciliationMatchStatus
    ) = CommissionReconciliationItem(
        id = groupKey.hashCode().toLong(),
        importId = 0,
        supplierId = 1,
        normalizedGroupKey = groupKey,
        reservationId = null,
        internalEventId = null,
        supplierOrderNumber = groupKey.substringBefore('|'),
        supplierInvoiceNumber = groupKey.substringAfter('|'),
        supplierCustomerName = null,
        supplierDays = 5,
        supplierRevenue = "100",
        supplierPercent = "15",
        supplierCommission = "15",
        internalPeriodStart = null,
        internalPeriodEnd = null,
        internalDays = null,
        internalPercent = null,
        internalCommission = null,
        deviation = null,
        matchStatus = status.name,
        lifecycleClassification = CommissionLifecycleClassification.AMBIGUOUS.name,
        proposedActualReturnDate = null,
        approvalState = "PENDING",
        userUid = "uid"
    )
}
