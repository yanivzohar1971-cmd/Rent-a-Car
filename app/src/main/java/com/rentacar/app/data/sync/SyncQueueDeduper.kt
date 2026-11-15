package com.rentacar.app.data.sync

/**
 * AGENT-112: collapses duplicate dirty rows in `sync_queue` without any schema change.
 *
 * `sync_queue` has an auto-generated primary key and NO unique index on (entityType, entityId), so
 * `SyncQueueDao.markDirty` (`INSERT OR REPLACE`) can leave several dirty rows for one entity. Each
 * duplicate costs a redundant Firestore write and inflates progress totals.
 *
 * This helper is pure (no Room/Firestore/Android). A future worker patch can feed it
 * `getDirtyItemsByType(...)`, process [Result.kept] and mark [Result.redundant] synced.
 * A UNIQUE index would be the permanent fix but needs a Room migration; that is DEFERRED
 * (see docs/agent-api/AGENT-112-SYNC-HARDENING.md).
 */
object SyncQueueDeduper {
    data class Result(
        /** One row per (entityType, entityId): the one with the newest lastDirtyAt, in oldest-first processing order. */
        val kept: List<SyncQueueEntity>,
        /** Older duplicates that are safe to mark synced without syncing. */
        val redundant: List<SyncQueueEntity>
    ) {
        val duplicatesRemoved: Int get() = redundant.size
    }

    /**
     * Non-dirty rows are ignored (neither kept nor redundant). Ties on lastDirtyAt keep the row with
     * the larger [SyncQueueEntity.id] (the one inserted last).
     */
    fun dedupe(rows: List<SyncQueueEntity>): Result {
        val newest = LinkedHashMap<Pair<String, Long>, SyncQueueEntity>()
        val redundant = mutableListOf<SyncQueueEntity>()
        for (row in rows) {
            if (!row.isDirty) continue
            val key = row.entityType to row.entityId
            val current = newest[key]
            if (current == null) {
                newest[key] = row
            } else if (isNewer(row, current)) {
                redundant += current
                newest[key] = row
            } else {
                redundant += row
            }
        }
        val kept = newest.values.sortedWith(compareBy<SyncQueueEntity> { it.lastDirtyAt }.thenBy { it.id })
        return Result(kept, redundant)
    }

    fun collapse(rows: List<SyncQueueEntity>): List<SyncQueueEntity> = dedupe(rows).kept

    private fun isNewer(candidate: SyncQueueEntity, current: SyncQueueEntity): Boolean =
        candidate.lastDirtyAt > current.lastDirtyAt ||
            (candidate.lastDirtyAt == current.lastDirtyAt && candidate.id > current.id)
}
