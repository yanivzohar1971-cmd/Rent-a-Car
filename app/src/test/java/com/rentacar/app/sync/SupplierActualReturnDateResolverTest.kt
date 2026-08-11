package com.rentacar.app.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class SupplierActualReturnDateResolverTest {

    private val timezone = ZoneId.of("Asia/Jerusalem")

    @Test
    fun openImportWithNoEndDate_doesNotClearExistingActualReturnDate() {
        val existing = date(2026, 7, 15)

        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = false,
            contractEndDate = null,
            existingActualReturnDate = existing,
            dealImportedAtUtc = date(2026, 8, 1),
            reservationUpdatedAt = date(2026, 7, 20)
        )

        assertEquals(existing, resolved)
    }

    @Test
    fun closedImportWithEndDate_setsActualReturnDateWhenNoneExists() {
        val incoming = date(2026, 7, 20)

        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = true,
            contractEndDate = incoming,
            existingActualReturnDate = null,
            dealImportedAtUtc = date(2026, 8, 1),
            reservationUpdatedAt = date(2026, 7, 1)
        )

        assertEquals(incoming, resolved)
    }

    @Test
    fun newerClosedImportWithDifferentDate_overwritesExistingActualReturnDate() {
        val existing = date(2026, 7, 15)
        val incoming = date(2026, 7, 20)

        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = true,
            contractEndDate = incoming,
            existingActualReturnDate = existing,
            dealImportedAtUtc = date(2026, 8, 5),
            reservationUpdatedAt = date(2026, 7, 25)
        )

        assertEquals(incoming, resolved)
    }

    @Test
    fun olderClosedImportWithDifferentDate_preservesExistingActualReturnDate() {
        val existing = date(2026, 7, 15)
        val incoming = date(2026, 7, 20)

        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = true,
            contractEndDate = incoming,
            existingActualReturnDate = existing,
            dealImportedAtUtc = date(2026, 7, 10),
            reservationUpdatedAt = date(2026, 7, 25)
        )

        assertEquals(existing, resolved)
    }

    @Test
    fun closedImportWithSameBusinessDate_preservesExistingMillis() {
        val existing = date(2026, 7, 15) + 3_600_000L
        val incoming = date(2026, 7, 15) + 8_000L

        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = true,
            contractEndDate = incoming,
            existingActualReturnDate = existing,
            dealImportedAtUtc = date(2026, 8, 5),
            reservationUpdatedAt = date(2026, 7, 25)
        )

        assertEquals(existing, resolved)
    }

    @Test
    fun openImportWithEndDateButOpenStatus_doesNotSetOrClearActualReturnDate() {
        val resolved = SupplierActualReturnDateResolver.resolve(
            isClosedDeal = false,
            contractEndDate = date(2026, 7, 20),
            existingActualReturnDate = null,
            dealImportedAtUtc = date(2026, 8, 1),
            reservationUpdatedAt = date(2026, 7, 1)
        )

        assertNull(resolved)
    }

    private fun date(year: Int, month: Int, day: Int): Long =
        LocalDate.of(year, month, day).atStartOfDay(timezone).toInstant().toEpochMilli()
}
