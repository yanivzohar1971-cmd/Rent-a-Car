package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface ImportLogDao {
    
    @Insert
    suspend fun insertRun(run: SupplierImportRun): Long
    
    @Update
    suspend fun updateRun(run: SupplierImportRun): Int
    
    @Insert
    suspend fun insertEntry(entry: SupplierImportRunEntry): Long
    
    @Query("SELECT * FROM supplier_import_run WHERE supplier_id = :supplierId ORDER BY import_time DESC")
    suspend fun getRunsForSupplier(supplierId: Long): List<SupplierImportRun>
    
    @Query("SELECT * FROM supplier_import_run_entry WHERE run_id = :runId ORDER BY row_number_in_file ASC")
    suspend fun getEntriesForRun(runId: Long): List<SupplierImportRunEntry>
    
    @Query("SELECT COUNT(*) FROM supplier_import_run WHERE supplier_id = :supplierId")
    suspend fun hasRunsForSupplier(supplierId: Long): Int
    
    @Query("SELECT * FROM supplier_import_run WHERE supplier_id = :supplierId AND file_hash = :fileHash LIMIT 1")
    suspend fun findBySupplierAndHash(supplierId: Long, fileHash: String): SupplierImportRun?
    
    @Query("SELECT COUNT(*) > 0 FROM supplier_import_run WHERE supplier_id = :supplierId AND file_hash = :fileHash")
    suspend fun hasDuplicateRun(supplierId: Long, fileHash: String): Boolean
}

