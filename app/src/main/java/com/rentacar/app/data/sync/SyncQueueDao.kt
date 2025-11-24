package com.rentacar.app.data.sync

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SyncQueueDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrReplace(item: SyncQueueEntity): Long
    
    @Query("""
        SELECT * FROM sync_queue
        WHERE isDirty = 1
        ORDER BY lastDirtyAt ASC
        LIMIT :limit
    """)
    suspend fun getDirtyItems(limit: Int = 100): List<SyncQueueEntity>
    
    @Query("UPDATE sync_queue SET isDirty = 0, lastSyncStatus = :status, lastSyncError = NULL WHERE id = :id")
    suspend fun markSynced(id: Long, status: String = "SUCCESS")
    
    @Query("UPDATE sync_queue SET lastSyncStatus = :status, lastSyncError = :error WHERE id = :id")
    suspend fun markFailed(id: Long, status: String = "FAILED", error: String?)
    
    @Query("""
        INSERT OR REPLACE INTO sync_queue(entityType, entityId, isDirty, lastDirtyAt)
        VALUES(:entityType, :entityId, 1, :lastDirtyAt)
    """)
    suspend fun markDirty(entityType: String, entityId: Long, lastDirtyAt: Long)
}

