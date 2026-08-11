package com.rentacar.app.domain

import com.rentacar.app.commission.domain.CommissionEventType
import com.rentacar.app.commission.domain.SupplierCommissionTerms
import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * Service for calculating commission installments based on business rules.
 *
 * Commission timing is driven ONLY by [Reservation.actualReturnDate] interpreted as a business
 * [LocalDate] (daily/weekly), or completed 30-day rental cycles (monthly). Never by createdAt,
 * updatedAt, planned return date, or import date.
 *
 * Calendar boundaries use Asia/Jerusalem via [CommissionBusinessDates].
 *
 * Closing monthly remainders are opt-in via [CommissionCalcOptions.includeClosingRemainder]
 * so existing public payout behavior stays unchanged by default.
 */
object CommissionCalculationService {
    private const val CYCLE_DAYS = 30

    /** Existing system convention: sync maps long rentals to periodTypeDays=24 as monthly. */
    private const val LEGACY_MONTHLY_PERIOD_TYPE_DAYS = 24
    private const val MONTHLY_PERIOD_TYPE_DAYS = 30

    /**
     * Overridable in unit tests to pin the current business date for open monthly rentals.
     * Never persisted — used only to determine which 30-day cycles have completed.
     */
    internal var currentDateProvider: () -> LocalDate = {
        LocalDate.now(CommissionBusinessDates.TIMEZONE)
    }

    /**
     * Monthly rentals use rolling 30-day cycles.
     * [MONTHLY_PERIOD_TYPE_DAYS] is the explicit monthly marker in the UI.
     * [LEGACY_MONTHLY_PERIOD_TYPE_DAYS] is the legacy/sync convention for monthly rentals
     * (see [com.rentacar.app.sync.ReservationSyncService.calculatePeriodType]) — treated identically.
     */
    fun isMonthlyRental(reservation: Reservation): Boolean =
        reservation.periodTypeDays == MONTHLY_PERIOD_TYPE_DAYS ||
            reservation.periodTypeDays == LEGACY_MONTHLY_PERIOD_TYPE_DAYS

    /** Commission end as a business date, or null when the rental is still open. */
    fun getCommissionEndLocalDate(reservation: Reservation): LocalDate? =
        reservation.actualReturnDate?.let { CommissionBusinessDates.toLocalDate(it) }

    /** @see getCommissionEndLocalDate */
    fun getCommissionEndDate(reservation: Reservation): Long? = reservation.actualReturnDate

    fun commissionMonthForEventDate(eventDate: LocalDate): YearMonth =
        YearMonth.from(eventDate).plusMonths(1)

    private fun rentalStartDate(reservation: Reservation): LocalDate =
        CommissionBusinessDates.toLocalDate(reservation.dateFrom)

    private fun daysBetweenInclusive(start: LocalDate, end: LocalDate): Int =
        ChronoUnit.DAYS.between(start, end).toInt().coerceAtLeast(0) + 1

    fun computeEarliestPayoutMonth(
        reservations: List<Reservation>,
        supplierId: Long? = null
    ): YearMonth? {
        val eligible = reservations.filter {
            (supplierId == null || it.supplierId == supplierId) &&
                it.status != ReservationStatus.Cancelled
        }
        return eligible.flatMap { calculateAllInstallmentsForReservation(it) }
            .mapNotNull { runCatching { YearMonth.parse(it.payoutMonth) }.getOrNull() }
            .minOrNull()
    }

