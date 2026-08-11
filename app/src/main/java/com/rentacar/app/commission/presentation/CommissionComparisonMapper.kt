package com.rentacar.app.commission.presentation

import com.rentacar.app.commission.domain.CommissionLifecycleClassification
import com.rentacar.app.commission.domain.ReconciliationMatchStatus
import com.rentacar.app.commission.money.MoneyDecimal
import com.rentacar.app.data.CommissionReconciliationItem
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.SupplierPriceListItem
import java.math.BigDecimal

enum class PaymentDifferenceDirection {
    MATCH,
    UNDERPAID,
    OVERPAID,
    NOT_COMPARABLE
}

/**
 * Canonical comparison amounts for one supplier report group.
 *
 * signedDifference = supplierReportedAmount - internalCurrentPayableAmount
 *
 * [internalCurrentPayableAmount] is the sum of unpaid sibling event commissions for the
 * group — never a single installment mistaken for the full application total.
 */
data class CommissionComparisonPresentation(
    val groupKey: String,
    val sourceItems: List<CommissionReconciliationItem>,
    val primaryItem: CommissionReconciliationItem,
    val supplierReportedAmount: MoneyDecimal?,
    val internalLifecycleTotal: MoneyDecimal?,
    val previouslySettledAmount: MoneyDecimal,
    val previouslySettledKnown: Boolean,
    val priorSettlementHint: Boolean,
    val internalCurrentPayableAmount: MoneyDecimal?,
    val signedDifference: MoneyDecimal?,
    val absoluteDifference: MoneyDecimal?,
    val direction: PaymentDifferenceDirection,
    val directionTitleHebrew: String,
    val explanationHebrew: String,
    val calculationDetailHebrew: String,
    val reasonHebrew: String,
    val lifecycleBadgeHebrew: String,
    val supplierPercentFormatted: String,
    val eventBreakdownHebrew: String,
    val financialMappingUnresolved: Boolean,
    val selectableItemIds: Set<Long>,
    val pricing: RentalPricingPresentation? = null
) {
    val supplierOrderNumber: String? get() = primaryItem.supplierOrderNumber
    val customerName: String?
        get() = primaryItem.appCustomerName ?: primaryItem.supplierCustomerName
    val reservationId: Long? get() = primaryItem.reservationId

    val openReservationRoute: String?
        get() = com.rentacar.app.ui.navigation.CommissionReconciliationNavigation
            .editReservationRoute(reservationId)

    val canOpenReservation: Boolean
        get() = openReservationRoute != null

    /** True when UI must not expose raw event-type enums. */
    val hasRawEnumExposure: Boolean
        get() = eventBreakdownHebrew.contains("MONTHLY_CYCLE") ||
            eventBreakdownHebrew.contains("FINAL_REMAINDER") ||
            lifecycleBadgeHebrew.contains("_")
}

data class PaymentDifferenceTotals(
    val supplierTotal: MoneyDecimal,
    val applicationPayableTotal: MoneyDecimal,
    val netSignedDifference: MoneyDecimal,
    val grossUnderpaid: MoneyDecimal,
    val grossOverpaid: MoneyDecimal,
    val underpaidCount: Int,
    val overpaidCount: Int,
    val matchCount: Int,
    val notComparableCount: Int,
    val needsReviewCount: Int
) {
    val netMeaningHebrew: String
        get() = when {
            netSignedDifference.abs() <= MoneyDecimal.DEFAULT_TOLERANCE -> "אין פער נטו"
            netSignedDifference < MoneyDecimal.ZERO ->
                "בסך הכול חסרים ${FinancialDisplayFormatter.formatMoney(netSignedDifference.abs())}"
            else ->
                "בסך הכול שולם ביתר ${FinancialDisplayFormatter.formatMoney(netSignedDifference.abs())}"
        }

    val netHeadlineHebrew: String
        get() = when {
            netSignedDifference.abs() <= MoneyDecimal.DEFAULT_TOLERANCE -> "אין פער נטו"
            netSignedDifference < MoneyDecimal.ZERO ->
                "חסר לתשלום בסך ${FinancialDisplayFormatter.formatMoney(netSignedDifference.abs())}"
            else ->
                "שולם ביתר בסך ${FinancialDisplayFormatter.formatMoney(netSignedDifference.abs())}"
        }
}

object CommissionComparisonMapper {

