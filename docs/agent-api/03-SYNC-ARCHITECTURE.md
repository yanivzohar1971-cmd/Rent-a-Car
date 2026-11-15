# 03 — Database & Synchronization Architecture

**Verified:** 2026-11-15 from `CloudDeltaSyncWorker`, `SyncQueueDao`, `SyncDirtyMarker`, `CloudToLocalRestoreRepository`, `CloudRestoreWorker`, `firestore.rules`.  
**Follow-up:** Clarified upload≠restore in one worker; queue uniqueness gap; restore LWW only for some types; retry effectiveness gap.

## 1. Overview

| Aspect | Finding |
|--------|---------|
| Local store | Room `rentacar.db` v44 |
| Cloud store | Firestore `users/{uid}/{collection}/{docId}` (`UserCollections`) |
| Upload engine | `CloudDeltaSyncWorker` (**ANDROID_TO_CLOUD only**) |
| Restore engine | `CloudToLocalRestoreRepository` via `CloudRestoreWorker` / yard import hooks |
| Dirty tracking | `sync_queue` + `SyncDirtyMarker` |
| Pattern | **ENTITY_SPECIFIC** — 12 types mirrored; not true single-worker bidirectional delta |

### Synced entity types (exact)

`customer`, `supplier`, `agent`, `carType`, `branch`, `reservation`, `payment`, `commissionRule`, `cardStub`, `request`, `carSale`, `carSaleCommissionPayment`

Firestore collections: `customers`, `suppliers`, `agents`, `carTypes`, `branches`, `reservations`, `payments`, `commissionRules`, `cardStubs`, `requests`, `carSales`, `carSaleCommissionPayments`.

Doc IDs = Room `Long` PK as string. Upload uses full `DocumentReference.set(data)` (overwrite, no merge).

## 2. Directionality

| Direction | Mechanism |
|-----------|-----------|
| ANDROID_TO_CLOUD | Dirty queue → `CloudDeltaSyncWorker.processSyncQueue` |
| CLOUD_TO_ANDROID | Separate full-collection `.get()` restore — **not** watermark delta pull |
| Seed | If `localCount > 0 && cloudCount < localCount`, mark all local rows dirty (or resume existing dirty) |
| ENTITY_SPECIFIC | Reconciliation, price lists, import runs, car catalog, etc. are LOCAL_ONLY |

Triggers: Sync Now (`SyncNowViewModel`), debug receivers, pre-install backup path, Settings restore, yard import `restoreCarSalesOnly()`.

## 3. Dirty-record tracking

- `SyncDirtyMarker` → `SyncQueueDao.markDirty` (`INSERT OR REPLACE` on columns without a verified UNIQUE index on `(entityType, entityId)` ⇒ **duplicate dirty rows can accumulate**).
- **No `user_uid` on `sync_queue`** — not UID-scoped.
- Repos mark dirty on writes; `NewReservationScreen` / `Screens.kt` can mark `cardStub` via **direct** DAO (bypasses marker).
- `markCommissionRuleDirty` defined; **no production caller found** — rules may only upload via seed.

## 4. Restore policies (per type)

| Behavior | Types |
|----------|-------|
| Insert if missing; update if `remote.updatedAt > local.updatedAt` | customers, reservations, carSales |
| Insert-if-missing only (local sticky once present) | suppliers*, agents, carTypes, branches, payments, commissionRules, cardStubs, requests, carSaleCommissionPayments |
| Nested payload | `suppliers.customerTerms` restored via `CustomerTermsRepository.restoreFromCloudPayload` |

\*Supplier row insert-missing; nested terms may still apply.

Restore **never deletes** local-only rows. Worker comments saying “insert-only” are incomplete for the three `updatedAt` types.

## 5. Conflicts, deletes, retries

| Topic | Reality |
|-------|---------|
| Conflict merge | **None.** Upload last Android `set` wins cloud. Restore uses `updatedAt` LWW for 3 types; others ignore newer cloud once local exists. |
| Tombstones | **Absent.** Local delete → upload sees missing row → `markSynced(SUCCESS)` **without** Firestore delete → cloud orphans. |
| Retries | `syncSingleItemWithRetry` (max 3) intended for transient errors, but `syncSingleItem` often catches and returns `false` so **transient retries are largely ineffective**. Item stays dirty with `lastSyncError`. WorkManager may `Result.retry()` the whole job. |

## 6. FAQ (Agent-relevant)

1. **Offline create?** Room upsert + dirty; cloud visible after successful upload.  
2. **Offline update?** Same.  
3. **How dirty?** Marker/DAO/`seed`.  
4. **Both sides change?** Silent clobber risk; no conflict UI.  
5. **Sync fail?** Dirty retained; progress/error fields; weak per-item retry.  
6. **Device unavailable?** Cloud holds last upload; **no verified Android presence heartbeat worker** for Agent availability.  
7. **Safe cloud create/modify?** Authz yes (UID rules); **business-safe no** — no server validation; Android may overwrite or ignore.  
8. **Cloud validations?** Path ownership only in `firestore.rules`.  
9. **Duplicates?** Doc id = Room id; queue duplicates possible; multi-device ID forks possible.  
10. **Deletes synced?** **No.**  
11. **Authoritative?** None fully — Android leads dirty uploads; cloud useful for restore-insert / newer `updatedAt` on 3 types.  
12. **Incompleteness reporting?** Count compare (`DataSyncCheckRepository`), sync progress remaining dirty — **no** last-sync watermark API. Agent must add `coverage` metadata.  
13. **Agent writes via sync?** Not a safe API — prefer Device Executor → repos, or future command API.  
14. **Safeguards needed?** Tombstones, UID-scoped unique queue, server validation, idempotency, conflict policy.  
15. **Last-sync timestamp?** Per-item `lastDirtyAt`/`lastSyncStatus` only — no global pull watermark.

## 7. Agent routing one-liner

Treat Room as offline-capable source for creates/updates until upload; treat cloud as durable replica with weak conflict rules; never assume deletes or Agent Firestore writes are safely synchronized today.
