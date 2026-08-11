package com.rentacar.app.data

/**
 * Resolves the authoritative CarSale primary key after Room [@androidx.room.Upsert].
 *
 * Room 2.6.x [EntityUpsertionAdapter.upsertAndReturnId] returns the inserted row id on
 * insert, but returns `-1` after a successful UPDATE of an existing primary key.
 * Callers must therefore treat [originalId] as authoritative when it is already persisted.
 */
object CarSaleUpsertId {
    fun resolvePersistedId(originalId: Long, upsertResult: Long): Long =
        if (originalId > 0L) originalId else upsertResult
}