    fun groupKey(item: CommissionReconciliationItem): String {
        item.normalizedGroupKey?.takeIf { it.isNotBlank() }?.let { return it }
        return listOf(
            item.supplierOrderNumber.orEmpty(),
            item.supplierInvoiceNumber.orEmpty(),
            item.reservationId?.toString().orEmpty(),
            item.id.toString()
        ).joinToString("|")
    }

    fun buildPresentations(
        items: List<CommissionReconciliationItem>,
        previouslySettledByReservation: Map<Long, MoneyDecimal> = emptyMap(),
        reservationsById: Map<Long, Reservation> = emptyMap(),
        priceListByReservationId: Map<Long, Pair<SupplierPriceListItem?, Boolean>> = emptyMap()
    ): List<CommissionComparisonPresentation> {
        if (items.isEmpty()) return emptyList()
        return items
            .groupBy { groupKey(it) }
            .values
            .map { siblings ->
                buildPresentation(
                    siblings,
                    previouslySettledByReservation,
                    reservationsById,
                    priceListByReservationId
                )
            }
    }

    fun buildPresentation(
        siblings: List<CommissionReconciliationItem>,
        previouslySettledByReservation: Map<Long, MoneyDecimal> = emptyMap(),
        reservationsById: Map<Long, Reservation> = emptyMap(),
        priceListByReservationId: Map<Long, Pair<SupplierPriceListItem?, Boolean>> = emptyMap()
    ): CommissionComparisonPresentation {
        require(siblings.isNotEmpty())
        val primary = pickPrimary(siblings)
        val key = groupKey(primary)

        val supplierAmounts = siblings.mapNotNull { MoneyDecimal.ofNullable(it.supplierCommission) }
            .distinctBy { it.value.stripTrailingZeros() }
        val supplierReported = supplierAmounts.singleOrNull()
            ?: supplierAmounts.firstOrNull()

        val eventAmounts = siblings.mapNotNull { item ->
            val eventId = item.internalEventId ?: return@mapNotNull null
            val amount = MoneyDecimal.ofNullable(item.internalCommission) ?: return@mapNotNull null
            eventId to amount
        }.distinctBy { it.first }

        val lifecycleTotal = if (eventAmounts.isNotEmpty()) {
            eventAmounts.fold(MoneyDecimal.ZERO) { acc, pair -> acc.plus(pair.second) }
        } else {
            MoneyDecimal.ofNullable(primary.internalCommission)
        }

        val reservationId = primary.reservationId
        val settledFromLedger = reservationId?.let { previouslySettledByReservation[it] }
        val priorHint = siblings.any { item ->
            val e = item.explanation.orEmpty()
            e.contains("כבר סולק") || e.contains("כבר אושר") || e.contains("יומן הסליקה")
        } || primary.matchStatus == ReconciliationMatchStatus.ALREADY_SETTLED.name

        val previouslySettled = settledFromLedger ?: MoneyDecimal.ZERO
        val previouslySettledKnown = settledFromLedger != null

        val currentPayable = when {
            lifecycleTotal == null -> null
            previouslySettledKnown -> {
                val remaining = lifecycleTotal.minus(previouslySettled)
                if (remaining < MoneyDecimal.ZERO) MoneyDecimal.ZERO else remaining
            }
            else -> lifecycleTotal
        }

        val mappingUnresolved = supplierAmounts.size > 1 ||
            (isMatchedStatus(primary) && (supplierReported == null || currentPayable == null))

        val directionResult = classify(
            matchStatus = primary.matchStatus,
            supplier = supplierReported,
            payable = currentPayable,
            mappingUnresolved = mappingUnresolved
        )

        val reservation = reservationId?.let { reservationsById[it] }
        val pricePair = reservationId?.let { priceListByReservationId[it] }
        val pricing = RentalPricingMapper.build(
            supplierRevenueExVatText = primary.supplierRevenue,
            reservation = reservation,
            priceListItem = pricePair?.first,
            priceListMatchedPeriod = pricePair?.second == true,
            applicationCommissionPercentText = primary.internalPercent
        )

        val financialUnresolved = mappingUnresolved ||
            (directionResult.direction == PaymentDifferenceDirection.NOT_COMPARABLE &&
                isMatchedStatus(primary)) ||
            pricing.pricingNeedsReview

        val lifecycleBadge = lifecycleBadgeHebrew(primary)
        val reason = reasonHebrew(primary, eventAmounts.size, pricing)
        val eventBreakdown = eventBreakdownHebrew(siblings)
        val calcDetail = calculationDetailHebrew(
            direction = directionResult.direction,
            supplier = supplierReported,
            payable = currentPayable,
            absolute = directionResult.absolute
        )
        val explanation = listOfNotNull(
            directionResult.explanation.takeIf { it.isNotBlank() },
            pricing.explanationHebrew.takeIf { it.isNotBlank() }
        ).joinToString(" ")

        return CommissionComparisonPresentation(
            groupKey = key,
            sourceItems = siblings,
            primaryItem = primary,
            supplierReportedAmount = supplierReported,
            internalLifecycleTotal = lifecycleTotal,
            previouslySettledAmount = previouslySettled,
            previouslySettledKnown = previouslySettledKnown,
            priorSettlementHint = priorHint && !previouslySettledKnown,
            internalCurrentPayableAmount = currentPayable,
            signedDifference = directionResult.signed,
            absoluteDifference = directionResult.absolute,
            direction = directionResult.direction,
            directionTitleHebrew = directionResult.title,
            explanationHebrew = explanation,
            calculationDetailHebrew = calcDetail,
            reasonHebrew = reason,
            lifecycleBadgeHebrew = lifecycleBadge,
            supplierPercentFormatted = FinancialDisplayFormatter.formatPercent(primary.supplierPercent),
            eventBreakdownHebrew = eventBreakdown,
            financialMappingUnresolved = financialUnresolved,
            selectableItemIds = siblings.map { it.id }.filter { it != 0L }.toSet(),
            pricing = pricing
        )
    }