    fun calculateCommissionInstallmentsForPayoutMonth(
        payoutMonth: String,
        reservations: List<Reservation>,
        supplierFilter: Long? = null,
        statusFilter: ReservationStatus? = null,
        options: CommissionCalcOptions = CommissionCalcOptions.DEFAULT
    ): List<CommissionInstallment> {
        val payoutYearMonth = try {
            val parts = payoutMonth.split("-")
            YearMonth.of(parts[0].toInt(), parts[1].toInt())
        } catch (_: Exception) {
            return emptyList()
        }

        val serviceYearMonth = payoutYearMonth.minusMonths(1)
        val installments = mutableListOf<CommissionInstallment>()

        for (reservation in reservations) {
            if (supplierFilter != null && reservation.supplierId != supplierFilter) continue

            if (statusFilter != null) {
                if (reservation.status != statusFilter) continue
            } else if (reservation.status == ReservationStatus.Cancelled) {
                continue
            }

            val capOverride = options.commissionCapByReservationId[reservation.id]
            val effectiveEnd = effectiveCommissionEnd(reservation, capOverride)

            if (isMonthlyRental(reservation)) {
                installments.addAll(
                    calculateMonthlyRentalInstallments(
                        reservation = reservation,
                        serviceYearMonth = serviceYearMonth,
                        payoutMonth = payoutMonth,
                        commissionEndDate = effectiveEnd,
                        options = options
                    )
                )
            } else {
                val returnDate = effectiveEnd ?: continue
                val installment = calculateSingleCommission(
                    reservation = reservation,
                    serviceYearMonth = serviceYearMonth,
                    payoutMonth = payoutMonth,
                    returnDate = returnDate,
                    options = options
                )
                if (installment != null) installments.add(installment)
            }
        }

        return installments
            .filter { it.payoutMonth == payoutMonth }
            .distinctBy { it.id }
    }

    private fun getBasePriceExVat(reservation: Reservation): Double {
        val vatPct = reservation.vatPercentAtCreation ?: 17.0
        return if (reservation.includeVat) {
            reservation.agreedPrice / (1 + vatPct / 100.0)
        } else {
            reservation.agreedPrice
        }
    }

    private fun effectiveCommissionEnd(
        reservation: Reservation,
        commissionCapDate: LocalDate?
    ): LocalDate? {
        val actual = getCommissionEndLocalDate(reservation)
        return when {
            commissionCapDate == null -> actual
            actual == null -> commissionCapDate
            else -> minOf(actual, commissionCapDate)
        }
    }

    private fun calculateSingleCommission(
        reservation: Reservation,
        serviceYearMonth: YearMonth,
        payoutMonth: String,
        returnDate: LocalDate,
        options: CommissionCalcOptions
    ): CommissionInstallment? {
        if (YearMonth.from(returnDate) != serviceYearMonth) return null

        val periodStartDate = rentalStartDate(reservation)
        val periodEndDate = returnDate
        val days = daysBetweenInclusive(periodStartDate, periodEndDate)
        val plannedDays = daysBetweenInclusive(
            rentalStartDate(reservation),
            CommissionBusinessDates.toLocalDate(reservation.dateTo)
        ).coerceAtLeast(1)
        val basePriceExVat = getBasePriceExVat(reservation)
        val dailyRate = basePriceExVat / plannedDays
        val periodPrice = dailyRate * days
        val commissionResult = CommissionCalculator.calculate(days, periodPrice, options.terms)

        return CommissionInstallment(
            id = CommissionInstallment.generateId(reservation.id, periodStartDate, periodEndDate),
            orderId = reservation.id,
            isMonthlyRental = false,
            periodStart = CommissionBusinessDates.toStartOfDayMillis(periodStartDate),
            periodEnd = CommissionBusinessDates.toStartOfDayMillis(periodEndDate),
            payoutMonth = payoutMonth,
            amount = commissionResult.amount,
            eventType = CommissionEventType.FINAL_RENTAL.name,
            numberOfDays = days,
            commissionPercent = commissionResult.percent * 100.0,
            cycleNumber = null
        )
    }

