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

    // Engines
    @Query("SELECT COUNT(*) FROM car_engines")
    suspend fun countEngines(): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertEngines(items: List<CarEngineEntity>)

    @Query("SELECT * FROM car_engines WHERE id IN (:ids)")
    suspend fun getEnginesByIds(ids: List<Long>): List<CarEngineEntity>

    // Transmissions
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTransmissions(items: List<CarTransmissionEntity>)

    @Query("SELECT * FROM car_transmissions WHERE id IN (:ids)")
    suspend fun getTransmissionsByIds(ids: List<Long>): List<CarTransmissionEntity>

    // Variants
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertVariants(items: List<CarVariantEntity>)

    @Query("""
        SELECT * FROM car_variants
        WHERE manufacturer_id = :manufacturerId
          AND model_id = :modelId
          AND (:year IS NULL OR (from_year IS NULL OR from_year <= :year) AND (to_year IS NULL OR to_year >= :year))
          AND (:marketCode IS NULL OR market_code IS NULL OR market_code = :marketCode)
        ORDER BY from_year DESC
    """)
    suspend fun findVariantsForModel(
        manufacturerId: Long,
        modelId: Long,
        year: Int?,
        marketCode: String? = "IL"
    ): List<CarVariantEntity>

    // Helper for counting manufacturers
    @Query("SELECT COUNT(*) FROM car_manufacturers")
    suspend fun countManufacturers(): Long

    // Helper queries to get entities by external_id (for seed mapping)
    @Query("SELECT * FROM car_manufacturers WHERE external_id = :externalId LIMIT 1")
    suspend fun getManufacturerByExternalId(externalId: String): CarManufacturerEntity?

    @Query("SELECT * FROM car_models WHERE external_id = :externalId LIMIT 1")
    suspend fun getModelByExternalId(externalId: String): CarModelEntity?

    @Query("SELECT * FROM car_engines WHERE external_id = :externalId LIMIT 1")
    suspend fun getEngineByExternalId(externalId: String): CarEngineEntity?

    @Query("SELECT * FROM car_transmissions WHERE external_id = :externalId LIMIT 1")
    suspend fun getTransmissionByExternalId(externalId: String): CarTransmissionEntity?

    // Single insert methods for getting IDs back (Room returns Long for single inserts)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertManufacturer(item: CarManufacturerEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertModel(item: CarModelEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertEngine(item: CarEngineEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTransmission(item: CarTransmissionEntity): Long
}

