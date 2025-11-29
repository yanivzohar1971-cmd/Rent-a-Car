package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CarCatalogDao {
    @Query("""
        SELECT * FROM car_manufacturers
        WHERE is_active = 1
          AND (
            :query IS NULL
            OR :query = ''
            OR name_he LIKE '%' || :query || '%'
            OR name_en LIKE '%' || :query || '%'
          )
        ORDER BY name_he COLLATE NOCASE ASC
        LIMIT :limit
    """)
    suspend fun searchManufacturers(
        query: String?,
        limit: Int = 20
    ): List<CarManufacturerEntity>

    @Query("""
        SELECT * FROM car_models
        WHERE is_active = 1
          AND manufacturer_id = :manufacturerId
          AND (
            :query IS NULL
            OR :query = ''
            OR name_he LIKE '%' || :query || '%'
            OR name_en LIKE '%' || :query || '%'
          )
        ORDER BY name_he COLLATE NOCASE ASC
        LIMIT :limit
    """)
    suspend fun searchModelsForManufacturer(
        manufacturerId: Long,
        query: String?,
        limit: Int = 30
    ): List<CarModelEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertManufacturers(items: List<CarManufacturerEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModels(items: List<CarModelEntity>)
}

