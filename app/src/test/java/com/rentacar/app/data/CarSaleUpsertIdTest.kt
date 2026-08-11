package com.rentacar.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CarSaleUpsertIdTest {

    @Test
    fun existingSale_upsertReturnsMinusOne_usesOriginalId() {
        assertEquals(17L, CarSaleUpsertId.resolvePersistedId(originalId = 17L, upsertResult = -1L))
    }

    @Test
    fun existingSale_upsertReturnsPositive_originalIdRemainsAuthoritative() {
        assertEquals(17L, CarSaleUpsertId.resolvePersistedId(originalId = 17L, upsertResult = 17L))
        assertEquals(17L, CarSaleUpsertId.resolvePersistedId(originalId = 17L, upsertResult = 99L))
    }

    @Test
    fun newSale_upsertReturnsInsertedRowId() {
        assertEquals(20L, CarSaleUpsertId.resolvePersistedId(originalId = 0L, upsertResult = 20L))
    }

    @Test
    fun newSale_upsertReturnsMinusOne_isInvalid() {
        val resolved = CarSaleUpsertId.resolvePersistedId(originalId = 0L, upsertResult = -1L)
        assertEquals(-1L, resolved)
        assertTrue(resolved <= 0L)
    }

    @Test
    fun newSale_upsertReturnsZero_isInvalid() {
        val resolved = CarSaleUpsertId.resolvePersistedId(originalId = 0L, upsertResult = 0L)
        assertEquals(0L, resolved)
        assertTrue(resolved <= 0L)
    }
}
