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
    
    @Query("SELECT * FROM supplier_import_run WHERE supplier_id = :supplierId AND user_uid = :currentUid ORDER BY import_time DESC")
    suspend fun getRunsForSupplier(supplierId: Long, currentUid: String): List<SupplierImportRun>
    
    @Query("SELECT * FROM supplier_import_run_entry WHERE run_id = :runId AND user_uid = :currentUid ORDER BY row_number_in_file ASC")
    suspend fun getEntriesForRun(runId: Long, currentUid: String): List<SupplierImportRunEntry>
    
    @Query("SELECT COUNT(*) FROM supplier_import_run WHERE supplier_id = :supplierId AND user_uid = :currentUid")
    suspend fun hasRunsForSupplier(supplierId: Long, currentUid: String): Int
    
    @Query("SELECT * FROM supplier_import_run WHERE supplier_id = :supplierId AND file_hash = :fileHash AND user_uid = :currentUid LIMIT 1")
    suspend fun findBySupplierAndHash(supplierId: Long, fileHash: String, currentUid: String): SupplierImportRun?
    
    @Query("SELECT COUNT(*) > 0 FROM supplier_import_run WHERE supplier_id = :supplierId AND file_hash = :fileHash AND user_uid = :currentUid")
    suspend fun hasDuplicateRun(supplierId: Long, fileHash: String, currentUid: String): Boolean
}

