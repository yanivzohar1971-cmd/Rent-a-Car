# Snapshot Repair Deployment - Verification & Deployment Guide

## Files Changed

1. **functions/src/cars/publicCarProjectionFunctions.ts**
   - Updated `backfillPublicCarById` to support 3 modes: FULL_REBUILD, SNAPSHOT_REPAIR, SKIP_NO_PUBLIC_DOC
   - Added correlationId generation and propagation
   - Enhanced logging with mode + carId + yardUid + snapshotSource

2. **web/src/adminDebug/debugControls.ts**
   - Updated `controlRebuildPublicCarSnapshot` to display mode in result message

## Code Review Confirmation

### ✅ SNAPSHOT_REPAIR Field Updates (VERIFIED)

**Fields UPDATED (snapshot-only):**
- `yardName`, `yardDisplayName`, `sellerDisplayName`
- `yardPhone`, `sellerPhone`
- `yardWhatsappPhone`, `sellerWhatsappPhone`
- `yardLogoUrl`, `sellerLogoUrl`
- `sellerCity`, `sellerAddress`
- `yardSnapshotSource`, `yardSnapshotMissing` (diagnostic fields)
- `updatedAt` (timestamp)

**Fields NOT TOUCHED (preserved):**
- `isPublished` (publication flag)
- `publishedAt` (publication timestamp)
- `price`, `promotion`, `highlightLevel` (pricing/visibility)
- `brand`, `model`, `year`, `mileageKm` (car details)
- `imageUrls`, `mainImageUrl` (images)
- `city`, `cityNameHe`, `regionId` (location)
- All other non-snapshot fields

**Implementation Details:**
- Uses `set(..., { merge: true })` to preserve existing fields
- Only writes snapshot fields when values exist (no null overwrites)
- Respects admin exposure flags (showNameInBadge, showLogo, etc.)

### ✅ FULL_REBUILD Path (VERIFIED)

- Unchanged from previous behavior
- Calls `upsertPublicCarFromMaster(yardUid, carId)` as before
- Returns same diagnostics structure (with added mode/correlationId)

### ✅ Function Export (VERIFIED)

- Function exported in `functions/src/cars/publicCarProjectionFunctions.ts` (line 379)
- Re-exported in `functions/src/index.ts` (line 298)
- Callable name: `backfillPublicCarById` (matches Admin Debug invocation)

### ✅ Logging & CorrelationId (VERIFIED)

- CorrelationId generated: `backfill-${Date.now()}-${random}`
- Info-level logs include: `mode`, `carId`, `yardUid`, `snapshotSource`, `correlationId`
- CorrelationId included in all response objects

## Deployment Command

Deploy only the updated callable function:

```bash
firebase deploy --only functions:backfillPublicCarById
```

**Expected output:**
- Function compiles successfully
- Function deployed to production
- No errors or warnings

## Verification Checklist

### Prerequisites
- Admin access to `/admin/debug` console
- Read-only mode OFF in Admin Debug
- Access to Firebase Console for logs (optional)

### Test Case A: SNAPSHOT_REPAIR (Not Published + publicCars Exists)

**Setup:**
1. Identify a carId where:
   - Master car is NOT published (status != 'published', publicationStatus != 'PUBLISHED')
   - publicCars/{carId} document EXISTS
   - publicCars doc has missing/incomplete snapshot fields (yardName, yardPhone, etc.)

**Steps:**
1. Navigate to `/admin/debug`
2. Select carId in debug console
3. Go to: **⚙️ Functions/Projection** → **🔧 Rebuild PublicCar Snapshot**
4. Ensure read-only mode is OFF
5. Click to run the control

**Expected Admin Debug Output:**
```json
{
  "success": true,
  "level": "OK" or "WARN",
  "title": "Rebuild PublicCar Snapshot",
  "message": "✅ [SNAPSHOT_REPAIR] Before: MISSING → After: HAS snapshot. Source: yards/users/none",
  "details": {
    "carId": "<carId>",
    "yardUid": "<yardUid>",
    "sellerType": "YARD",
    "mode": "SNAPSHOT_REPAIR",
    "published": false,
    "publicDocExisted": true,
    "correlationId": "backfill-<timestamp>-<random>",
    "before": {
      "exists": true,
      "hasSnapshot": false,
      "state": { ... }
    },
    "after": {
      "hasSnapshot": true,
      "snapshot": {
        "yardName": "<name>",
        "yardPhone": "<phone>",
        "yardLogoUrl": "<logo>",
        ...
      },
      "missingFields": []
    },
    "snapshotSource": "yards" or "users"
  }
}
```