    fun computeTotals(
        presentations: List<CommissionComparisonPresentation>
    ): PaymentDifferenceTotals {
        var supplierTotal = MoneyDecimal.ZERO
        var payableTotal = MoneyDecimal.ZERO
        var underpaid = MoneyDecimal.ZERO
        var overpaid = MoneyDecimal.ZERO
        var underCount = 0
        var overCount = 0
        var matchCount = 0
        var notComparable = 0
        var needsReview = 0

        presentations.forEach { p ->
            p.supplierReportedAmount?.let { supplierTotal = supplierTotal.plus(it) }
            p.internalCurrentPayableAmount?.let { payableTotal = payableTotal.plus(it) }
            when (p.direction) {
                PaymentDifferenceDirection.UNDERPAID -> {
                    underCount++
                    underpaid = underpaid.plus(p.absoluteDifference ?: MoneyDecimal.ZERO)
                }
                PaymentDifferenceDirection.OVERPAID -> {
                    overCount++
                    overpaid = overpaid.plus(p.absoluteDifference ?: MoneyDecimal.ZERO)
                }
                PaymentDifferenceDirection.MATCH -> matchCount++
                PaymentDifferenceDirection.NOT_COMPARABLE -> {
                    notComparable++
                    if (isNeedsReviewStatus(p.primaryItem.matchStatus)) needsReview++
                }
            }
            if (p.financialMappingUnresolved) needsReview++
        }

        return PaymentDifferenceTotals(
            supplierTotal = supplierTotal,
            applicationPayableTotal = payableTotal,
            netSignedDifference = supplierTotal.minus(payableTotal),
            grossUnderpaid = underpaid,
            grossOverpaid = overpaid,
            underpaidCount = underCount,
            overpaidCount = overCount,
            matchCount = matchCount,
            notComparableCount = notComparable,
            needsReviewCount = needsReview
        )
    }

    fun classifyPaymentDifference(
        supplierAmount: MoneyDecimal,
        applicationAmount: MoneyDecimal
    ): PaymentDifferenceDirection {
        val signed = supplierAmount.minus(applicationAmount)
        return when {
            signed.abs() <= MoneyDecimal.DEFAULT_TOLERANCE -> PaymentDifferenceDirection.MATCH
            signed < MoneyDecimal.ZERO -> PaymentDifferenceDirection.UNDERPAID
            else -> PaymentDifferenceDirection.OVERPAID
        }
    }

    private data class DirectionResult(
        val direction: PaymentDifferenceDirection,
        val signed: MoneyDecimal?,
        val absolute: MoneyDecimal?,
        val title: String,
        val explanation: String
    )