    /**
     * Monthly: one commission per completed 30-day cycle (cycleEnd = cycleStart + 29 calendar days).
     * Open rentals cap completed cycles at the current business date — no future cycles are created.
     *
     * When [CommissionCalcOptions.includeClosingRemainder] is true and the rental has a known end,
     * a final partial remainder after full cycles is also emitted using the monthly percentage.
     */
    private fun calculateMonthlyRentalInstallments(
        reservation: Reservation,
        serviceYearMonth: YearMonth,
        payoutMonth: String,
        commissionEndDate: LocalDate?,
        options: CommissionCalcOptions
    ): List<CommissionInstallment> {
        val installments = mutableListOf<CommissionInstallment>()
        val completionCap = commissionEndDate ?: currentDateProvider()
        val plannedDays = daysBetweenInclusive(
            rentalStartDate(reservation),
            CommissionBusinessDates.toLocalDate(reservation.dateTo)
        ).coerceAtLeast(1)
        val basePriceExVat = getBasePriceExVat(reservation)
        val dailyRate = basePriceExVat / plannedDays
        val monthlyPercentPoints = (options.terms?.days24plusPercent ?: 7).toDouble()
        val monthlyRate = monthlyPercentPoints / 100.0

        var cycleStart = rentalStartDate(reservation)
        var cycleNumber = 0
        while (true) {
            val cycleEnd = cycleStart.plusDays((CYCLE_DAYS - 1).toLong())
            if (cycleEnd.isAfter(completionCap)) break

            cycleNumber++
            if (YearMonth.from(cycleEnd) == serviceYearMonth) {
                val periodPrice = dailyRate * CYCLE_DAYS
                val commissionResult = CommissionCalculator.calculate(
                    days = CYCLE_DAYS,
                    price = periodPrice,
                    terms = options.terms,
                    forcePercent = monthlyRate
                )
                installments.add(
                    CommissionInstallment(
                        id = CommissionInstallment.generateId(reservation.id, cycleStart, cycleEnd),
                        orderId = reservation.id,
                        isMonthlyRental = true,
                        periodStart = CommissionBusinessDates.toStartOfDayMillis(cycleStart),
                        periodEnd = CommissionBusinessDates.toStartOfDayMillis(cycleEnd),
                        payoutMonth = payoutMonth,
                        amount = commissionResult.amount,
                        eventType = CommissionEventType.MONTHLY_CYCLE.name,
                        numberOfDays = CYCLE_DAYS,
                        commissionPercent = monthlyPercentPoints,
                        cycleNumber = cycleNumber
                    )
                )
            }
            cycleStart = cycleEnd.plusDays(1)
        }

        if (options.includeClosingRemainder && commissionEndDate != null) {
            val remainderStart = cycleStart
            if (!remainderStart.isAfter(commissionEndDate)) {
                val remainderDays = daysBetweenInclusive(remainderStart, commissionEndDate)
                if (remainderDays in 1 until CYCLE_DAYS &&
                    YearMonth.from(commissionEndDate) == serviceYearMonth
                ) {
                    val periodPrice = dailyRate * remainderDays
                    val amount = periodPrice * monthlyRate
                    installments.add(
                        CommissionInstallment(
                            id = CommissionInstallment.generateId(
                                reservation.id,
                                remainderStart,
                                commissionEndDate
                            ),
                            orderId = reservation.id,
                            isMonthlyRental = true,
                            periodStart = CommissionBusinessDates.toStartOfDayMillis(remainderStart),
                            periodEnd = CommissionBusinessDates.toStartOfDayMillis(commissionEndDate),
                            payoutMonth = payoutMonth,
                            amount = amount,
                            eventType = CommissionEventType.FINAL_REMAINDER.name,
                            numberOfDays = remainderDays,
                            commissionPercent = monthlyPercentPoints,
                            cycleNumber = null
                        )
                    )
                }
            }
        }
        return installments
    }

    fun getTotalCommission(installments: List<CommissionInstallment>): Double =
        installments.sumOf { it.amount }

    fun calculateAllInstallmentsForReservation(
        reservation: Reservation,
        options: CommissionCalcOptions = CommissionCalcOptions.DEFAULT
    ): List<CommissionInstallment> {
        if (reservation.status == ReservationStatus.Cancelled) return emptyList()

        val allPayoutMonths = linkedSetOf<YearMonth>()
        val capOverride = options.commissionCapByReservationId[reservation.id]
        val effectiveEnd = effectiveCommissionEnd(reservation, capOverride)

        if (isMonthlyRental(reservation)) {
            val completionCap = effectiveEnd ?: currentDateProvider()
            var cycleStart = rentalStartDate(reservation)
            while (true) {
                val cycleEnd = cycleStart.plusDays((CYCLE_DAYS - 1).toLong())
                if (cycleEnd.isAfter(completionCap)) {
                    if (options.includeClosingRemainder &&
                        effectiveEnd != null &&
                        !cycleStart.isAfter(effectiveEnd)
                    ) {
                        val remainderDays = daysBetweenInclusive(cycleStart, effectiveEnd)
                        if (remainderDays in 1 until CYCLE_DAYS) {
                            allPayoutMonths.add(commissionMonthForEventDate(effectiveEnd))
                        }
                    }
                    break
                }
                allPayoutMonths.add(commissionMonthForEventDate(cycleEnd))
                cycleStart = cycleEnd.plusDays(1)
            }
        } else {
            effectiveEnd?.let { returnDate ->
                allPayoutMonths.add(commissionMonthForEventDate(returnDate))
            }
        }

        return allPayoutMonths.flatMap { ym ->
            val payoutMonthStr = "${ym.year}-${ym.monthValue.toString().padStart(2, '0')}"
            calculateCommissionInstallmentsForPayoutMonth(
                payoutMonth = payoutMonthStr,
                reservations = listOf(reservation),
                supplierFilter = null,
                statusFilter = null,
                options = options
            )
        }
    }

