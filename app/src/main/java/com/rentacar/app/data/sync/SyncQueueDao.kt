package com.rentacar.app.data.sync

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SyncQueueDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrReplace(item: SyncQueueEntity): Long
    
    /**
     * ORIGINAL BEHAVIOR:
     * - Fetches dirty items from sync_queue table ordered by lastDirtyAt (oldest first)
     * - Default limit is 100 items per query
     * - This limit was used to prevent processing too many items in a single sync run
     * 
     * NOTE: After refactoring, this method may be called with a very high limit
     * or a new method may be added to fetch all dirty items grouped by entity type.
     */
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
    
    /**
     * Get all dirty items for a specific entity type, ordered by lastDirtyAt (oldest first).
     * Used for table-by-table sync processing.
     */
    @Query("""
        SELECT * FROM sync_queue
        WHERE isDirty = 1 AND entityType = :entityType
        ORDER BY lastDirtyAt ASC
    """)
    suspend fun getDirtyItemsByType(entityType: String): List<SyncQueueEntity>
    
    /**
     * Get count of dirty items for a specific entity type.
     * Used to calculate progress totals before starting sync.
     */
    @Query("""
        SELECT COUNT(*) FROM sync_queue
        WHERE isDirty = 1 AND entityType = :entityType
    """)
    suspend fun getDirtyCountByType(entityType: String): Int
    
    /**
     * Get all distinct entity types that have dirty items.
     * Used to determine which tables need to be synced.
     */
    @Query("""
        SELECT DISTINCT entityType FROM sync_queue
        WHERE isDirty = 1
        ORDER BY entityType ASC
    """)
    suspend fun getDirtyEntityTypes(): List<String>
}