    private fun classify(
        matchStatus: String,
        supplier: MoneyDecimal?,
        payable: MoneyDecimal?,
        mappingUnresolved: Boolean
    ): DirectionResult {
        when (matchStatus) {
            ReconciliationMatchStatus.SUPPLIER_ONLY.name ->
                return DirectionResult(
                    PaymentDifferenceDirection.NOT_COMPARABLE,
                    null,
                    null,
                    "תשלום ספק ללא התאמה",
                    "הספק דיווח על עמלה שלא נמצאה לה התאמה באפליקציה"
                )
            ReconciliationMatchStatus.APPLICATION_ONLY.name ->
                return DirectionResult(
                    PaymentDifferenceDirection.NOT_COMPARABLE,
                    null,
                    null,
                    "לא הופיע בדוח הספק",
                    "עמלה צפויה באפליקציה שלא נמצאה בדוח הספק · חשד לחוסר תשלום"
                )
            ReconciliationMatchStatus.ALREADY_SETTLED.name ->
                return DirectionResult(
                    PaymentDifferenceDirection.NOT_COMPARABLE,
                    null,
                    null,
                    "כבר שולם",
                    "אירועי העמלה הרלוונטיים כבר אושרו ביומן הסליקה"
                )
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name,
            ReconciliationMatchStatus.INVALID_SUPPLIER_GROUP.name,
            ReconciliationMatchStatus.RETURN_DATE_CONFLICT.name,
            ReconciliationMatchStatus.NEEDS_REVIEW.name,
            ReconciliationMatchStatus.POSSIBLE_DUPLICATE_PAYMENT.name ->
                return DirectionResult(
                    PaymentDifferenceDirection.NOT_COMPARABLE,
                    if (supplier != null && payable != null) supplier.minus(payable) else null,
                    if (supplier != null && payable != null) supplier.absDeviation(payable) else null,
                    "דורש בדיקה",
                    "לא ניתן לקבוע כיוון תשלום לפני בדיקה"
                )
        }

        if (mappingUnresolved || supplier == null || payable == null) {
            return DirectionResult(
                PaymentDifferenceDirection.NOT_COMPARABLE,
                null,
                null,
                "דורש בדיקה",
                "מיפוי הסכומים אינו חד־משמעי — לא ניתן לסווג חסר/יתר"
            )
        }

        val signed = supplier.minus(payable)
        val absolute = signed.abs()
        return when {
            absolute <= MoneyDecimal.DEFAULT_TOLERANCE -> DirectionResult(
                PaymentDifferenceDirection.MATCH,
                signed,
                absolute,
                "תואם",
                "הספק שילם בהתאם לחישוב האפליקציה"
            )
            signed < MoneyDecimal.ZERO -> DirectionResult(
                PaymentDifferenceDirection.UNDERPAID,
                signed,
                absolute,
                "שולם בחסר",
                "שגריר שילמה פחות מהסכום המחושב באפליקציה"
            )
            else -> DirectionResult(
                PaymentDifferenceDirection.OVERPAID,
                signed,
                absolute,
                "שולם ביתר",
                "שגריר שילמה יותר מהסכום המחושב באפליקציה"
            )
        }
    }

    private fun pickPrimary(siblings: List<CommissionReconciliationItem>): CommissionReconciliationItem {
        return siblings.firstOrNull {
            it.eventType == "FINAL_REMAINDER" || it.eventType == "FINAL_RENTAL"
        } ?: siblings.maxByOrNull { it.id } ?: siblings.first()
    }

    private fun isMatchedStatus(item: CommissionReconciliationItem): Boolean {
        return item.matchStatus !in setOf(
            ReconciliationMatchStatus.SUPPLIER_ONLY.name,
            ReconciliationMatchStatus.APPLICATION_ONLY.name
        ) && item.reservationId != null
    }

    private fun isNeedsReviewStatus(status: String): Boolean =
        status in setOf(
            ReconciliationMatchStatus.NEEDS_REVIEW.name,
            ReconciliationMatchStatus.MULTIPLE_RESERVATION_MATCHES.name,
            ReconciliationMatchStatus.RETURN_DATE_CONFLICT.name,
            ReconciliationMatchStatus.INVALID_SUPPLIER_GROUP.name,
            ReconciliationMatchStatus.POSSIBLE_DUPLICATE_PAYMENT.name
        )

