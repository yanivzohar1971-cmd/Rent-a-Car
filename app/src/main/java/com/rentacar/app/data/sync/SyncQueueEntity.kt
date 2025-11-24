package com.rentacar.app.data.sync

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val entityType: String,   // e.g. "customer", "supplier", "reservation"
    val entityId: Long,       // entity primary key
    val isDirty: Boolean = true,
    val lastDirtyAt: Long = System.currentTimeMillis(),
    val lastSyncStatus: String? = null,  // e.g. "SUCCESS", "FAILED"
    val lastSyncError: String? = null    // short EN message for last failure
)

