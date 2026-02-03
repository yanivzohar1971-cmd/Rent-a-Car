package com.rentacar.app.domain

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Service for calculating commission installments based on business rules.
 *
 * Business Rules:
 * 1) Rentals < 30 days: commission is paid in the month AFTER the actual end/return date.
 * 2) Rentals >= 30 days: commission at end of every 30-day period (month AFTER each 30-day period end);
 *    when rental ends, remainder (<30 days) paid in month AFTER end/return date.
 *
 * Timezone: Asia/Jerusalem (all month boundaries in this timezone).
 */
object CommissionCalculationService {
    private val TIMEZONE = ZoneId.of("Asia/Jerusalem")
    private val THIRTY_DAYS_MILLIS = 30L * 24 * 60 * 60 * 1000

    private fun daysBetween(startMillis: Long, endMillis: Long): Int =
        TimeUnit.MILLISECONDS.toDays((endMillis - startMillis).coerceAtLeast(0)).toInt().coerceAtLeast(1)
    
    /**
     * Determines if a reservation is a monthly rental (30-day recurring commissions).
     * When closed: monthly iff actual duration (dateFrom to commission end) >= 30 days.
     * When open: monthly if periodTypeDays == 30, or actual/planned duration >= 30 days.
     */
    fun isMonthlyRental(reservation: Reservation): Boolean {
        val end = getCommissionEndDate(reservation) ?: System.currentTimeMillis()
        val actualDays = daysBetween(reservation.dateFrom, end)
        return if (getCommissionEndDate(reservation) != null) {
            actualDays >= 30
        } else {
            reservation.periodTypeDays == 30 || actualDays >= 30 ||
                (reservation.dateTo - reservation.dateFrom) >= THIRTY_DAYS_MILLIS
        }
    }
    
    /**
     * Gets the YearMonth in Asia/Jerusalem timezone from a timestamp.
     */
    private fun getYearMonth(millis: Long): YearMonth {
        val zonedDateTime = ZonedDateTime.ofInstant(Instant.ofEpochMilli(millis), TIMEZONE)
        return YearMonth.of(zonedDateTime.year, zonedDateTime.monthValue)
    }
    
    /**
     * Gets the start of a month in Asia/Jerusalem timezone.
     */
    private fun getMonthStart(yearMonth: YearMonth): Long {
        val localDate = yearMonth.atDay(1)
        val zonedDateTime = localDate.atStartOfDay(TIMEZONE)
        return zonedDateTime.toInstant().toEpochMilli()
    }
    
    /**
     * Gets the end of a month in Asia/Jerusalem timezone.
     */
    private fun getMonthEnd(yearMonth: YearMonth): Long {
        val localDate = yearMonth.atEndOfMonth()
        val zonedDateTime = localDate.atTime(23, 59, 59, 999_999_999).atZone(TIMEZONE)
        return zonedDateTime.toInstant().toEpochMilli()
    }
    
    /**
     * Single source of truth for "commission end date" (return/close date).
     * - If actualReturnDate != null => use it.
     * - Else if isClosed => use updatedAt (if >0) else dateTo.
     * - Else (open) => null (no final end; no remainder installment).
     */
    private fun getCommissionEndDate(reservation: Reservation): Long? {
        if (reservation.actualReturnDate != null) return reservation.actualReturnDate
        if (reservation.isClosed) return if (reservation.updatedAt > 0) reservation.updatedAt else reservation.dateTo
        return null
    }
    