    private fun lifecycleBadgeHebrew(item: CommissionReconciliationItem): String =
        when (item.lifecycleClassification) {
            CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name ->
                "מחזור 30 יום — נשאר פתוח"
            CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name ->
                "סגירה סופית"
            CommissionLifecycleClassification.HISTORICAL_BASELINE_CANDIDATE.name ->
                "בסיס היסטורי"
            CommissionLifecycleClassification.DAILY_WEEKLY_FINAL_SETTLEMENT.name ->
                "סגירת השכרה"
            else -> ""
        }

    private fun reasonHebrew(
        item: CommissionReconciliationItem,
        eventCount: Int,
        pricing: RentalPricingPresentation? = null
    ): String {
        val parts = mutableListOf<String>()
        when (item.matchStatus) {
            ReconciliationMatchStatus.DAYS_MISMATCH.name -> parts += "מספר ימים שונה"
            ReconciliationMatchStatus.RATE_MISMATCH.name -> parts += "אחוז עמלה שונה"
            ReconciliationMatchStatus.AMOUNT_MISMATCH.name -> parts += "בסיס הכנסה או סכום עמלה שונה"
            ReconciliationMatchStatus.SUPPLIER_ONLY.name -> parts += "אין התאמה להזמנה"
            ReconciliationMatchStatus.APPLICATION_ONLY.name -> parts += "אין שורה מקבילה בדוח הספק"
            ReconciliationMatchStatus.ALREADY_SETTLED.name -> parts += "מחזור 30 יום כבר שולם"
            ReconciliationMatchStatus.POSSIBLE_DUPLICATE_PAYMENT.name ->
                parts += "חשד לתשלום כפול מול מחזור שכבר סולק"
        }
        if (item.lifecycleClassification ==
            CommissionLifecycleClassification.FINAL_MONTHLY_SETTLEMENT.name && eventCount > 1
        ) {
            parts += "יתרת סיום חודשית"
        }
        if (item.lifecycleClassification ==
            CommissionLifecycleClassification.OPEN_MONTHLY_30_DAY_CYCLE.name
        ) {
            parts += "מחזור 30 יום"
        }
        pricing?.tariffTransitionHebrew?.let { parts += it }
        return parts.distinct().joinToString(" · ").ifBlank { "—" }
    }

    private fun eventBreakdownHebrew(siblings: List<CommissionReconciliationItem>): String {
        val parts = siblings.mapNotNull { item ->
            val type = when (item.eventType) {
                "MONTHLY_CYCLE" -> "מחזור 30 יום"
                "FINAL_REMAINDER" -> "יתרת סיום"
                "FINAL_RENTAL" -> "השכרה סופית"
                else -> null
            } ?: return@mapNotNull null
            val days = item.internalDays?.let { "$it ימים" }
            val amount = MoneyDecimal.ofNullable(item.internalCommission)
                ?.let { FinancialDisplayFormatter.formatMoney(it) }
            listOfNotNull(type, days, amount).joinToString(" · ")
        }.distinct()
        return when {
            parts.isEmpty() -> ""
            parts.size == 1 -> "החישוב כולל ${parts.single()}"
            else -> "החישוב כולל " + parts.joinToString(" ו")
        }
    }

    private fun calculationDetailHebrew(
        direction: PaymentDifferenceDirection,
        supplier: MoneyDecimal?,
        payable: MoneyDecimal?,
        absolute: MoneyDecimal?
    ): String {
        if (supplier == null || payable == null || absolute == null) return ""
        val supplierLine = "הספק דיווח: ${FinancialDisplayFormatter.formatMoney(supplier)}"
        val appLine = "האפליקציה חישבה: ${FinancialDisplayFormatter.formatMoney(payable)}"
        val gapLine = when (direction) {
            PaymentDifferenceDirection.UNDERPAID ->
                "הפרש: ${FinancialDisplayFormatter.formatMoney(absolute)} בחסר"
            PaymentDifferenceDirection.OVERPAID ->
                "הפרש: ${FinancialDisplayFormatter.formatMoney(absolute)} ביתר"
            PaymentDifferenceDirection.MATCH ->
                "הפרש: אין פער כספי"
            PaymentDifferenceDirection.NOT_COMPARABLE ->
                "הפרש: לא ניתן להשוואה"
        }
        return listOf(supplierLine, appLine, gapLine).joinToString("\n")
    }
}
