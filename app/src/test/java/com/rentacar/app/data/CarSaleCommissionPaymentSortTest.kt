package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Ensures commission payment rows stay chronological by paymentDate
 * (oldest first), with id/draftKey as deterministic tie-breakers.
 */
class CarSaleCommissionPaymentSortTest {

    @Test
    fun sortsByPaymentDateAscending_regardlessOfEntryOrder() {
        val d1 = draft("a", id = 0, amount = 500.0, dayOffset = 11)
        val d2 = draft("b", id = 0, amount = 500.0, dayOffset = 9)
        val d3 = draft("c", id = 0, amount = 500.0, dayOffset = 15)
        val d4 = draft("d", id = 0, amount = 500.0, dayOffset = 5)

        val sorted = listOf(d1, d2, d3, d4)
            .sortedWith(compareBy({ it.paymentDate }, { it.id }, { it.draftKey }))

        assertEquals(listOf("d", "b", "a", "c"), sorted.map { it.draftKey })
    }

    @Test
    fun sameDate_usesIdThenDraftKey() {
        val day = dayMillis(10)
        val a = CarSaleCommissionPaymentDraft("k2", id = 2, amount = 100.0, paymentDate = day)
        val b = CarSaleCommissionPaymentDraft("k1", id = 1, amount = 200.0, paymentDate = day)
        val c = CarSaleCommissionPaymentDraft("k3", id = 0, amount = 300.0, paymentDate = day)

        val sorted = listOf(a, b, c)
            .sortedWith(compareBy({ it.paymentDate }, { it.id }, { it.draftKey }))

        assertEquals(listOf("k3", "k1", "k2"), sorted.map { it.draftKey })
    }

    private fun draft(key: String, id: Long, amount: Double, dayOffset: Int) =
        CarSaleCommissionPaymentDraft(
            draftKey = key,
            id = id,
            amount = amount,
            paymentDate = dayMillis(dayOffset)
        )

    private fun dayMillis(dayOfMonth: Int): Long {
        val cal = java.util.Calendar.getInstance().apply {
            set(2026, java.util.Calendar.AUGUST, dayOfMonth, 0, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        return cal.timeInMillis
    }
}
