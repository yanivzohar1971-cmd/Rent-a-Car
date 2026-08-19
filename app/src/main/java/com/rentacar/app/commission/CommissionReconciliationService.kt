package com.rentacar.app.commission

import com.rentacar.app.commission.domain.CommissionEventType
import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.CommissionLifecycleClassifier
import com.rentacar.app.commission.domain.CommissionReportImportStatus
import com.rentacar.app.commission.domain.CommissionSettlementIds
import com.rentacar.app.commission.domain.NormalizedSupplierGroup
import com.rentacar.app.commission.domain.RawCommissionReportRow
import com.rentacar.app.commission.domain.ReconciliationApprovalState
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.CommissionSettlementEvent
import com.rentacar.app.data.CommissionTrackingOverride
import com.rentacar.app.data.Customer
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import com.rentacar.app.data.Supplier
import com.rentacar.app.domain.CommissionBusinessDates
import com.rentacar.app.domain.CommissionCalculationService
import com.rentacar.app.domain.CommissionInstallment
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

/**
 * Pure reconciliation engine — never mutates reservations.
 */
object CommissionReconciliationService {

    data class Input(
        val supplier: Supplier,
        val reportYear: Int,
        val reportMonth: Int,
        val departureCutoff: LocalDate,
        val normalizedGroups: List<NormalizedSupplierGroup>,
        val candidateReservations: List<Reservation>,
        val allReservationsForDiagnostics: List<Reservation> = emptyList(),
        val customersById: Map<Long, Customer>,
        val terms: SupplierCommissionTerms,
        val settledEvents: List<CommissionSettlementEvent>,
        val trackingOverrides: List<CommissionTrackingOverride>,
        val importId: Long = 0L,
        val userUid: String
    )

    data class Result(
        val items: List<CommissionReconciliationItem>,
        val historicalCandidates: List<CommissionReconciliationItem>,
        val kpis: ReconciliationKpis,
        val blockingErrors: List<String> = emptyList()
    )

    data class ReconciliationKpis(
        val supplierCommissionTotal: MoneyDecimal,
        val internalCommissionTotal: MoneyDecimal,
        val deviationTotal: MoneyDecimal,
        val fullMatches: Int,
        val amountMismatches: Int,
        val daysMismatches: Int,
        val supplierOnly: Int,
        val applicationOnly: Int,
        val alreadySettled: Int,
        val openMonthly30: Int,
        val finalClosures: Int,
        val historicalCandidates: Int,
        val needsReview: Int
    )

    /**
     * Eligible matcher pool for a report month.
     *
     * Includes a reservation when ALL of:
     *  - supplierId equals the imported supplier
     *  - status is not Cancelled
     *  - dateFrom is strictly before [departureCutoffExclusive] (start of that calendar day,
     *    Asia/Jerusalem). createdAt / updatedAt are ignored.
     *
     * July 2026 therefore includes departures through 30/06/2026 and excludes 01/07/2026.
     */
    fun sliceCandidates(
        reservations: List<Reservation>,
        supplierId: Long,
        departureCutoffExclusive: LocalDate
    ): List<Reservation> {
        val cutoffMillis = CommissionBusinessDates.toStartOfDayMillis(departureCutoffExclusive)
        return reservations.filter { reservation ->
            reservation.supplierId == supplierId &&
                reservation.status != ReservationStatus.Cancelled &&
                reservation.dateFrom < cutoffMillis
        }
    }

    fun reconcile(input: Input): Result {
        val settledIds = input.settledEvents
            .filter { it.status == "APPROVED" || it.status == "PAID" }
            .map { it.stableId }
            .toSet()
        val caps = input.trackingOverrides.associate {
            it.reservationId to CommissionBusinessDates.toLocalDate(it.commissionCapDate)
        }

        val items = mutableListOf<CommissionReconciliationItem>()
        val matchedReservationIds = mutableSetOf<Long>()

        for (group in input.normalizedGroups) {
            items += reconcileGroup(
                group = group,
                input = input,
                settledIds = settledIds,
                caps = caps,
                matchedReservationIds = matchedReservationIds
            )
        }

        // Application-only: unpaid internal events for matched open monthly candidates
        // in report month window that have no supplier group — handled lightly via historical section.

        val historical = buildHistoricalCandidates(
            input = input,
            matchedReservationIds = matchedReservationIds,
            caps = caps
        )

        val all = items + historical
        val kpis = computeKpis(all, input.normalizedGroups)
        return Result(
            items = items,
            historicalCandidates = historical,
            kpis = kpis
        )
    }

