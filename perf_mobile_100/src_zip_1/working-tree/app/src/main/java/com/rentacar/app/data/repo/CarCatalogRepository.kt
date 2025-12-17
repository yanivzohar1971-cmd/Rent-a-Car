package com.rentacar.app.data.repo

import android.content.Context
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.rentacar.app.R
import com.rentacar.app.data.CarCatalogDao
import com.rentacar.app.data.CarEngineEntity
import com.rentacar.app.data.CarManufacturerEntity
import com.rentacar.app.data.CarModelEntity
import com.rentacar.app.data.CarTransmissionEntity
import com.rentacar.app.data.CarVariantEntity
import com.rentacar.app.data.catalog.CarCatalogGraphSeed
import com.rentacar.app.data.catalog.BrandModelsHeEn
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CarCatalogRepository(
    private val carCatalogDao: CarCatalogDao,
    private val context: Context
) {
    private val gson: Gson = GsonBuilder()
        .setLenient()
        .create()
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

    suspend fun findVariantsForModel(
        manufacturerId: Long,
        modelId: Long,
        year: Int?,
        marketCode: String? = "IL"
    ): List<CarVariantEntity> {
        return carCatalogDao.findVariantsForModel(manufacturerId, modelId, year, marketCode)
    }

    suspend fun getEngineById(id: Long): CarEngineEntity? {
        val engines = carCatalogDao.getEnginesByIds(listOf(id))
        return engines.firstOrNull()
    }

    suspend fun getTransmissionById(id: Long): CarTransmissionEntity? {
        val transmissions = carCatalogDao.getTransmissionsByIds(listOf(id))
        return transmissions.firstOrNull()
    }

    /**
     * Import brands and models from car_catalog_models_he_en.json
     * Only adds manufacturers/models that don't already exist
     * @return Number of new rows inserted (manufacturers + models)
     */
    suspend fun importFromModelsHeEnJson(): Int = withContext(Dispatchers.IO) {
        var insertedCount = 0

        try {
            val inputStream = context.resources.openRawResource(R.raw.car_catalog_models_he_en)
            val jsonText = inputStream.bufferedReader().use { it.readText() }

            val listType = object : TypeToken<List<BrandModelsHeEn>>() {}.type
            val items: List<BrandModelsHeEn> = gson.fromJson(jsonText, listType)

            for (brand in items) {
                val existingManu = carCatalogDao.findManufacturerByNames(brand.brandEn, brand.brandHe)
                val manufacturerId = if (existingManu != null) {
                    existingManu.id
                } else {
                    val entity = CarManufacturerEntity(
                        nameEn = brand.brandEn,
                        nameHe = brand.brandHe,
                        country = null,
                        isActive = true,
                        isUserDefined = false,
                        externalId = null
                    )
                    val id = carCatalogDao.insertManufacturer(entity)
                    insertedCount++
                    id
                }

                for (model in brand.models) {
                    val existingModel = carCatalogDao.findModelByNames(
                        manufacturerId = manufacturerId,
                        nameEn = model.modelEn,
                        nameHe = model.modelHe
                    )
                    if (existingModel == null) {
                        val entity = CarModelEntity(
                            manufacturerId = manufacturerId,
                            nameEn = model.modelEn,
                            nameHe = model.modelHe,
                            fromYear = null,
                            toYear = null,
                            isActive = true,
                            isUserDefined = false,
                            externalId = null
                        )
                        carCatalogDao.insertModel(entity)
                        insertedCount++
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("CarCatalogRepository", "Error importing from models_he_en.json", e)
            throw e
        }

        insertedCount
    }

    suspend fun seedIfEmpty() {
        if (carCatalogDao.countManufacturers() > 0) return

        try {
            seedFromGraphIfNeeded()
        } catch (e: Exception) {
            android.util.Log.e("CarCatalogRepository", "Error seeding from graph, falling back to minimal seed", e)
            // Fallback to minimal seed if graph import fails
            seedMinimalFallback()
        }
    }

    private suspend fun seedFromGraphIfNeeded() = withContext(Dispatchers.IO) {
        val graph = loadGraph()
        seedBrandsModelsEnginesTransmissionsVariants(graph)
    }

    private fun loadGraph(): CarCatalogGraphSeed {
        val inputStream = context.resources.openRawResource(R.raw.car_catalog_graph)
        val text = inputStream.bufferedReader().use { it.readText() }
        return gson.fromJson(text, CarCatalogGraphSeed::class.java)
    }

    private suspend fun seedBrandsModelsEnginesTransmissionsVariants(graph: CarCatalogGraphSeed) {
        // Insert manufacturers one by one to get IDs
        val brandIdToDbId = mutableMapOf<String, Long>()
        for (brand in graph.brands) {
            val entity = CarManufacturerEntity(
                externalId = brand.id,
                nameEn = brand.nameEn,
                nameHe = brand.nameHe,
                country = brand.countryCode,
                isActive = brand.isActive,
                isUserDefined = false
            )
            val dbId = carCatalogDao.insertManufacturer(entity)
            brandIdToDbId[brand.id] = dbId
        }

        // Insert models one by one to get IDs
        val modelIdToDbId = mutableMapOf<String, Long>()
        for (model in graph.models) {
            val manufacturerId = brandIdToDbId[model.brandId] ?: continue
            val entity = CarModelEntity(
                externalId = model.id,
                manufacturerId = manufacturerId,
                nameEn = model.nameEn,
                nameHe = model.nameHe,
                fromYear = null, // Models don't have years, generations do
                toYear = null,
                isActive = true,
                isUserDefined = false
            )
            val dbId = carCatalogDao.insertModel(entity)
            modelIdToDbId[model.id] = dbId
        }

        // Build generation -> model mapping (variants reference generationId, which references modelFamilyId)
        val generationIdToModelId = mutableMapOf<String, Long>()
        for (gen in graph.generations) {
            val modelId = modelIdToDbId[gen.modelFamilyId]
            if (modelId != null) {
                generationIdToModelId[gen.id] = modelId
            }
        }

        // Insert engines one by one to get IDs
        val engineIdToDbId = mutableMapOf<String, Long>()
        for (engine in graph.engines) {
            val entity = CarEngineEntity(
                externalId = engine.id,
                displacementCc = engine.displacementCc,
                powerHp = engine.powerHp,
                fuelType = engine.fuelType
            )
            val dbId = carCatalogDao.insertEngine(entity)
            engineIdToDbId[engine.id] = dbId
        }

        // Insert transmissions one by one to get IDs
        val transmissionIdToDbId = mutableMapOf<String, Long>()
        for (transmission in graph.transmissions) {
            val entity = CarTransmissionEntity(
                externalId = transmission.id,
                gearboxType = transmission.type, // Map "type" field to gearboxType
                gearCount = transmission.gears
            )
            val dbId = carCatalogDao.insertTransmission(entity)
            transmissionIdToDbId[transmission.id] = dbId
        }

        // Build variant -> market code mapping (filter for IL market)
        val variantIdToMarketCode: Map<String, String?> = graph.variantMarkets
            .filter { it.marketId == "IL" }
            .associate { it.variantId to "IL" }

        // Insert variants
        val variantEntities = graph.variants.mapNotNull { variant ->
            // Get model ID from generation
            val modelId = generationIdToModelId[variant.generationId] ?: return@mapNotNull null
            // Get manufacturer ID from model
            val modelEntity = carCatalogDao.getModelByExternalId(
                graph.generations.firstOrNull { it.id == variant.generationId }?.modelFamilyId ?: return@mapNotNull null
            ) ?: return@mapNotNull null
            val manufacturerId = modelEntity.manufacturerId

            val engineDbId = variant.engineId?.let { engineIdToDbId[it] }
            val transmissionDbId = variant.transmissionId?.let { transmissionIdToDbId[it] }
            val marketCode = variantIdToMarketCode[variant.id] // "IL" or null

            CarVariantEntity(
                externalId = variant.id,
                manufacturerId = manufacturerId,
                modelId = modelId,
                engineId = engineDbId,
                transmissionId = transmissionDbId,
                bodyType = variant.bodyType,
                fromYear = variant.yearFrom,
                toYear = variant.yearTo,
                marketCode = marketCode
            )
        }

        carCatalogDao.insertVariants(variantEntities)
    }

    private suspend fun seedMinimalFallback() {
        // Fallback minimal seed (original hardcoded data)
        val manufacturers = listOf(
            CarManufacturerEntity(nameEn = "Toyota", nameHe = "טויוטה", country = "Japan"),
            CarManufacturerEntity(nameEn = "Hyundai", nameHe = "יונדאי", country = "South Korea"),
            CarManufacturerEntity(nameEn = "Kia", nameHe = "קיה", country = "South Korea"),
            CarManufacturerEntity(nameEn = "Mazda", nameHe = "מזדה", country = "Japan"),
            CarManufacturerEntity(nameEn = "Volkswagen", nameHe = "פולקסווגן", country = "Germany")
        )
        carCatalogDao.insertManufacturers(manufacturers)
        
        // Get manufacturer IDs (query back)
        val allMfgs = carCatalogDao.searchManufacturers(null, limit = 100)
        val toyotaId = allMfgs.firstOrNull { it.nameEn == "Toyota" }?.id ?: 1L
        val hyundaiId = allMfgs.firstOrNull { it.nameEn == "Hyundai" }?.id ?: 2L
        val kiaId = allMfgs.firstOrNull { it.nameEn == "Kia" }?.id ?: 3L
        val mazdaId = allMfgs.firstOrNull { it.nameEn == "Mazda" }?.id ?: 4L
        val vwId = allMfgs.firstOrNull { it.nameEn == "Volkswagen" }?.id ?: 5L

        val models = listOf(
            CarModelEntity(manufacturerId = toyotaId, nameEn = "Corolla", nameHe = "קורולה"),
            CarModelEntity(manufacturerId = toyotaId, nameEn = "Yaris", nameHe = "יאריס"),
            CarModelEntity(manufacturerId = hyundaiId, nameEn = "i10", nameHe = "i10"),
            CarModelEntity(manufacturerId = hyundaiId, nameEn = "i20", nameHe = "i20"),
            CarModelEntity(manufacturerId = hyundaiId, nameEn = "Tucson", nameHe = "טוסון"),
            CarModelEntity(manufacturerId = kiaId, nameEn = "Sportage", nameHe = "ספורטאז'"),
            CarModelEntity(manufacturerId = mazdaId, nameEn = "3", nameHe = "3"),
            CarModelEntity(manufacturerId = vwId, nameEn = "Golf", nameHe = "גולף")
        )
        carCatalogDao.insertModels(models)
    }
}

