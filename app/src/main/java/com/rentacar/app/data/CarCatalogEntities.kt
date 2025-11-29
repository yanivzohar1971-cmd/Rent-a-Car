package com.rentacar.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo
import androidx.room.Index

@Entity(tableName = "car_manufacturers")
data class CarManufacturerEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
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

