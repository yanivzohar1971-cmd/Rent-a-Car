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
 * Timezone: Asia/Jerusalem
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
            if (statusFilter != null && reservation.status != statusFilter) continue
            if (reservation.status == ReservationStatus.Cancelled) continue
            
            val isMonthly = isMonthlyRental(reservation)
            val startDate = reservation.dateFrom
            val closeDate = reservation.actualReturnDate ?: reservation.dateTo
            val actualCloseDate = reservation.actualReturnDate ?: now // For open orders, use now
            
            if (isMonthly) {
                // Monthly rental: 30-day recurring commissions
                installments.addAll(
                    calculateMonthlyRentalInstallments(
                        reservation = reservation,
                        serviceMonthStart = serviceMonthStart,
                        serviceMonthEnd = serviceMonthEnd,
                        payoutMonth = payoutMonth,
                        actualCloseDate = actualCloseDate
                    )
                )
            } else {
                // Non-monthly rental: single commission
                val installment = calculateSingleCommission(
                    reservation = reservation,
                    serviceMonthStart = serviceMonthStart,
                    serviceMonthEnd = serviceMonthEnd,
                    payoutMonth = payoutMonth,
                    closeDate = closeDate
                )
                if (installment != null) {
                    installments.add(installment)
                }
            }
        }
        
        return installments
    }
    
    /**
     * Calculates commission for non-monthly rentals.
     * Commission is paid in month N+1 if order starts and closes in month N (same calendar month).
     */
    private fun calculateSingleCommission(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        closeDate: Long
    ): CommissionInstallment? {
        val startDate = reservation.dateFrom
        val actualCloseDate = reservation.actualReturnDate ?: reservation.dateTo
        
        // Check if order is in a final state (closed/completed)
        val isClosed = reservation.actualReturnDate != null || reservation.isClosed
        if (!isClosed) return null // Only closed orders get commission
        
        // Check if start and close are in the same calendar month
        val startYearMonth = getYearMonth(startDate)
        val closeYearMonth = getYearMonth(actualCloseDate)
        
        if (startYearMonth != closeYearMonth) return null // Must be same month
        
        // Check if the close date falls in the service month
        if (actualCloseDate < serviceMonthStart || actualCloseDate > serviceMonthEnd) {
            return null
        }
        
        // Calculate commission amount
        val days = ((actualCloseDate - startDate) / (24 * 60 * 60 * 1000)).toInt().coerceAtLeast(1)
        val basePrice = reservation.agreedPrice
        val commissionResult = CommissionCalculator.calculate(days, basePrice)
        
        return CommissionInstallment(
            id = CommissionInstallment.generateId(reservation.id, startDate, actualCloseDate),
            orderId = reservation.id,
            isMonthlyRental = false,
            periodStart = startDate,
            periodEnd = actualCloseDate,
            payoutMonth = payoutMonth,
            amount = commissionResult.amount
        )
    }
    
    /**
     * Calculates commission installments for monthly rentals (30-day periods).
     */
    private fun calculateMonthlyRentalInstallments(
        reservation: Reservation,
        serviceMonthStart: Long,
        serviceMonthEnd: Long,
        payoutMonth: String,
        actualCloseDate: Long
    ): List<CommissionInstallment> {
        val installments = mutableListOf<CommissionInstallment>()
        val startDate = reservation.dateFrom
        
        // Calculate monthly price from total price and rental duration
        val totalDays = ((reservation.dateTo - reservation.dateFrom) / (24 * 60 * 60 * 1000)).toInt().coerceAtLeast(1)
        val numberOfMonths = (totalDays / 30.0).coerceAtLeast(1.0)
        val monthlyPrice = if (numberOfMonths > 0) {
            reservation.agreedPrice / numberOfMonths
        } else {
            reservation.agreedPrice
        }
        
        var periodStart = startDate
        var periodNumber = 1
        
        // Calculate 30-day periods
        while (true) {
            val periodEnd = periodStart + THIRTY_DAYS_MILLIS
            
            // Stop if periodEnd exceeds actualCloseDate
            if (periodEnd > actualCloseDate) break
            
            // Check if this period ends in the service month
            if (periodEnd >= serviceMonthStart && periodEnd <= serviceMonthEnd) {
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
            
            // Move to next period
            periodStart = periodEnd
            periodNumber++
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