    private fun reconcileGroup(
        group: NormalizedSupplierGroup,
        input: Input,
        settledIds: Set<String>,
        caps: Map<Long, LocalDate>,
        matchedReservationIds: MutableSet<Long>
    ): List<CommissionReconciliationItem> {
        if (!group.isValid) {
            return listOf(
                baseItem(
                    input = input,
                    group = group,
                    matchStatus = ReconciliationMatchStatus.INVALID_SUPPLIER_GROUP,
                    lifecycle = CommissionLifecycleClassification.NEEDS_REVIEW,
                    explanation = group.validationErrors.joinToString("; ")
                )
            )
        }

        val matches = findReservationMatches(group.orderNumber, input.candidateReservations)
        val classification = CommissionLifecycleClassifier.classify(group.totalDays)

        when {
            matches.isEmpty() -> {
                return listOf(
                    baseItem(
                        input = input,
                        group = group,
                        matchStatus = ReconciliationMatchStatus.SUPPLIER_ONLY,
                        lifecycle = classification,
                        explanation = "לא נמצאה הזמנה תואמת למספר הזמנה ${group.orderNumber}"
                    )
                )
            }
            matches.size > 1 -> {
                return listOf(
                    baseItem(
                        input = input,
                        group = group,
                        matchStatus = ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES,
                        lifecycle = CommissionLifecycleClassification.AMBIGUOUS,
                        explanation = "נמצאו ${matches.size} הזמנות תואמות — נדרש בחירה ידנית",
                        reservationId = null
                    )
                )
            }
        }

        val reservation = matches.single()
        matchedReservationIds += reservation.id
        val customer = input.customersById[reservation.customerId]
        val nameWarning = customerNameMismatch(group.customerName, customer)

        if (classification == CommissionLifecycleClassification.NEEDS_REVIEW) {
            return listOf(
                enrichWithReservation(
                    baseItem(
                        input = input,
                        group = group,
                        matchStatus = ReconciliationMatchStatus.NEEDS_REVIEW,
                        lifecycle = classification,
                        explanation = "מספר ימים ${group.totalDays} (כפולה מדויקת של 30 מעל 30) אינו מפורש אוטומטית",
                        reservationId = reservation.id
                    ),
                    reservation,
                    customer,
                    null
                )
            )
        }

        val proposedReturn = group.totalDays?.let { days ->
            CommissionLifecycleClassifier.proposedActualReturnDate(
                dateFrom = CommissionBusinessDates.toLocalDate(reservation.dateFrom),
                totalDays = days,
                classification = classification
            )
        }

        val returnConflict = hasReturnDateConflict(reservation, proposedReturn)

        val events = CommissionCalculationService.calculateEventsForReconciliation(
            reservation = reservation,
            supplierTotalDays = group.totalDays ?: 0,
            terms = input.terms,
            commissionCapDate = caps[reservation.id]
        )

        if (events.isEmpty()) {
            return listOf(
                enrichWithReservation(
                    baseItem(
                        input = input,
                        group = group,
                        matchStatus = ReconciliationMatchStatus.NEEDS_REVIEW,
                        lifecycle = classification,
                        explanation = "לא חושבו אירועי עמלה פנימיים",
                        reservationId = reservation.id,
                        proposedReturn = proposedReturn
                    ),
                    reservation,
                    customer,
                    null
                )
            )
        }

        val unpaidEvents = events.filter { event ->
            val stable = stableIdFor(event, reservation)
            stable !in settledIds
        }
        val settledForReservation = events.filter { event ->
            stableIdFor(event, reservation) in settledIds
        }

        val results = mutableListOf<CommissionReconciliationItem>()

        if (settledForReservation.isNotEmpty() && unpaidEvents.isEmpty()) {
            results += enrichWithReservation(
                baseItem(
                    input = input,
                    group = group,
                    matchStatus = ReconciliationMatchStatus.ALREADY_SETTLED,
                    lifecycle = classification,
                    explanation = "כל אירועי העמלה הרלוונטיים כבר אושרו ביומן הסליקה",
                    reservationId = reservation.id,
                    proposedReturn = proposedReturn,
                    internal = settledForReservation.first()
                ),
                reservation,
                customer,
                settledForReservation.first()
            )
            return results
        }

        if (settledForReservation.isNotEmpty() && unpaidEvents.isNotEmpty()) {
            // Prior 30-day settled; supplier may still report full total-to-date commission
            val unpaidInternal = unpaidEvents.fold(MoneyDecimal.ZERO) { acc, e ->
                acc.plus(MoneyDecimal.fromLegacyDouble(e.amount))
            }
            val status = if (!group.commissionAmount.matchesWithinTolerance(unpaidInternal)) {
                ReconciliationMatchStatus.POSSIBLE_DUPLICATE_PAYMENT
            } else {
                ReconciliationMatchStatus.AMOUNT_MISMATCH
            }
            for (event in unpaidEvents) {
                results += compareEvent(
                    input = input,
                    group = group,
                    reservation = reservation,
                    customer = customer,
                    event = event,
                    classification = classification,
                    proposedReturn = proposedReturn,
                    returnConflict = returnConflict,
                    nameWarning = nameWarning,
                    overrideStatus = status,
                    explanation = "קיים מחזור שכבר סולק; נותר רק יתרת הסגירה. דיווח הספק עשוי לכלול סכום מצטבר."
                )
            }
            return results
        }

        // Aggregate compare: sum unpaid internal vs supplier commission
        val internalTotal = events.fold(MoneyDecimal.ZERO) { acc, e ->
            acc.plus(MoneyDecimal.fromLegacyDouble(e.amount))
        }

        if (events.size == 1) {
            results += compareEvent(
                input = input,
                group = group,
                reservation = reservation,
                customer = customer,
                event = events.single(),
                classification = classification,
                proposedReturn = proposedReturn,
                returnConflict = returnConflict,
                nameWarning = nameWarning,
                overrideStatus = null,
                explanation = null
            )
        } else {
            // Multi-event (e.g. 30+remainder): one row summarizing supplier vs sum, plus event rows
            val aggregateStatus = when {
                returnConflict -> ReconciliationMatchStatus.RETURN_DATE_CONFLICT
                group.totalDays != null && events.sumOf { it.numberOfDays ?: 0 } != group.totalDays ->
                    ReconciliationMatchStatus.DAYS_MISMATCH
                !group.commissionAmount.matchesWithinTolerance(internalTotal) ->
                    ReconciliationMatchStatus.AMOUNT_MISMATCH
                nameWarning -> ReconciliationMatchStatus.CUSTOMER_NAME_WARNING
                else -> ReconciliationMatchStatus.FULL_MATCH
            }
            for (event in events) {
                results += compareEvent(
                    input = input,
                    group = group,
                    reservation = reservation,
                    customer = customer,
                    event = event,
                    classification = classification,
                    proposedReturn = proposedReturn,
                    returnConflict = returnConflict,
                    nameWarning = nameWarning,
                    overrideStatus = aggregateStatus,
                    explanation = "פירוק ל-${events.size} אירועי עמלה פנימיים; סה״כ פנימי=${internalTotal.toDisplayString()}"
                )
            }
        }
        return results
    }