    /**
     * Build expected commission events for reconciliation against a supplier-reported day count.
     * Does not mutate reservations. Uses a hypothetical end date when classifying final settlements.
     */
    fun calculateEventsForReconciliation(
        reservation: Reservation,
        supplierTotalDays: Int,
        terms: SupplierCommissionTerms,
        commissionCapDate: LocalDate? = null
    ): List<CommissionInstallment> {
        val start = rentalStartDate(reservation)
        val classificationDays = supplierTotalDays
        return when {
            classificationDays < 30 -> {
                val end = start.plusDays((classificationDays - 1).toLong())
                val hypothetical = reservation.copy(
                    actualReturnDate = CommissionBusinessDates.toStartOfDayMillis(end),
                    periodTypeDays = if (classificationDays >= 24) 30 else reservation.periodTypeDays
                )
                // Force daily/weekly path for <30 unless already monthly type with 24-29
                val forced = if (classificationDays in 24..29) {
                    // 24–29 uses 24+ tier as completed rental (not open monthly cycle)
                    hypothetical.copy(periodTypeDays = 1)
                } else {
                    hypothetical.copy(periodTypeDays = 1)
                }
                calculateAllInstallmentsForReservation(
                    forced,
                    CommissionCalcOptions(
                        includeClosingRemainder = false,
                        terms = terms,
                        commissionCapByReservationId = commissionCapDate?.let {
                            mapOf(reservation.id to it)
                        } ?: emptyMap()
                    )
                )
            }
            classificationDays == 30 -> {
                // Open monthly cycle — evaluate completed cycles with hypothetical cycle end
                val cycleEnd = start.plusDays(29)
                val open = reservation.copy(
                    periodTypeDays = 30,
                    actualReturnDate = null
                )
                // Pin "today" past cycle end so the cycle is considered completed, without closing
                val previousProvider = currentDateProvider
                return try {
                    currentDateProvider = { cycleEnd }
                    calculateAllInstallmentsForReservation(
                        open,
                        CommissionCalcOptions(
                            includeClosingRemainder = false,
                            terms = terms,
                            commissionCapByReservationId = commissionCapDate?.let {
                                mapOf(reservation.id to it)
                            } ?: emptyMap()
                        )
                    ).filter { it.numberOfDays == CYCLE_DAYS }
                        .take(1)
                } finally {
                    currentDateProvider = previousProvider
                }
            }
            classificationDays % 30 == 0 -> {
                // Exact multiples above 30 — not auto-interpreted
                emptyList()
            }
            else -> {
                val end = start.plusDays((classificationDays - 1).toLong())
                val closedMonthly = reservation.copy(
                    periodTypeDays = 30,
                    actualReturnDate = CommissionBusinessDates.toStartOfDayMillis(end),
                    isClosed = true
                )
                calculateAllInstallmentsForReservation(
                    closedMonthly,
                    CommissionCalcOptions(
                        includeClosingRemainder = true,
                        terms = terms,
                        commissionCapByReservationId = commissionCapDate?.let {
                            mapOf(reservation.id to it)
                        } ?: emptyMap()
                    )
                )
            }
        }
    }
}

/**
 * Options for commission calculation. Defaults preserve historical public behavior.
 */
data class CommissionCalcOptions(
    val includeClosingRemainder: Boolean = false,
    val terms: SupplierCommissionTerms? = null,
    val commissionCapByReservationId: Map<Long, LocalDate> = emptyMap()
) {
    companion object {
        val DEFAULT = CommissionCalcOptions()
    }
}
