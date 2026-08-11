package com.rentacar.app.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Converts persisted epoch-millis reservation dates to business [LocalDate] values.
 * All commission timing treats [com.rentacar.app.data.Reservation.actualReturnDate]
 * as a calendar business date in Asia/Jerusalem — never as an instant with time-of-day semantics.
 */
object CommissionBusinessDates {
    val TIMEZONE: ZoneId = ZoneId.of("Asia/Jerusalem")

    fun toLocalDate(millis: Long): LocalDate =
        Instant.ofEpochMilli(millis).atZone(TIMEZONE).toLocalDate()

    fun toStartOfDayMillis(date: LocalDate): Long =
        date.atStartOfDay(TIMEZONE).toInstant().toEpochMilli()
}