    private fun compareEvent(
        input: Input,
        group: NormalizedSupplierGroup,
        reservation: Reservation,
        customer: Customer?,
        event: CommissionInstallment,
        classification: CommissionLifecycleClassification,
        proposedReturn: LocalDate?,
        returnConflict: Boolean,
        nameWarning: Boolean,
        overrideStatus: ReconciliationMatchStatus?,
        explanation: String?
    ): CommissionReconciliationItem {
        val internalAmount = MoneyDecimal.fromLegacyDouble(event.amount)
        val internalDays = event.numberOfDays
        val internalPercent = event.commissionPercent?.let { MoneyDecimal.fromLegacyDouble(it) }

        val status = overrideStatus ?: when {
            returnConflict -> ReconciliationMatchStatus.RETURN_DATE_CONFLICT
            internalDays != null && group.totalDays != null &&
                eventsDaysConflict(group, event, classification) ->
                ReconciliationMatchStatus.DAYS_MISMATCH
            internalPercent != null && group.commissionPercent != null &&
                !internalPercent.matchesWithinTolerance(group.commissionPercent) ->
                ReconciliationMatchStatus.RATE_MISMATCH
            // For multi-component, supplier amount is for whole group — compare only on single-event or via override
            classification != CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT &&
                !group.commissionAmount.matchesWithinTolerance(internalAmount) ->
                ReconciliationMatchStatus.AMOUNT_MISMATCH
            nameWarning -> ReconciliationMatchStatus.CUSTOMER_NAME_WARNING
            else -> ReconciliationMatchStatus.FULL_MATCH
        }

        val deviation = group.commissionAmount.minus(internalAmount)
        return enrichWithReservation(
            baseItem(
                input = input,
                group = group,
                matchStatus = status,
                lifecycle = classification,
                explanation = explanation
                    ?: defaultExplanation(status, nameWarning, returnConflict),
                reservationId = reservation.id,
                proposedReturn = proposedReturn,
                internal = event,
                deviation = deviation
            ),
            reservation,
            customer,
            event
        )
    }