    /**
     * Calculates commission installments for a given payout month.
     * 
     * @param payoutMonth Format: "YYYY-MM" (e.g., "2024-12")
     * @param reservations All reservations to consider
     * @param supplierFilter Optional supplier ID filter
     * @param statusFilter Optional status filter
     * @return List of commission installments for the payout month
     */
    fun calculateCommissionInstallmentsForPayoutMonth(
        payoutMonth: String,
        reservations: List<Reservation>,
        supplierFilter: Long? = null,
        statusFilter: ReservationStatus? = null
    ): List<CommissionInstallment> {
        val payoutYearMonth = try {
            val parts = payoutMonth.split("-")
            YearMonth.of(parts[0].toInt(), parts[1].toInt())
        } catch (e: Exception) {
            return emptyList()
        }
        
        // The service month is payout month - 1
        val serviceYearMonth = payoutYearMonth.minusMonths(1)
        val serviceMonthStart = getMonthStart(serviceYearMonth)
        val serviceMonthEnd = getMonthEnd(serviceYearMonth)
        
        val installments = mutableListOf<CommissionInstallment>()
        val now = System.currentTimeMillis()
        
        for (reservation in reservations) {
            // Apply filters
            if (supplierFilter != null && reservation.supplierId != supplierFilter) continue
            
            // Status filter semantics (centralized)
            val effectiveStatusFilter = statusFilter
            if (effectiveStatusFilter != null) {
                if (reservation.status != effectiveStatusFilter) continue
            } else {
                // When no explicit status filter is provided, exclude only Cancelled
                if (reservation.status == ReservationStatus.Cancelled) continue
            }
            
            val isMonthly = isMonthlyRental(reservation)
            val startDate = reservation.dateFrom
            val commissionEndDate = getCommissionEndDate(reservation)
            
            if (isMonthly) {
                val actualCloseDateForService: Long = if (commissionEndDate != null) {
                    commissionEndDate
                } else {
                    serviceMonthEnd
                }
                installments.addAll(
                    calculateMonthlyRentalInstallments(
                        reservation = reservation,
                        serviceMonthStart = serviceMonthStart,
                        serviceMonthEnd = serviceMonthEnd,
                        payoutMonth = payoutMonth,
                        actualCloseDate = actualCloseDateForService,
                        commissionEndDate = commissionEndDate
                    )
                )
            } else {
                val commissionEndDateNonNull = commissionEndDate ?: continue
                val installment = calculateSingleCommission(
                    reservation = reservation,
                    serviceMonthStart = serviceMonthStart,
                    serviceMonthEnd = serviceMonthEnd,
                    payoutMonth = payoutMonth,
                    commissionEndDate = commissionEndDateNonNull
                )
                if (installment != null) installments.add(installment)
            }
        }
        
        // Bulletproof by filtering by payoutMonth at the end (defensive)
        return installments.filter { it.payoutMonth == payoutMonth }
    }
    
    /**
     * Base price excluding VAT (for period pricing).
     */
    private fun getBasePriceExVat(reservation: Reservation): Double {
        val vatPct = reservation.vatPercentAtCreation ?: 17.0
        return if (reservation.includeVat) {
            reservation.agreedPrice / (1 + vatPct / 100.0)
        } else {
            reservation.agreedPrice
        }
    }

    /**
     * Non-monthly (<30 days): one installment in payout month P if commissionEndDate falls in serviceMonth P-1.
     * No same-calendar-month requirement; cross-month rentals pay in month after return.
     */
    private fun calculateSingleCommission(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        commissionEndDate: Long
    ): CommissionInstallment? {
        val isClosed = reservation.isClosed || reservation.actualReturnDate != null
        if (!isClosed) return null
        if (commissionEndDate < serviceMonthStart || commissionEndDate > serviceMonthEnd) return null

        val periodStart = reservation.dateFrom
        val periodEnd = commissionEndDate
        val days = daysBetween(periodStart, periodEnd)
        val plannedDays = daysBetween(reservation.dateFrom, reservation.dateTo)
        val basePriceExVat = getBasePriceExVat(reservation)
        val dailyRate = basePriceExVat / plannedDays
        val periodPrice = dailyRate * days
        val commissionResult = CommissionCalculator.calculate(days, periodPrice)

        return CommissionInstallment(
            id = CommissionInstallment.generateId(reservation.id, periodStart, periodEnd),
            orderId = reservation.id,
            isMonthlyRental = false,
            periodStart = periodStart,
            periodEnd = periodEnd,
            payoutMonth = payoutMonth,
            amount = commissionResult.amount
        )
    }
    
