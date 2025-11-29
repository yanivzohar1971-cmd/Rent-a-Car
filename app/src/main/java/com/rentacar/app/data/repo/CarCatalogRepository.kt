package com.rentacar.app.data.repo

import com.rentacar.app.data.CarCatalogDao
import com.rentacar.app.data.CarManufacturerEntity
import com.rentacar.app.data.CarModelEntity

class CarCatalogRepository(
    private val carCatalogDao: CarCatalogDao
) {
    suspend fun searchManufacturers(query: String?): List<CarManufacturerEntity> {
        return carCatalogDao.searchManufacturers(query?.trim().takeUnless { it.isNullOrEmpty() }, limit = 20)
    }

    suspend fun searchModels(
        manufacturerId: Long,
        query: String?
    ): List<CarModelEntity> {
        return carCatalogDao.searchModelsForManufacturer(
            manufacturerId = manufacturerId,
            query = query?.trim().takeUnless { it.isNullOrEmpty() },
            limit = 30
        )
    }

    suspend fun seedIfEmpty() {
        val existing = carCatalogDao.searchManufacturers(null, limit = 1)
        if (existing.isNotEmpty()) return

        // TODO: Later we will replace this minimal seed with a real import from a full catalog
        // Minimal built-in seed for demo; later we can replace with full import.
        val manufacturers = listOf(
            CarManufacturerEntity(nameEn = "Toyota", nameHe = "טויוטה", country = "Japan"),
            CarManufacturerEntity(nameEn = "Hyundai", nameHe = "יונדאי", country = "South Korea"),
            CarManufacturerEntity(nameEn = "Kia", nameHe = "קיה", country = "South Korea"),
            CarManufacturerEntity(nameEn = "Mazda", nameHe = "מזדה", country = "Japan"),
            CarManufacturerEntity(nameEn = "Volkswagen", nameHe = "פולקסווגן", country = "Germany")
        )

        val insertedManufacturers = manufacturers.mapIndexed { index, m ->
            m.copy(id = (index + 1).toLong())
        }

        val models = listOf(
            CarModelEntity(manufacturerId = 1, nameEn = "Corolla", nameHe = "קורולה"),
            CarModelEntity(manufacturerId = 1, nameEn = "Yaris", nameHe = "יאריס"),
            CarModelEntity(manufacturerId = 2, nameEn = "i10", nameHe = "i10"),
            CarModelEntity(manufacturerId = 2, nameEn = "i20", nameHe = "i20"),
            CarModelEntity(manufacturerId = 2, nameEn = "Tucson", nameHe = "טוסון"),
            CarModelEntity(manufacturerId = 3, nameEn = "Sportage", nameHe = "ספורטאז'"),
            CarModelEntity(manufacturerId = 4, nameEn = "3", nameHe = "3"),
            CarModelEntity(manufacturerId = 5, nameEn = "Golf", nameHe = "גולף")
        )

        carCatalogDao.insertManufacturers(insertedManufacturers)
        carCatalogDao.insertModels(models)
    }
}

