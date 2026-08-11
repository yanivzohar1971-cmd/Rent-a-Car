# Ministry of Transport (gov.il) Sync – DEV Note

This feature syncs yard fleet vehicles with the Israel Ministry of Transport dataset via **data.gov.il CKAN API** (no scraping).

## Callable functions

- **`syncVehicleByPlate`**  
  - Input: `{ plate: string, carId?: string }`  
  - Normalizes plate to digits, looks up the vehicle in CKAN, maps and writes to `users/{yardUid}/carSales/{carId}` under `gov` (raw, mapped, lastSyncAt, syncStatus, syncError).  
  - Returns: `{ ok: boolean, reason?: string, error?: string }`.

- **`startGovSyncJob`**  
  - Input: `{ mode: "ALL" | "PUBLISHED" | "STATUS", status?: string }`  
  - Creates a job doc and returns immediately with `jobId`. A Firestore trigger `onGovSyncJobCreated` runs the actual sync (concurrency 3).

## Required configuration

- **`VEHICLES_RESOURCE_ID`**  
  CKAN resource ID for the vehicles dataset on data.gov.il.  
  Set via Firebase Functions config or environment:
  - Config: `firebase functions:config:set env.vehicles_resource_id="YOUR_RESOURCE_ID"`
  - Or set the `VEHICLES_RESOURCE_ID` environment variable for the Functions runtime.

## Where job docs are stored

- **`govSyncJobs/{jobId}`**  
  Job document: `createdAt`, `createdBy`, `mode`, `statusFilter`, `yardUid`, `total`, `completed`, `successCount`, `failCount`, `currentPlate`, `state` (`pending` | `running` | `done` | `failed`).

- **`govSyncJobs/{jobId}/results`**  
  Subcollection: one doc per vehicle with `plate`, `carId`, `ok`, `reason`, `error`, `finishedAt`.

The YARD Fleet page subscribes to the job doc and the results subcollection for live progress and recent results.

## Vehicle doc shape (gov namespace)

Written to `users/{yardUid}/carSales/{carId}` with `merge: true`:

- `gov.raw` – full CKAN record
- `gov.mapped` – mapped fields (plate, manufacturerCode, manufacturerName, modelCode, …)
- `gov.lastSyncAt` – server timestamp
- `gov.syncStatus` – `"ok"` | `"fail"`
- `gov.syncError` – string or null
