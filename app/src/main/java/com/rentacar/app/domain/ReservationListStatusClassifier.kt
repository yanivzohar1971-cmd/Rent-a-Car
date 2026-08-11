package com.rentacar.app.domain

import com.rentacar.app.data.Reservation
import com.rentacar.app.data.ReservationStatus

/**
 * Centralized reservation-list classification for manage-screen filters.
 *
 * Precedence: CANCELLED → CLOSED → ACTIVE.
 *
 * CLOSED means a closing process exists or has completed, represented in this
 * codebase by [Reservation.isClosed] and/or a real [Reservation.actualReturnDate].
 *
 * An open 30-day monthly commission cycle does NOT close the reservation
 * (approval leaves isClosed=false and actualReturnDate=null).
 */
enum class ReservationListStatus {
    ACTIVE,
    CLOSED,
    CANCELLED
}

object ReservationListStatusClassifier {

    fun classify(reservation: Reservation): ReservationListStatus {
        if (reservation.status == ReservationStatus.Cancelled) {
            return ReservationListStatus.CANCELLED
        }
        if (reservation.isClosed || reservation.actualReturnDate != null) {
            return ReservationListStatus.CLOSED
        }
        return ReservationListStatus.ACTIVE
    }

    fun matches(
        reservation: Reservation,
        filter: ReservationListStatus?
    ): Boolean {
        if (filter == null) return true
        return classify(reservation) == filter
    }
}
