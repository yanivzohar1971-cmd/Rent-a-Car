package com.rentacar.app.data.location

import android.content.Context
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.rentacar.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repository for loading and accessing the location catalog.
 * Loads from res/raw/location_catalog.v1.json
 * 
 * This is a singleton-style repository that loads the catalog once and caches it.
 * The catalog is static and doesn't change at runtime.
 */
class LocationCatalogRepository(
    private val context: Context
) {
    private val gson: Gson = GsonBuilder()
        .setLenient()
        .create()
    
    private var cachedCatalog: LocationCatalog? = null
    
    /**
     * Load the location catalog from JSON resource.
     * Caches the result for subsequent calls.
     */
    suspend fun loadCatalog(): LocationCatalog = withContext(Dispatchers.IO) {
        if (cachedCatalog != null) {
            return@withContext cachedCatalog!!
        }
        
        try {
            val inputStream = context.resources.openRawResource(R.raw.location_catalog_v1)
            val jsonText = inputStream.bufferedReader().use { it.readText() }
            
            val catalog = gson.fromJson(jsonText, LocationCatalog::class.java)
            cachedCatalog = catalog
            catalog
        } catch (e: Exception) {
            android.util.Log.e("LocationCatalogRepository", "Error loading location catalog", e)
            // Return empty catalog on error
            LocationCatalog(countryCode = "IL", regions = emptyList())
        }
    }
    
    /**
     * Get all regions in the catalog.
     */
    suspend fun getRegions(): List<Region> {
        return loadCatalog().regions
    }
    
    /**
     * Get cities for a specific region.
     */
    suspend fun getCitiesByRegion(regionId: String): List<City> {
        val region = getRegionById(regionId)
        return region?.cities ?: emptyList()
    }
    
    /**
     * Get neighborhoods for a specific city.
     */
    suspend fun getNeighborhoodsByCity(cityId: String): List<Neighborhood> {
        val catalog = loadCatalog()
        for (region in catalog.regions) {
            val city = region.cities.firstOrNull { it.id == cityId }
            if (city != null) {
                return city.neighborhoods
            }
        }
        return emptyList()
    }
    
    /**
     * Get a region by ID.
     */
    suspend fun getRegionById(id: String): Region? {
        return loadCatalog().regions.firstOrNull { it.id == id }
    }
    
    /**
     * Get a city by ID (searches across all regions).
     */
    suspend fun getCityById(id: String): City? {
        val catalog = loadCatalog()
        for (region in catalog.regions) {
            val city = region.cities.firstOrNull { it.id == id }
            if (city != null) {
                return city
            }
        }
        return null
    }
    
    /**
     * Get a neighborhood by ID (searches across all regions and cities).
     */
    suspend fun getNeighborhoodById(id: String): Neighborhood? {
        val catalog = loadCatalog()
        for (region in catalog.regions) {
            for (city in region.cities) {
                val neighborhood = city.neighborhoods.firstOrNull { it.id == id }
                if (neighborhood != null) {
                    return neighborhood
                }
            }
        }
        return null
    }
    
    /**
     * Get the city that contains a specific neighborhood.
     */
    suspend fun getCityForNeighborhood(neighborhoodId: String): City? {
        val catalog = loadCatalog()
        for (region in catalog.regions) {
            for (city in region.cities) {
                if (city.neighborhoods.any { it.id == neighborhoodId }) {
                    return city
                }
            }
        }
        return null
    }
    
    /**
     * Get the region that contains a specific city.
     */
    suspend fun getRegionForCity(cityId: String): Region? {
        val catalog = loadCatalog()
        return catalog.regions.firstOrNull { region ->
            region.cities.any { it.id == cityId }
        }
    }
}

