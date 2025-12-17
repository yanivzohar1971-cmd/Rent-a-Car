package com.rentacar.app.domain

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.*

/**
 * Service for calculating commission installments based on business rules.
 * 
 * Business Rules:
 * - Non-monthly rentals: Commission is paid in month N+1 if order starts and closes in month N (same calendar month).
 *   Only closed/completed orders generate commissions.
 * - Monthly rentals (30-day recurring): For each completed 30-day period ending in month N, commission is paid in month N+1.
 *   Partial periods (less than 30 days) are ignored.
 * 
 * Timezone: Asia/Jerusalem (all month boundaries calculated in this timezone)
 */
object CommissionCalculationService {
    private val TIMEZONE = ZoneId.of("Asia/Jerusalem")
    private val THIRTY_DAYS_MILLIS = 30L * 24 * 60 * 60 * 1000
    
    /**
     * Determines if a reservation is a monthly rental (30-day recurring commissions).
     * A reservation is considered monthly if periodTypeDays == 30 or the rental duration is 30+ days.
     */
    fun isMonthlyRental(reservation: Reservation): Boolean {
        return reservation.periodTypeDays == 30 || 
               (reservation.dateTo - reservation.dateFrom) >= THIRTY_DAYS_MILLIS
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
     * Gets the commission end date for a reservation.
     * Business rule: Closing date (תאריך סגירה) is primary, actual return date (תאריך חזרה) is fallback.
     * 
     * Priority:
     * 1. Closing date: updatedAt when isClosed == true (when the reservation was closed)
     * 2. Actual return date: actualReturnDate if exists
     * 3. Fallback: planned end date (dateTo) for open reservations
     */
    private fun getCommissionEndDate(reservation: Reservation): Long? {
        // 1. Closing date is strongest - use updatedAt when reservation is closed
        if (reservation.isClosed && reservation.updatedAt > 0) {
            return reservation.updatedAt
        }
        
        // 2. If there's no closing date, use actual return date
        if (reservation.actualReturnDate != null) {
            return reservation.actualReturnDate
        }
        
        // 3. Optional: as a last resort for still-open contracts, fall back to planned end date
        return reservation.dateTo
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
                // For monthly rentals we want to be able to compute "per service month" view,
                // including future months. So we cap by:
                // - closed reservations: commission end date (closing date if exists, otherwise return date)
                // - open reservations: end of the service month we are currently evaluating.
                val actualCloseDateForService: Long = if (reservation.isClosed && commissionEndDate != null) {
                    commissionEndDate
                } else {
                    // open reservation or no usable end date yet → forecast up to end of service month
                    serviceMonthEnd
                }
                
                // Monthly rental: 30-day recurring commissions
                installments.addAll(
                    calculateMonthlyRentalInstallments(
                        reservation = reservation,
                        serviceMonthStart = serviceMonthStart,
                        serviceMonthEnd = serviceMonthEnd,
                        payoutMonth = payoutMonth,
                        actualCloseDate = actualCloseDateForService
                    )
                )
            } else {
                // Non-monthly rental: single commission
                // Use commission end date (closing date if exists, otherwise return date, otherwise dateTo)
                val commissionEndDateNonNull = commissionEndDate ?: continue
                
                val installment = calculateSingleCommission(
                    reservation = reservation,
                    serviceMonthStart = serviceMonthStart,
                    serviceMonthEnd = serviceMonthEnd,
                    payoutMonth = payoutMonth,
                    commissionEndDate = commissionEndDateNonNull
                )
                if (installment != null) {
                    installments.add(installment)
                }
            }
        }
        
        // Bulletproof by filtering by payoutMonth at the end (defensive)
        return installments.filter { it.payoutMonth == payoutMonth }
    }
    
    /**
     * Calculates commission for non-monthly rentals.
     * Commission is paid in month N+1 if order starts and closes in month N (same calendar month).
     * 
     * @param commissionEndDate The commission end date (closing date if exists, otherwise return date)
     */
    private fun calculateSingleCommission(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        commissionEndDate: Long
    ): CommissionInstallment? {
        val startDate = reservation.dateFrom
        
        // Check if order is in a final state (closed/completed)
        // For non-monthly, we need either isClosed flag or an actual return date to generate commission
        val isClosed = reservation.isClosed || reservation.actualReturnDate != null
        if (!isClosed) return null // Only closed orders get commission
        
        // Check if start and end are in the same calendar month (using commission end date)
        val startYearMonth = getYearMonth(startDate)
        val endYearMonth = getYearMonth(commissionEndDate)
        
        if (startYearMonth != endYearMonth) return null // Must be same month
        
        // Check if the commission end date falls in the service month
        if (commissionEndDate < serviceMonthStart || commissionEndDate > serviceMonthEnd) {
            return null
        }
        
        // Calculate commission amount
        val days = ((commissionEndDate - startDate) / (24 * 60 * 60 * 1000)).toInt().coerceAtLeast(1)
        val basePrice = reservation.agreedPrice
        val commissionResult = CommissionCalculator.calculate(days, basePrice)
        
        return CommissionInstallment(
            id = CommissionInstallment.generateId(reservation.id, startDate, commissionEndDate),
            orderId = reservation.id,
            isMonthlyRental = false,
            periodStart = startDate,
            periodEnd = commissionEndDate,
            payoutMonth = payoutMonth,
            amount = commissionResult.amount
        )
    }
    
    /**
     * Calculates commission installments for monthly rentals (30-day periods).
     * 
     * For closed rentals: only includes periods up to actualCloseDate.
     * For open rentals: actualCloseDate is set to serviceMonthEnd (allows forecasting).
     */
    private fun calculateMonthlyRentalInstallments(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        actualCloseDate: Long // For closed rentals: actualReturnDate, for open: serviceMonthEnd
    ): List<CommissionInstallment> {
        val installments = mutableListOf<CommissionInstallment>()
        val startDate = reservation.dateFrom
        val isClosed = reservation.actualReturnDate != null
        
        // Calculate monthly price from total price and rental duration
        val totalDays = ((reservation.dateTo - reservation.dateFrom) / (24 * 60 * 60 * 1000)).toInt().coerceAtLeast(1)
        val numberOfMonths = (totalDays / 30.0).coerceAtLeast(1.0)
        val monthlyPrice = if (numberOfMonths > 0) {
            reservation.agreedPrice / numberOfMonths
        } else {
            reservation.agreedPrice
        }
        
        var periodStart = startDate
        
        // Calculate 30-day periods
        // Stop when periodEnd exceeds actualCloseDate (which is either actualReturnDate for closed, or serviceMonthEnd for open)
        while (true) {
            val periodEnd = periodStart + THIRTY_DAYS_MILLIS
            
            // Stop when periodEnd > actualCloseDate (which is either actualReturnDate for closed, or serviceMonthEnd for open)
            if (periodEnd > actualCloseDate) break
            
            // Check if this period ends in the service month
            if (periodEnd >= serviceMonthStart && periodEnd <= serviceMonthEnd) {
                // Verify the period doesn't extend past actualCloseDate
                val isEligible = periodEnd <= actualCloseDate
                
                if (isEligible) {
                    // Calculate commission for this 30-day period
                    // For monthly rentals, commission is based on one month's price
                    val commissionResult = CommissionCalculator.calculate(30, monthlyPrice)
                    
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
            }
            
            // Move to next period
            periodStart = periodEnd
        }
        
        return installments
    }
    
    /**
     * Gets total commission amount for a list of installments.
     */
    fun getTotalCommission(installments: List<CommissionInstallment>): Double {
        return installments.sumOf { it.amount }
    }
}