**Verify in Firestore:**
1. Open Firebase Console → Firestore → `publicCars/{carId}`
2. Compare before/after:
   - ✅ `yardName`, `yardPhone`, `yardLogoUrl` updated (if available)
   - ✅ `yardSnapshotSource` updated
   - ✅ `updatedAt` timestamp updated
   - ✅ `isPublished` UNCHANGED (should remain false or as-is)
   - ✅ `price`, `promotion`, `highlightLevel` UNCHANGED
   - ✅ All other non-snapshot fields UNCHANGED

**Verify on Public Page:**
1. Navigate to public car page: `/car/{carId}` (if accessible)
2. Verify seller/yard name, phone, logo display correctly
3. If car is not published, page may not be accessible (expected)

### Test Case B: SKIP_NO_PUBLIC_DOC (Not Published + No publicCars)

**Setup:**
1. Identify a carId where:
   - Master car is NOT published
   - publicCars/{carId} document DOES NOT EXIST

**Steps:**
1. Navigate to `/admin/debug`
2. Select carId in debug console
3. Go to: **⚙️ Functions/Projection** → **🔧 Rebuild PublicCar Snapshot**
4. Click to run the control

**Expected Admin Debug Output:**
```json
{
  "success": true,
  "level": "OK",
  "title": "Rebuild PublicCar Snapshot",
  "message": "✅ [SKIP] Car not published and no publicCars doc exists (safe skip)",
  "details": {
    "carId": "<carId>",
    "published": false,
    "publicDocExisted": false,
    "mode": "SKIP_NO_PUBLIC_DOC",
    "correlationId": "backfill-<timestamp>-<random>"
  }
}
```

**Verify in Firestore:**
1. Open Firebase Console → Firestore → `publicCars/{carId}`
2. ✅ Document should NOT exist (or remain unchanged if it existed)

### Test Case C: FULL_REBUILD (Published Car)

**Setup:**
1. Identify a carId where:
   - Master car IS published (status == 'published' OR publicationStatus == 'PUBLISHED')
   - publicCars/{carId} may or may not exist

**Steps:**
1. Navigate to `/admin/debug`
2. Select carId in debug console
3. Go to: **⚙️ Functions/Projection** → **🔧 Rebuild PublicCar Snapshot**
4. Click to run the control

**Expected Admin Debug Output:**
```json
{
  "success": true,
  "level": "OK" or "WARN",
  "title": "Rebuild PublicCar Snapshot",
  "message": "✅ [FULL_REBUILD] Before: HAS/MISSING → After: HAS snapshot. Source: yards/users/none",
  "details": {
    "carId": "<carId>",
    "yardUid": "<yardUid>",
    "sellerType": "YARD",
    "mode": "FULL_REBUILD",
    "published": true,
    "publicDocExisted": true/false,
    "correlationId": "backfill-<timestamp>-<random>",
    "before": { ... },
    "after": { ... },
    "snapshotSource": "yards" or "users"
  }
}
```

**Verify in Firestore:**
1. Open Firebase Console → Firestore → `publicCars/{carId}`
2. ✅ Document should exist with `isPublished: true`
3. ✅ All fields updated (full rebuild behavior)

## Log Verification (Optional)

Check Cloud Functions logs for correlationId:

```bash
firebase functions:log --only backfillPublicCarById --limit 50
```

Look for log entries with:
- `[backfillPublicCarById] FULL_REBUILD: carId=..., mode=FULL_REBUILD, snapshotSource=..., correlationId=...`
- `[backfillPublicCarById] SNAPSHOT_REPAIR: carId=..., mode=SNAPSHOT_REPAIR, snapshotSource=..., correlationId=...`
- `[backfillPublicCarById] SKIP_NO_PUBLIC_DOC: carId=..., mode=SKIP_NO_PUBLIC_DOC, correlationId=...`

## Rollback (If Needed)

If issues occur, rollback to previous version:

```bash
# List function versions
firebase functions:list

# Rollback to previous version (if available)
# Use Firebase Console → Functions → backfillPublicCarById → Version History
```

## Summary

- ✅ Code review: SNAPSHOT_REPAIR only updates snapshot fields
- ✅ FULL_REBUILD path unchanged
- ✅ Function exported correctly
- ✅ Logging and correlationId added
- ✅ Ready for deployment

**Deploy Command:**
```bash
firebase deploy --only functions:backfillPublicCarById
```

**Verification:**
- Test Case A: SNAPSHOT_REPAIR (not published + publicCars exists)
- Test Case B: SKIP_NO_PUBLIC_DOC (not published + no publicCars)
- Test Case C: FULL_REBUILD (published car)
