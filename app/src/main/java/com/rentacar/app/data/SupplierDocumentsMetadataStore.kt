package com.rentacar.app.data

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Metadata model for supplier documents.
 * Physical files are never renamed or moved - only the logical title can be changed.
 */
data class SupplierDocumentMetadata(
    val supplierId: String,
    val filePath: String,   // absolute path to the file on disk
    val title: String,      // logical display name for UI
    val createdAt: Long     // timestamp in millis
) {
    fun toJson(): JSONObject {
        return JSONObject().apply {
            put("supplierId", supplierId)
            put("filePath", filePath)
            put("title", title)
            put("createdAt", createdAt)
        }
    }

    companion object {
        fun fromJson(json: JSONObject): SupplierDocumentMetadata {
            return SupplierDocumentMetadata(
                supplierId = json.getString("supplierId"),
                filePath = json.getString("filePath"),
                title = json.getString("title"),
                createdAt = json.getLong("createdAt")
            )
        }
    }
}

/**
 * JSON-based metadata store for supplier documents.
 * Stores logical display titles separately from physical file names.
 * Physical files are never renamed or moved - only metadata titles can be changed.
 */
class SupplierDocumentsMetadataStore(private val context: Context) {
    private val metadataFile: File = File(context.filesDir, "supplier_documents_metadata.json")

    /**
     * Load all metadata from JSON file.
     */
    private fun loadAllMetadata(): MutableList<SupplierDocumentMetadata> {
        val list = mutableListOf<SupplierDocumentMetadata>()
        try {
            if (metadataFile.exists() && metadataFile.length() > 0) {
                val content = metadataFile.readText()
                val jsonArray = JSONArray(content)
                for (i in 0 until jsonArray.length()) {
                    try {
                        val jsonObj = jsonArray.getJSONObject(i)
                        list.add(SupplierDocumentMetadata.fromJson(jsonObj))
                    } catch (e: Exception) {
                        Log.e("SupplierDocs", "Error parsing metadata entry at index $i", e)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error loading metadata from file", e)
        }
        return list
    }

    /**
     * Save all metadata to JSON file.
     */
    private fun saveAllMetadata(metadataList: List<SupplierDocumentMetadata>) {
        try {
            val jsonArray = JSONArray()
            metadataList.forEach { metadata ->
                jsonArray.put(metadata.toJson())
            }
            metadataFile.writeText(jsonArray.toString())
        } catch (e: Exception) {
            Log.e("SupplierDocs", "Error saving metadata to file", e)
            throw e
        }
    }

    /**
     * Get all documents for a specific supplier.
     */
    fun getDocumentsForSupplier(supplierId: String): List<SupplierDocumentMetadata> {
        return loadAllMetadata().filter { it.supplierId == supplierId }
    }

    /**
     * Upsert (insert or update) a document metadata entry.
     */
    fun upsertDocument(metadata: SupplierDocumentMetadata) {
        val allMetadata = loadAllMetadata()
        val existingIndex = allMetadata.indexOfFirst {
            it.supplierId == metadata.supplierId && it.filePath == metadata.filePath
        }
        
        if (existingIndex >= 0) {
            allMetadata[existingIndex] = metadata
        } else {
            allMetadata.add(metadata)
        }
        
        saveAllMetadata(allMetadata)
    }

    /**
     * Rename document title (metadata only - physical file is never renamed).
     */
    fun renameDocumentTitle(supplierId: String, filePath: String, newTitle: String) {
        val allMetadata = loadAllMetadata()
        val index = allMetadata.indexOfFirst {
            it.supplierId == supplierId && it.filePath == filePath
        }
        
        if (index >= 0) {
            val existing = allMetadata[index]
            allMetadata[index] = existing.copy(title = newTitle)
            saveAllMetadata(allMetadata)
        } else {
            // If metadata doesn't exist, create it
            val newMetadata = SupplierDocumentMetadata(
                supplierId = supplierId,
                filePath = filePath,
                title = newTitle,
                createdAt = System.currentTimeMillis()
            )
            allMetadata.add(newMetadata)
            saveAllMetadata(allMetadata)
        }
    }

    /**
     * Remove document metadata entry.
     */
    fun removeDocument(supplierId: String, filePath: String) {
        val allMetadata = loadAllMetadata()
        allMetadata.removeAll { it.supplierId == supplierId && it.filePath == filePath }
        saveAllMetadata(allMetadata)
    }

    /**
     * Sync metadata with files on disk.
     * Creates metadata entries for files that don't have metadata yet.
     * Optionally removes metadata for files that no longer exist.
     */
    fun syncWithFileSystem(supplierId: String, filesOnDisk: List<File>): List<SupplierDocumentMetadata> {
        val allMetadata = loadAllMetadata()
        val supplierMetadata = allMetadata.filter { it.supplierId == supplierId }.toMutableList()
        val filePathsOnDisk = filesOnDisk.map { it.absolutePath }.toSet()
        
        // Create metadata for files that don't have it
        filesOnDisk.forEach { file ->
            val filePath = file.absolutePath
            val hasMetadata = supplierMetadata.any { it.filePath == filePath }
            
            if (!hasMetadata) {
                // Create new metadata entry with title derived from file name
                val newMetadata = SupplierDocumentMetadata(
                    supplierId = supplierId,
                    filePath = filePath,
                    title = file.name,  // Initial title is the file name
                    createdAt = file.lastModified().takeIf { it > 0 } ?: System.currentTimeMillis()
                )
                supplierMetadata.add(newMetadata)
                
                // Also add to global list for persistence
                val globalIndex = allMetadata.indexOfFirst {
                    it.supplierId == supplierId && it.filePath == filePath
                }
                if (globalIndex < 0) {
                    allMetadata.add(newMetadata)
                }
            }
        }
        
        // Remove metadata for files that no longer exist on disk
        val metadataToRemove = supplierMetadata.filter { it.filePath !in filePathsOnDisk }
        supplierMetadata.removeAll(metadataToRemove)
        allMetadata.removeAll { it.supplierId == supplierId && it.filePath !in filePathsOnDisk }
        
        // Save updated metadata
        saveAllMetadata(allMetadata)
        
        return supplierMetadata
    }
}