    private fun eventsDaysConflict(
        group: NormalizedSupplierGroup,
        event: CommissionInstallment,
        classification: CommissionLifecycleClassification
    ): Boolean {
        if (classification == CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT) {
            // Component days won't equal supplier total days
            return false
        }
        return group.totalDays != null && event.numberOfDays != null &&
            group.totalDays != event.numberOfDays
    }

    private fun buildHistoricalCandidates(
        input: Input,
        matchedReservationIds: Set<Long>,
        caps: Map<Long, LocalDate>
    ): List<CommissionReconciliationItem> {
        val openUnmatched = input.candidateReservations.filter { reservation ->
            reservation.id !in matchedReservationIds &&
                !reservation.isClosed &&
                reservation.actualReturnDate == null &&
                caps[reservation.id] == null
        }

        return openUnmatched.map { reservation ->
            val customer = input.customersById[reservation.customerId]
            val cycles = CommissionCalculationService.calculateAllInstallmentsForReservation(reservation)
            CommissionReconciliationItem(
                importId = input.importId,
                supplierId = input.supplier.id,
                normalizedGroupKey = null,
                reservationId = reservation.id,
                internalEventId = "HISTORICAL_${reservation.id}",
                supplierOrderNumber = null,
                supplierInvoiceNumber = null,
                supplierCustomerName = null,
                supplierDays = null,
                supplierRevenue = null,
                supplierPercent = null,
                supplierCommission = null,
                internalPeriodStart = null,
                internalPeriodEnd = null,
                internalDays = null,
                internalPercent = null,
                internalCommission = MoneyDecimal.fromLegacyDouble(
                    CommissionCalculationService.getTotalCommission(cycles)
                ).toExactString(),
                deviation = null,
                matchStatus = ReconciliationMatchStatus.APPLICATION_ONLY.name,
                lifecycleClassification = CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name,
                proposedActualReturnDate = null,
                approvalState = ReconciliationApprovalState.PENDING.name,
                explanation = "הזמנה פתוחה היסטורית שאינה מופיעה בדוח הספק הנוכחי (${cycles.size} מחזורים מחושבים)",
                appCustomerName = customer?.let { "${it.firstName} ${it.lastName}".trim() },
                appSupplierOrderNumber = reservation.supplierOrderNumber ?: reservation.externalContractNumber,
                appDateFrom = reservation.dateFrom,
                appActualReturnDate = reservation.actualReturnDate,
                eventType = null,
                userUid = input.userUid
            )
        }
    }

    /**
     * Same order-number matching used by [reconcile]. Exposed for diagnostics and
     * the manual-choice UI — does not change matching rules.
     */
    fun listReservationMatches(
        orderNumber: String,
        candidates: List<Reservation>
    ): List<Reservation> = findReservationMatches(orderNumber, candidates)

    fun matchReasonCodes(orderNumber: String, reservation: Reservation): List<String> {
        val normalized = RawCommissionReportRow.normalizeId(orderNumber)
        val reasons = mutableListOf<String>()
        val byOrder = reservation.supplierOrderNumber
            ?.let { RawCommissionReportRow.normalizeId(it) } == normalized
        val byExternal = reservation.externalContractNumber
            ?.let { RawCommissionReportRow.normalizeId(it) } == normalized
        if (byOrder) reasons += "ORDER_NUMBER_MATCH"
        else if (byExternal) reasons += "EXTERNAL_CONTRACT_MATCH"
        reasons += "SUPPLIER_MATCH"
        reasons += "DEPARTURE_BEFORE_CUTOFF"
        return reasons
    }