    /**
     * Monthly (>=30 days): 30-day cycle installments + one remainder installment at close (closed only).
     * dailyRate = basePriceExVat / plannedDays; each cycle/remainder uses periodPrice = dailyRate * days.
     */
    private fun calculateMonthlyRentalInstallments(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        actualCloseDate: Long,
        commissionEndDate: Long?
    ): List<CommissionInstallment> {
        val installments = mutableListOf<CommissionInstallment>()
        val startDate = reservation.dateFrom
        val isClosed = commissionEndDate != null
        val plannedDays = daysBetween(reservation.dateFrom, reservation.dateTo)
        val basePriceExVat = getBasePriceExVat(reservation)
        val dailyRate = basePriceExVat / plannedDays

        var periodStart = startDate
        while (true) {
            val periodEnd = periodStart + THIRTY_DAYS_MILLIS
            if (periodEnd > actualCloseDate) break
            if (periodEnd >= serviceMonthStart && periodEnd <= serviceMonthEnd) {
                val periodPrice = dailyRate * 30
                val commissionResult = CommissionCalculator.calculate(30, periodPrice)
                installments.add(
                    CommissionInstallment(
                        id = CommissionInstallment.generateId(reservation.id, periodStart, periodEnd),
                        orderId = reservation.id,
                        isMonthlyRental = true,
                        periodStart = periodStart,
                        periodEnd = periodEnd,
                        payoutMonth = payoutMonth,
                        amount = commissionResult.amount
                    )
                )
            }
            periodStart = periodEnd
        }

        // Remainder installment (closed only): from end of last full 30-day cycle to commissionEndDate (no overlap)
        // remainderStart = periodStart (after loop: start of first incomplete cycle = end of last complete cycle)
        // No cycles but closed: periodStart stays dateFrom → single remainder installment for full actual period
        if (isClosed && commissionEndDate != null && commissionEndDate >= serviceMonthStart && commissionEndDate <= serviceMonthEnd) {
            val remainderStart = periodStart
            val remainderEnd = commissionEndDate
            if (remainderEnd > remainderStart) {
                val remainderDays = daysBetween(remainderStart, remainderEnd)
                val periodPrice = dailyRate * remainderDays
                val commissionResult = CommissionCalculator.calculate(remainderDays, periodPrice)
                installments.add(
                    CommissionInstallment(
                        id = CommissionInstallment.generateId(reservation.id, remainderStart, remainderEnd),
                        orderId = reservation.id,
                        isMonthlyRental = true,
                        periodStart = remainderStart,
                        periodEnd = remainderEnd,
                        payoutMonth = payoutMonth,
                        amount = commissionResult.amount
                    )
                )
            }
        }
        return installments
    }
    
    /**
     * Gets total commission amount for a list of installments.
     */
    fun getTotalCommission(installments: List<CommissionInstallment>): Double {
        return installments.sumOf { it.amount }
    }

    /**
     * All installments for one reservation (all payout months).
     * Used for export total: closed = sum of all; open = sum of completed cycles only (no remainder).
     */
    fun calculateAllInstallmentsForReservation(reservation: Reservation): List<CommissionInstallment> {
        if (reservation.status == ReservationStatus.Cancelled) return emptyList()
        val firstPayout = getYearMonth(reservation.dateFrom).plusMonths(1)
        val lastPayout = getCommissionEndDate(reservation)?.let { getYearMonth(it).plusMonths(1) }
            ?: YearMonth.now(TIMEZONE).plusMonths(1)
        val payoutMonths = mutableListOf<YearMonth>()
        var m = firstPayout
        while (!m.isAfter(lastPayout)) {
            payoutMonths.add(m)
            m = m.plusMonths(1)
        }
        return payoutMonths.flatMap { ym ->
            val payoutMonthStr = "${ym.year}-${ym.monthValue.toString().padStart(2, '0')}"
            calculateCommissionInstallmentsForPayoutMonth(
                payoutMonth = payoutMonthStr,
                reservations = listOf(reservation),
                supplierFilter = null,
                statusFilter = null
            )
        }
    }
}

