package com.rentacar.app.data

import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.ui.vm.yard.YardCarItem
import com.rentacar.app.ui.vm.yard.YardCarStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Repository facade for Yard fleet management.
 * Wraps existing CarSaleRepository and maps CarSale entities to YardCarItem UI models.
 * 
 * For now, uses userUid to identify yard's cars.
 * TODO: In future, add yardId field to CarSale entity for proper yard-specific filtering.
 */
class YardFleetRepository(
    private val carSaleRepository: CarSaleRepository
) {
    /**
     * Get a stream of cars in the current yard's fleet.
     * Filters cars by current user's UID (temporary solution until yardId is added).
     */
    fun getYardFleetStream(): Flow<List<YardCarItem>> {
        val currentUid = CurrentUserProvider.getCurrentUid()
            ?: return kotlinx.coroutines.flow.flowOf(emptyList())
        
        return carSaleRepository.listForUser(currentUid)
            .map { carSales ->
                carSales.map { carSale ->
                    mapCarSaleToYardCarItem(carSale)
                }
            }
    }
    
    /**
     * Maps a CarSale domain entity to a YardCarItem UI model.
     * 
     * Since CarSale currently only has carTypeName (not separate brand/model),
     * we use the carTypeName as the display name.
     * TODO: When CarSale entity is extended with brand/model/year/mileage fields,
     * update this mapping accordingly.
     */
    private fun mapCarSaleToYardCarItem(carSale: CarSale): YardCarItem {
        // Parse carTypeName - typically format is "Brand Model" or just "Model"
        // For now, use the carTypeName as both brand and model
        val carTypeName = carSale.carTypeName.trim()
        val parts = carTypeName.split(" ", limit = 2)
        val brand = if (parts.size > 1) parts[0] else ""
        val model = if (parts.size > 1) parts[1] else carTypeName
        
        // Map status from CarSale.publicationStatus
        val status = when (com.rentacar.app.data.CarPublicationStatus.fromString(carSale.publicationStatus)) {
            com.rentacar.app.data.CarPublicationStatus.DRAFT -> YardCarStatus.DRAFT
            com.rentacar.app.data.CarPublicationStatus.HIDDEN -> YardCarStatus.HIDDEN
            com.rentacar.app.data.CarPublicationStatus.PUBLISHED -> YardCarStatus.PUBLISHED
        }
        
        return YardCarItem(
            id = carSale.id.toString(),
            brand = carSale.brand ?: brand.ifBlank { "לא צוין" },
            model = carSale.model ?: model.ifBlank { carTypeName },
            year = carSale.year,
            price = carSale.salePrice.toInt(),
            mileageKm = carSale.mileageKm,
            status = status,
            createdAtMillis = carSale.createdAt,
            licensePlatePartial = carSale.licensePlatePartial,
            notes = carSale.notes
        )
    }
    
    /**
     * Get cars for Smart Publish with optional filters.
     * Filters are applied client-side after fetching from Room.
     */
    suspend fun getCarsForSmartPublish(
        importJobId: String? = null,
        publicationStatus: com.rentacar.app.data.CarPublicationStatus? = null,
        manufacturer: String? = null,
        manufacturers: Set<String>? = null, // Multi-select manufacturers
        model: String? = null,
        regionIds: Set<String>? = null, // Multi-select regions for location filtering
        cityIds: Set<String>? = null // Optional: Multi-select cities for location filtering
    ): List<CarSale> {
        val currentUid = CurrentUserProvider.getCurrentUid() ?: return emptyList()
        
        // Get all cars for user (Room query)
        val allCars = carSaleRepository.listForUser(currentUid).first()
        
        // Apply filters client-side
        return allCars.filter { carSale ->
            // Filter by importJobId
            if (importJobId != null && carSale.importJobId != importJobId) {
                return@filter false
            }
            
            // Filter by publicationStatus
            if (publicationStatus != null) {
                val carStatus = com.rentacar.app.data.CarPublicationStatus.fromString(carSale.publicationStatus)
                if (carStatus != publicationStatus) {
                    return@filter false
                }
            }
            
            // Filter by manufacturer(s) - support both single and multi-select
            val manufacturerFilter = manufacturers ?: (manufacturer?.let { setOf(it) })
            if (manufacturerFilter != null && manufacturerFilter.isNotEmpty()) {
                val carBrand = carSale.brand
                if (carBrand == null || !manufacturerFilter.any { carBrand.equals(it, ignoreCase = true) }) {
                    return@filter false
                }
            }
            
            // Filter by model
            if (model != null && !carSale.model.equals(model, ignoreCase = true)) {
                return@filter false
            }
            
            // Filter by location (region and/or city)
            // If location filters are active, car must match at least one selected region
            val regionFilter = regionIds
            if (regionFilter != null && regionFilter.isNotEmpty()) {
                val carRegionId = carSale.regionId
                // If car has no regionId, exclude it unless we want to show "no location" cars
                // For now, only show cars that match selected regions
                if (carRegionId == null || !regionFilter.contains(carRegionId)) {
                    return@filter false
                }
            }
            
            // Optional: Filter by city (if city filter is active and region filter passed)
            val cityFilter = cityIds
            if (cityFilter != null && cityFilter.isNotEmpty()) {
                val carCityId = carSale.cityId
                // If car has no cityId, exclude it
                if (carCityId == null || !cityFilter.contains(carCityId)) {
                    return@filter false
                }
            }
            
            true
        }
    }
    
    /**
     * Bulk update publication status for multiple cars.
     * Updates in Room and marks for sync to Firestore.
     */
    suspend fun bulkUpdatePublicationStatus(
        carIds: List<Long>,
        newStatus: com.rentacar.app.data.CarPublicationStatus
    ) {
        if (carIds.isEmpty()) return
        
        val currentUid = CurrentUserProvider.getCurrentUid() ?: return
        
        // Get all cars for user
        val allCars = carSaleRepository.listForUser(currentUid).first()
        
        // Update each car
        for (carSale in allCars) {
            if (carIds.contains(carSale.id)) {
                val updatedCar = carSale.copy(
                    publicationStatus = newStatus.value,
                    updatedAt = System.currentTimeMillis(),
                    isNewFromImport = false // No longer new once published
                )
                carSaleRepository.upsert(updatedCar)
            }
        }
    }
}

