package com.rentacar.app.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissionReconciliationNavigationTest {

    @Test
    fun openReservation_passesExactInternalId() {
        assertEquals("edit_reservation/42", CommissionReconciliationNavigation.editReservationRoute(42L))
    }

    @Test
    fun missingReservationId_disablesNavigation() {
        assertNull(CommissionReconciliationNavigation.editReservationRoute(null))
        assertNull(CommissionReconciliationNavigation.editReservationRoute(0L))
        assertFalse(CommissionReconciliationNavigation.canOpenReservation(null))
        assertTrue(CommissionReconciliationNavigation.canOpenReservation(7L))
    }
}
