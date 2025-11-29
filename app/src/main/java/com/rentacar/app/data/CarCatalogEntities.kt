package com.rentacar.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo
import androidx.room.Index

@Entity(tableName = "car_manufacturers")
data class CarManufacturerEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "external_id")
    val externalId: String? = null,
    @ColumnInfo(name = "name_en")
    val nameEn: String,
    @ColumnInfo(name = "name_he")
    val nameHe: String,
    @ColumnInfo(name = "country")
    val country: String? = null,
    @ColumnInfo(name = "is_active")
    val isActive: Boolean = true,
    @ColumnInfo(name = "is_user_defined")
    val isUserDefined: Boolean = false
)

@Entity(
    tableName = "car_models",
    indices = [Index("manufacturer_id")]
)
data class CarModelEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "external_id")
    val externalId: String? = null,
    @ColumnInfo(name = "manufacturer_id")
    val manufacturerId: Long,
    @ColumnInfo(name = "name_en")
    val nameEn: String,
    @ColumnInfo(name = "name_he")
    val nameHe: String,
    @ColumnInfo(name = "from_year")
    val fromYear: Int? = null,
    @ColumnInfo(name = "to_year")
    val toYear: Int? = null,
    @ColumnInfo(name = "is_active")
    val isActive: Boolean = true,
    @ColumnInfo(name = "is_user_defined")
    val isUserDefined: Boolean = false
)

@Entity(tableName = "car_engines")
data class CarEngineEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "external_id")
    val externalId: String,
    @ColumnInfo(name = "displacement_cc")
    val displacementCc: Int? = null,
    @ColumnInfo(name = "power_hp")
    val powerHp: Int? = null,
    @ColumnInfo(name = "fuel_type")
    val fuelType: String? = null
)

@Entity(tableName = "car_transmissions")
data class CarTransmissionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "external_id")
    val externalId: String,
    @ColumnInfo(name = "gearbox_type")
    val gearboxType: String? = null,
    @ColumnInfo(name = "gear_count")
    val gearCount: Int? = null
)

@Entity(
    tableName = "car_variants",
    indices = [
        Index("manufacturer_id"),
        Index("model_id"),
        Index("engine_id"),
        Index("transmission_id")
    ]
)
data class CarVariantEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    @ColumnInfo(name = "external_id")
    val externalId: String,
    @ColumnInfo(name = "manufacturer_id")
    val manufacturerId: Long,
    @ColumnInfo(name = "model_id")
    val modelId: Long,
    @ColumnInfo(name = "engine_id")
    val engineId: Long?,
    @ColumnInfo(name = "transmission_id")
    val transmissionId: Long?,
    @ColumnInfo(name = "body_type")
    val bodyType: String? = null,
    @ColumnInfo(name = "from_year")
    val fromYear: Int? = null,
    @ColumnInfo(name = "to_year")
    val toYear: Int? = null,
    @ColumnInfo(name = "market_code")
    val marketCode: String? = null
)

