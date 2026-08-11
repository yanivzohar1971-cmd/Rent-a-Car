package com.rentacar.app.ui.navigation

/**
 * Pure navigation helpers for commission reconciliation — unit-testable without Compose.
 */
object CommissionReconciliationNavigation {

    /** Opens the full reservation editor for the matched internal id. */
    fun editReservationRoute(reservationId: Long?): String? =
        reservationId?.takeIf { it > 0L }?.let { "edit_reservation/$it" }

    fun canOpenReservation(reservationId: Long?): Boolean =
        editReservationRoute(reservationId) != null
}