    fun matchReasonHebrew(code: String): String = when (code) {
        "ORDER_NUMBER_MATCH" -> "מספר הזמנה תואם"
        "EXTERNAL_CONTRACT_MATCH" -> "מספר חוזה חיצוני תואם"
        "SUPPLIER_MATCH" -> "ספק תואם"
        "DEPARTURE_BEFORE_CUTOFF" -> "תאריך יציאה בטווח החיתוך"
        else -> code
    }

    private fun findReservationMatches(
        orderNumber: String,
        candidates: List<Reservation>
    ): List<Reservation> {
        val normalized = RawCommissionReportRow.normalizeId(orderNumber)
        val byOrder = candidates.filter {
            it.supplierOrderNumber?.let { n -> RawCommissionReportRow.normalizeId(n) } == normalized
        }
        if (byOrder.isNotEmpty()) return byOrder
        return candidates.filter {
            it.externalContractNumber?.let { n -> RawCommissionReportRow.normalizeId(n) } == normalized
        }
    }

    private fun customerNameMismatch(supplierName: String, customer: Customer?): Boolean {
        if (customer == null) return false
        val appName = normalizeName("${customer.firstName} ${customer.lastName}")
        val supplier = normalizeName(supplierName)
        if (appName.isEmpty() || supplier.isEmpty()) return false
        return appName != supplier && !appName.contains(supplier) && !supplier.contains(appName)
    }

    private fun normalizeName(value: String): String =
        value.trim().lowercase().replace(Regex("\\s+"), " ")

    private fun hasReturnDateConflict(reservation: Reservation, proposed: LocalDate?): Boolean {
        if (proposed == null) return false
        val existing = reservation.actualReturnDate ?: return false
        val existingDate = CommissionBusinessDates.toLocalDate(existing)
        return existingDate != proposed
    }

    private fun stableIdFor(event: CommissionInstallment, reservation: Reservation): String {
        val start = CommissionBusinessDates.toLocalDate(event.periodStart)
        val end = CommissionBusinessDates.toLocalDate(event.periodEnd)
        return when (event.eventType) {
            CommissionEventType.MONTHLY_CYCLE.name ->
                CommissionSettlementIds.monthlyCycle(reservation.id, start, end)
            CommissionEventType.FINAL_REMAINDER.name ->
                CommissionSettlementIds.finalRemainder(reservation.id, start, end)
            else ->
                CommissionSettlementIds.finalRental(reservation.id, start, end)
        }
    }

    private fun baseItem(
        input: Input,
        group: NormalizedSupplierGroup,
        matchStatus: ReconciliationMatchStatus,
        lifecycle: CommissionLifecycleClassification,
        explanation: String?,
        reservationId: Long? = null,
        proposedReturn: LocalDate? = null,
        internal: CommissionInstallment? = null,
        deviation: MoneyDecimal? = null
    ): CommissionReconciliationItem {
        val internalAmount = internal?.let { MoneyDecimal.fromLegacyDouble(it.amount) }
        val dev = deviation ?: internalAmount?.let { group.commissionAmount.minus(it) }
        return CommissionReconciliationItem(
            importId = input.importId,
            supplierId = input.supplier.id,
            normalizedGroupKey = group.groupKey,
            reservationId = reservationId,
            internalEventId = internal?.id,
            supplierOrderNumber = group.orderNumber,
            supplierInvoiceNumber = group.invoiceNumber,
            supplierCustomerName = group.customerName,
            supplierDays = group.totalDays,
            supplierRevenue = group.revenueExVat.toExactString(),
            supplierPercent = group.commissionPercent?.toExactString(),
            supplierCommission = group.commissionAmount.toExactString(),
            internalPeriodStart = internal?.periodStart,
            internalPeriodEnd = internal?.periodEnd,
            internalDays = internal?.numberOfDays,
            internalPercent = internal?.commissionPercent?.let { MoneyDecimal.fromLegacyDouble(it).toExactString() },
            internalCommission = internalAmount?.toExactString(),
            deviation = dev?.toExactString(),
            matchStatus = matchStatus.name,
            lifecycleClassification = lifecycle.name,
            proposedActualReturnDate = proposedReturn?.let { CommissionBusinessDates.toStartOfDayMillis(it) },
            approvalState = ReconciliationApprovalState.PENDING.name,
            explanation = explanation,
            eventType = internal?.eventType,
            userUid = input.userUid
        )
    }

