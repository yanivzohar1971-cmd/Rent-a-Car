package com.rentacar.app.data

import com.rentacar.app.data.auth.CurrentUserProvider
import com.rentacar.app.ui.vm.yard.YardCarItem
import com.rentacar.app.ui.vm.yard.YardCarStatus
import kotlinx.coroutines.flow.Flow
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
            createdAtMillis = carSale.createdAt
        )
    }
}

