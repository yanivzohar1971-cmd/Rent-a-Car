# AGENT-143 — Phone has fewer records than Firebase: diagnosis and fix

Date: 2026-11-18. Branch: `feature/claude-agent-api`. **Fix NOT installed or deployed.**
This report holds no private records. The screenshot and the data copies are stored privately outside Git.

## Evidence (read-only)

- Screen: the in-app "בדיקת סנכרון נתונים" dialog showed Local 516 / Cloud 1883 and the footer "יש הבדלים". It showed no error, offline state or loading.
  - Per collection, local/cloud:
    - customers 120/349
    - reservations 126/417
    - branches 34/42
    - agents 1/5
    - suppliers 6/6
    - carTypes 1/1
  - Logcat DataSyncCheck: `hasErrors=false`, no PERMISSION_DENIED.
    - cardStubs 104/789
    - requests 84/171
    - carSales 19/82
- Firestore offline cache, compared with a Room copy (both read-only copies):
  - one uid, the same as the Room data;
  - every doc has `id` == docId;
  - 0 duplicates;
  - **0 local-only records**.
  - Cloud-only records: customers 229, reservations 291, cardStubs 685, carSales 63, requests 87, branches 8, agents 4.
- Dates: the matched ids are the oldest records (to early Dec 2025). Every cloud-only id is newer (Dec 2025 → Aug 2026). The current installation was first installed on 2026-08-19 and seeded with an older data set.

## Root cause

The records are in Firebase and were never downloaded.
- The app has **no automatic Firebase → Room download**. `CloudDeltaSyncWorker` only uploads.
- Download happens only through the manual Settings restore (`CloudRestoreWorker`) or the car-sales-only restore after a Yard import. This was never run on this installation.
- It is not a permission, uid, pagination or UI-filter problem.

## Defects fixed in the restore path

1. A missing cloud `updatedAt` defaulted to "now" and overwrote local records. It now never counts as newer.
2. Local records with a pending (dirty) upload could be overwritten. Now they are skipped and counted (`skippedPendingLocal`).
3. The `insertIgnore` result was ignored, so a conflict was counted as restored. It is now reported as `conflicts`.
4. The fetch was a single unpaginated `get()`. It is now paginated by document id (`FirestoreDocumentSource`, page size 500).
5. The worker reported success unconditionally. Output now includes `complete`, `errorCount`, `conflicts` and `skippedPendingLocal`.
6. The sync-check dialog had no way to act. It now has a "הורד חסרים מהענן" button, which opens the existing confirmation dialog. The restore text is corrected: the download adds missing records, updates only when the cloud is newer, never overwrites unsynced local changes, never deletes and never uploads.

Files changed:
- `data/sync/RestoreMergePolicy.kt` (new)
- `data/sync/CloudToLocalRestoreRepository.kt`
- `work/CloudRestoreWorker.kt`
- `ui/screens/SettingsSyncCheckDialog.kt`
- `ui/screens/SettingsReportsScreens.kt`
- test `data/sync/CloudRestoreConvergenceTest.kt` (new)

## Tests

- `CloudRestoreConvergenceTest`: 12/12 pass. It uses Robolectric, an in-memory synthetic Room DB and a fake cloud, with no Firebase and no real data. It covers:
  - cloud has more records;
  - Room has more records (nothing deleted);
  - newer and older timestamps;
  - missing timestamp (regression);
  - a pending local change is kept;
  - an id owned by another owner is reported as a conflict;
  - idempotent second run;
  - an interrupted collection resumes;
  - financial values unchanged;
  - an inactive customer is restored;
  - pagination;
  - the policy table.
- Full `testStandardDebugUnitTest`: 924 tests, 0 failures. `assembleStandardDebug` and `compileAgentstageDebugKotlin` pass.
- Read-only dry run of the new policy against copies of the phone data:
  - would INSERT customers 229, reservations 291, carSales 63, branches 8, agents 4, cardStubs 685, requests 87;
  - 0 overwrites, 0 pending conflicts, 0 id conflicts.

## Limitations

- `FirestoreDocumentSource` pagination was unit-tested through the generic paginator only. It was not run against the Firebase emulator.
- The download is still owner-initiated, not automatic.

## Next step (requires separate owner approval)

1. Build the standard debug APK from this commit and install it in place using the AGENT-142 procedure (backup and gates first).
2. Open Settings → sync check → "הורד חסרים מהענן" → confirm.
3. Re-run the sync check and verify that the counts converge.
