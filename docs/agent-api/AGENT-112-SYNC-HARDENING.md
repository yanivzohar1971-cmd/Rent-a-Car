# AGENT-112 - Sync hardening (no schema change)

Status: helpers + tests only. `CloudDeltaSyncWorker` and Room schema are **unchanged**. Cloud writes remain disabled for the Agent API.

## Added

| Piece | Purpose |
|---|---|
| `data/sync/SyncQueueDeduper` | Collapses dirty `sync_queue` rows to one per `(entityType, entityId)`, keeping the newest `lastDirtyAt` (ties: larger `id`). Returns `kept` (processing order) and `redundant` (safe to mark synced). Non-dirty rows are ignored. |
| `data/sync/SyncRetryPolicy` | Pure retry/backoff + transient classification (100 ms, 200 ms ... linear), never swallows coroutine cancellation, reports `TransientExhausted` so a worker can return `Result.retry()`. |

Tests: `SyncHardeningTest`.

## Known risks (documented, not fixed here)

1. **Duplicate queue rows.** `sync_queue` has an auto-generated PK and no UNIQUE index on `(entityType, entityId)`. `markDirty` is `INSERT OR REPLACE`, which only replaces on PK conflict (never), so repeated edits create repeated rows. Effect: redundant Firestore writes and inflated progress totals. `SyncQueueDeduper` is the in-memory mitigation; the permanent fix is a unique index (**production migration deferred**).
2. **No tombstones / deletes are not synced.** Deleting a local row removes it with no queue entry; Firestore keeps the document. When a dirty row's entity is gone, workers mark the row `SUCCESS` and skip it, so deletes never propagate and cloud restore can resurrect deleted data.
3. **Retry branch is unreachable.** `CloudDeltaSyncWorker.syncSingleItem` catches every `Throwable`, calls `markFailed`, returns `false`; `syncSingleItemWithRetry`'s transient/backoff path therefore never runs, and `doWork` returns `success` even when rows failed for network reasons (rows stay `isDirty=1` but nothing schedules a retry). It also swallows `CancellationException`.
   Future patch (needs an on-device/instrumented test): in `syncSingleItem` rethrow when `SyncRetryPolicy.isTransient(t)` (and always rethrow `CancellationException`); wrap per-row work in `SyncRetryPolicy.execute`; return `Result.retry()` when `SyncRetryPolicy.shouldRetryWork(outcomes)`.
4. **"Not found" is recorded as SUCCESS**, hiding data that failed to load (e.g. wrong user uid).
5. **Seed heuristic.** `checkAndMarkForSeed` marks *all* rows dirty whenever `cloudCount < localCount` and nothing is dirty - a cloud-side delete causes a full re-upload, and with risk 1 it can enqueue duplicates.
6. **Last-writer-wins.** `docRef.set(data)` overwrites the whole document with no version/`updatedAt` comparison; concurrent devices can clobber each other. Several entities (payment, cardStub, request, ...) are looked up by scanning parents (O(n) per row).
7. **Dirty marking is best effort.** `SyncDirtyMarker.mark` swallows exceptions, so a failed queue insert silently loses the sync intent.
8. **AgentDev writes mark rows dirty.** Room commits made by the AgentDev committer go through the normal repositories, so they enqueue sync rows. The agentdev build never reaches Firebase writes (uid is the fixed dev uid and Firebase auth is not used), and no Agent API path enables cloud writes.

## Deferred (needs a Room migration, intentionally not done)

- UNIQUE index on `sync_queue(entityType, entityId)` plus a one-time dedupe in the migration.
- Tombstone table / `deletedAt` column.