    private fun enrichWithReservation(
        item: CommissionReconciliationItem,
        reservation: Reservation,
        customer: Customer?,
        event: CommissionInstallment?
    ): CommissionReconciliationItem = item.copy(
        reservationId = reservation.id,
        appCustomerName = customer?.let { "${it.firstName} ${it.lastName}".trim() },
        appSupplierOrderNumber = reservation.supplierOrderNumber ?: reservation.externalContractNumber,
        appDateFrom = reservation.dateFrom,
        appActualReturnDate = reservation.actualReturnDate,
        internalEventId = event?.id ?: item.internalEventId,
        internalPeriodStart = event?.periodStart ?: item.internalPeriodStart,
        internalPeriodEnd = event?.periodEnd ?: item.internalPeriodEnd,
        internalDays = event?.numberOfDays ?: item.internalDays,
        internalPercent = event?.commissionPercent?.let {
            MoneyDecimal.fromLegacyDouble(it).toExactString()
        } ?: item.internalPercent,
        internalCommission = event?.let {
            MoneyDecimal.fromLegacyDouble(it.amount).toExactString()
        } ?: item.internalCommission,
        eventType = event?.eventType ?: item.eventType
    )

    private fun defaultExplanation(
        status: ReconciliationMatchStatus,
        nameWarning: Boolean,
        returnConflict: Boolean
    ): String = buildString {
        append(status.name)
        if (nameWarning) append(" | אזהרת שם לקוח")
        if (returnConflict) append(" | התנגשות תאריך החזרה")
    }

    fun computeKpis(
        items: List<CommissionReconciliationItem>,
        groups: List<NormalizedSupplierGroup>
    ): ReconciliationKpis {
        val supplierTotal = groups.fold(MoneyDecimal.ZERO) { acc, g -> acc.plus(g.commissionAmount) }
        val internalTotal = items.mapNotNull { it.internalCommission }
            .fold(MoneyDecimal.ZERO) { acc, s ->
                acc.plus(MoneyDecimal.ofNullable(s) ?: MoneyDecimal.ZERO)
            }
        // Avoid double-counting multi-event internals for KPI supplier side — use groups
        val uniqueInternal = items
            .filter { it.lifecycleClassification != CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name }
            .mapNotNull { item ->
                item.internalEventId to (MoneyDecimal.ofNullable(item.internalCommission) ?: MoneyDecimal.ZERO)
            }
            .distinctBy { it.first }
            .fold(MoneyDecimal.ZERO) { acc, pair -> acc.plus(pair.second) }

        fun count(status: ReconciliationMatchStatus) =
            items.count { it.matchStatus == status.name }

        fun countLifecycle(lifecycle: CommissionLifecycleClassification) =
            items.count { it.lifecycleClassification == lifecycle.name }

        return ReconciliationKpis(
            supplierCommissionTotal = supplierTotal,
            internalCommissionTotal = uniqueInternal,
            deviationTotal = supplierTotal.minus(uniqueInternal),
            fullMatches = count(ReconciliationMatchStatus.FULL_MATCH),
            amountMismatches = count(ReconciliationMatchStatus.AMOUNT_MISMATCH),
            daysMismatches = count(ReconciliationMatchStatus.DAYS_MISMATCH),
            supplierOnly = count(ReconciliationMatchStatus.SUPPLIER_ONLY),
            applicationOnly = count(ReconciliationMatchStatus.APPLICATION_ONLY),
            alreadySettled = count(ReconciliationMatchStatus.ALREADY_SETTLED),
            openMonthly30 = countLifecycle(CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE),
            finalClosures = countLifecycle(CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT),
            historicalCandidates = countLifecycle(CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE),
            needsReview = count(ReconciliationMatchStatus.NEEDS_REVIEW) +
                count(ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES) +
                count(ReconciliationMatchStatus.INVALID_SUPPLIER_GROUP)
        )
    }

    fun formatCutoffLabel(cutoff: LocalDate): String {
        val fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")
        return "כלול יציאות לפני ${cutoff.format(fmt)}"
    }

    fun cutoffForReportMonth(yearMonth: YearMonth): LocalDate = yearMonth.atDay(1)
}
