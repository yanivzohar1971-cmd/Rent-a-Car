# 03 — Database & Synchronization Architecture

**Verified:** 2026-11-15 from `CloudDeltaSyncWorker`, `SyncQueueDao`, `SyncDirtyMarker`, `CloudToLocalRestoreRepository`, `firestore.rules`.

## 1. Overview

| Aspect | Finding |
|--------|---------|
| Local store | Room DB `rentacar.db` v44 |
| Cloud store | Cloud Firestore under `users/{uid}/{collection}` |
| Sync engine | WorkManager `CloudDeltaSyncWorker` |
| Dirty tracking | Room table `sync_queue` via `SyncQueueDao` / `SyncDirtyMarker` |
| Restore | `CloudToLocalRestoreRepository` (cloud → local, local-newer wins) |
| Overall pattern | **ENTITY_SPECIFIC** near-bidirectional for **12** entity types; many entities LOCAL_ONLY |

### Synced entity types (exact)

`customer`, `supplier`, `agent`, `carType`, `branch`, `reservation`, `payment`, `commissionRule`, `cardStub`, `request`, `carSale`, `carSaleCommissionPayment`

Firestore collections (plural): `customers`, `suppliers`, `agents`, `carTypes`, `branches`, `reservations`, `payments`, `commissionRules`, `cardStubs`, `requests`, `carSales`, `carSaleCommissionPayments`.

## 2. Directionality

| Direction | Mechanism |
|-----------|-----------|
| ANDROID_TO_CLOUD | Dirty items uploaded with Firestore `document.set(data)` |
| CLOUD_TO_ANDROID | Restore/delta pull in `CloudToLocalRestoreRepository`; skips when local `updatedAt` newer/equal; **no deletes** applied from cloud |
| BIDIRECTIONAL? | Only for the 12 types, with asymmetric delete behavior |
| ENTITY_SPECIFIC | Yes — commission reconciliation, price lists, import runs, terms customization are not in dirty switch |

## 3. Dirty-record tracking

**Class:** `com.rentacar.app.data.sync.SyncDirtyMarker`  
**DAO:** `SyncQueueDao.markDirty(entityType, entityId, lastDirtyAt)` uses `INSERT OR REPLACE`.

Repositories constructed in `DatabaseModule` receive optional `SyncDirtyMarker` and mark on writes.

**Weaknesses (verified):**

1. `sync_queue` is **not UID-scoped** — rows are global to the device DB.
2. Uniqueness is `(entityType, entityId)` style replace — switching Firebase users on same DB risks cross-user dirty confusion unless `user_uid` backfill / data isolation is perfect.
3. When local row is missing during upload, worker logs and `markSynced` SUCCESS (skips) — **does not delete cloud doc** ⇒ local delete ≠ cloud delete.

## 4. Answers to required questions (with evidence)

### 1. Reservation created offline?

Written to Room via `ReservationRepository`; `SyncDirtyMarker` marks `reservation` dirty; later `CloudDeltaSyncWorker` uploads to `users/{uid}/reservations/{id}`. Until sync succeeds, cloud lacks the row.

### 2. Reservation updated offline?

Same path: local update + dirty mark + eventual `set` overwrite to Firestore.

### 3. How does the app know sync is required?

`sync_queue.isDirty = 1` for `(entityType, entityId)`. Worker also **seeds** all local rows dirty when `localCount > cloudCount` for a category.

### 4. Same record changes locally and remotely?

Restore path: if local newer or equal → **skip cloud overwrite** (`CloudToLocalRestoreRepository` comments: no deletes, no overwrites when local newer). Upload path: last successful Android `set` wins cloud content. **No CRDT / field merge / conflict UI.** Risk of silent last-writer patterns.

### 5. Synchronization fails?

`SyncQueueDao.markFailed`; transient network errors retried in worker; items can remain dirty. Progress via `SyncProgressRepository`.

### 6. Android device unavailable?

Cloud mirror freezes at last successful upload. Unsynchronized LOCAL_ONLY and unsynced dirty rows are invisible to pure cloud clients. Presence (RTDB) can indicate offline — **UNVERIFIED** completeness of Agent-facing availability API (none exists yet).

### 7. Can existing cloud infrastructure safely create/modify business records?

**Not safely for Agent production writes.** Client SDK can write under UID rules, but **Firestore rules do not encode reservation/commission business validation**. Invalid docs can be written and later restored/conflict with Android logic.

### 8. Are all business validations enforced by the cloud?

**No.** Validations live in Android repositories / ViewModels / commission services.

### 9. How are duplicates avoided?

Local PK identity uploaded as Firestore doc id (`entityId.toString()`). Offline create on two devices with independent Room IDs can diverge — **multi-device ID collision / fork risk** if multiple writers share one UID. Seed-by-count heuristic can also mask semantic duplicates.

### 10. Are deletion events synchronized?

**No tombstones found** in upload path. Missing local entity during sync is treated as skip/success, not cloud delete.

### 11. Can cloud data be authoritative for any entity?

Only as a **partial mirror** of the 12 types after successful sync. Never authoritative for LOCAL_ONLY entities. Even for synced types, device may be ahead.

### 12. How can Agent API report incompleteness?

Required response metadata (to implement later):

- `dataSource`: `CLOUD` | `DEVICE` | `MERGED`
- `syncLag`: last successful push/pull timestamps if available
- `coverage`: `FULL` | `CLOUD_PARTIAL` | `DEVICE_ONLY` | `UNAVAILABLE`
- `warnings[]`: e.g. `UNSYNCED_LOCAL_CHANGES_POSSIBLE`

Prefs/progress stores exist for sync UI; per-entity watermarks need explicit Agent contract (Phase 1).

### 13. Can existing sync safely process Agent API changes?

**Reads:** yes if routed through same repos or equivalent Firestore reads.  
**Writes via raw Firestore:** unsafe — bypasses Android validation; may confuse restore.  
**Writes via Device Executor → repositories → dirty marker:** safest alignment with current design.  
**Writes via new Cloud Command API:** required before autonomous cloud mutations.

### 14. Additional safeguards required?

- Server-side command validation for cloud writes
- Tombstones / explicit delete sync
- UID-scoped sync queue
- Idempotency keys for Agent commands
- Conflict policy documentation + tests
- Refuse Agent cloud writes for LOCAL_ONLY entities
- Confirmation for financial mutations

### 15. Reliable last-sync timestamp?

Partial: queue `lastDirtyAt` / `lastSyncStatus` per item; sync progress state; restore watermarks in restore repo. **No complete public per-collection Agent-facing API today.** Feasible to expose in Phase 1–4 contracts.

## 5. Offline / failure / ownership

| Topic | Behavior |
|-------|----------|
| Offline | App continues on Room; dirty accumulates |
| Retry | Transient Firestore errors retried; FAILED status retained |
| Ownership | `user_uid` on rows + Firebase Auth UID path isolation |
| Tenant separation | Firestore `users/{uid}/...`; DAO queries take `currentUid` |

## 6. Design weaknesses relevant to Claude

1. Cloud is not a complete operational store.
2. Deletes do not propagate.
3. No server business rules.
4. Conflict resolution is crude (timestamp / local preference).
5. Count-based seeding can push large backlogs.
6. Agent writing only to cloud can create docs Android later skips or partially applies.
7. Commission reconciliation truth is largely LOCAL_ONLY.

**Do not modify sync in Phase 0.** Phase 10 must validate Agent writes against these realities.
