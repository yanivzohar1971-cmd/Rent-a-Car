# Bug Fix Report: Publish Pipeline Hotfix
**Date:** 2026-01-08  
**Type:** HOTFIX (No Rollback)  
**Status:** FIXED

## Symptom

Cars do not transition to published status and no longer appear on the car selling page (buyer/public listing). The publish pipeline (MASTER carSales → Functions projection → publicCars → Web listing) was failing silently.

**User Impact:**
- Yard users click "Publish" but cars don't appear on public listing
- Public car listing page shows empty or missing cars
- No error messages shown to users

## Root Cause(s)

### 1. **Firestore "undefined write" failures (PRIMARY ROOT CAUSE)**
- `carsMasterApi.ts` and `yardBulkStatusApi.ts` were sending `undefined` values to Firestore
- Firestore rejects `undefined` values, causing silent write failures
- When writes fail, `status`, `publicationStatus`, and `isPublished` fields are not updated
- Functions trigger never fires because MASTER doc never changes

**Files affected:**
- `web/src/api/carsMasterApi.ts` - `saveYardCar()` function
- `web/src/api/yardBulkStatusApi.ts` - `bulkUpdateCarStatus()` function

### 2. **Missing canonical publish signals**
- Some code paths set `status='published'` but forgot to set `publicationStatus='PUBLISHED'` and `isPublished=true`
- Functions trigger relies on multiple fields for publish detection
- Inconsistent field values cause projection to fail

**Files affected:**
- `web/src/api/carsMasterApi.ts` - `saveYardCar()` function
- `web/src/api/yardBulkStatusApi.ts` - `bulkUpdateCarStatus()` function

### 3. **No backward compatibility for old docs**
- Public listing query uses `where('isPublished', '==', true)`
- Old docs created before `isPublished` field was added return 0 results
- Site appears empty even when published cars exist

**Files affected:**
- `web/src/api/publicCarsApi.ts` - `fetchPublicCars()` function

### 4. **Silent projection failures**
- Functions trigger errors were logged but not detailed enough
- Seller snapshot load failures could abort entire projection write
- No fallback to write core car fields when seller data fails

**Files affected:**
- `functions/src/cars/publicCarSyncTrigger.ts` - `onCarSaleChangePublicProjection()` trigger
- `functions/src/cars/publicCarProjection.ts` - `upsertPublicCarFromMaster()` function

## Fixes Applied

### Fix #1: Strip undefined values before Firestore writes
**File:** `web/src/api/carsMasterApi.ts`

**Changes:**
- Added `stripUndefined()` helper function to recursively remove undefined values
- Applied sanitization in `saveYardCar()` before `setDoc()` call
- Ensured arrays are at least `[]` (not undefined)
- Added DEV-only verification readback to detect field mismatches

**Lines changed:** ~318-450

**Code:**
```typescript
function stripUndefined(obj: any): any {
  // Recursively removes undefined values
  // Returns null for null/undefined, arrays mapped, objects cleaned
}

// In saveYardCar():
const sanitizedData = stripUndefined(docData);
await setDoc(carRef, sanitizedData, { merge: true });
```

### Fix #2: Ensure canonical publish signals everywhere
**Files:** 
- `web/src/api/carsMasterApi.ts`
- `web/src/api/yardBulkStatusApi.ts`

**Changes:**
- Always set all 3 fields together: `status`, `publicationStatus`, `isPublished`
- Added `publishedAt` timestamp for published cars
- Strip undefined from batch update payloads

**Lines changed:**
- `carsMasterApi.ts`: ~386-396
- `yardBulkStatusApi.ts`: ~97-120

**Invariants enforced:**
- `status === 'published'` → `publicationStatus='PUBLISHED'` AND `isPublished=true`
- `status === 'archived'` → `publicationStatus='HIDDEN'` AND `isPublished=false`
- `status === 'draft'` → `publicationStatus='DRAFT'` AND `isPublished=false`

### Fix #3: Backward-compatible fallback query
**File:** `web/src/api/publicCarsApi.ts`

**Changes:**
- If primary query `where('isPublished', '==', true)` returns 0 docs, try fallback query without filter
- In-memory filter to keep only published-looking docs:
  - `isPublished === true` OR
  - (`isPublished` missing AND (`publicationStatus=='PUBLISHED'` OR `status=='published'`))
- Log fallback usage for monitoring

**Lines changed:** ~304-350

**Code:**
```typescript
// Primary query
const q = query(publicCarsCollection, where('isPublished', '==', true));
const snapshot = await getDocsFromServer(q);

// Fallback if empty
if (snapshot.empty) {
  const fallbackQ = query(publicCarsCollection);
  fallbackSnapshot = await getDocsFromServer(fallbackQ);
  // Filter in-memory...
}
```

### Fix #4: Enhanced error handling in Functions
**Files:**
- `functions/src/cars/publicCarSyncTrigger.ts`
- `functions/src/cars/publicCarProjection.ts`

**Changes:**
- Wrapped `upsertPublicCarFromMaster()` and `unpublishPublicCar()` calls in try/catch
- Enhanced error logging with `carId`, `yardUid`, error codes, and stack traces
- Added fallback to write core car fields if seller snapshot load fails
- Ensure `isPublished: true` is always written for published cars

**Lines changed:**
- `publicCarSyncTrigger.ts`: ~56-70
- `publicCarProjection.ts`: ~847-890

**Code:**
```typescript
// In publicCarProjection.ts:
try {
  await publicCarRef.set(updateData, { merge: true });
} catch (writeError) {
  // Retry with core fields only (seller snapshot optional)
  const coreFields = { /* car basics only */ };
  await publicCarRef.set(coreFields, { merge: true });
}
```

### Fix #5: Enhanced logging for debugging
**Files:**
- `web/src/api/yardPublishApi.ts`
- `web/src/api/yardBulkStatusApi.ts`
- `web/src/api/carsMasterApi.ts`

**Changes:**
- Added before/after status logging in all publish paths
- Log `carId`, `yardUid`, field values, and write results
- DEV-only readback verification to detect field mismatches
- Log undefined count stripped from payloads

**Lines changed:**
- `yardPublishApi.ts`: ~50-65
- `yardBulkStatusApi.ts`: ~130-140
- `carsMasterApi.ts`: ~400-450

## Verification Steps

### 1. Local Verification
```bash
# Start web dev server
cd web
npm run dev

# Test publish flow:
# 1. Login as yard user
# 2. Create/edit a car
# 3. Click "Publish"
# 4. Verify in browser console: logs show before/after status
# 5. Verify in Firestore console: MASTER doc has:
#    - status: 'published'
#    - publicationStatus: 'PUBLISHED'
#    - isPublished: true
#    - publishedAt: <timestamp>
```

### 2. Functions Trigger Verification
```bash
# Deploy functions
cd functions
npm run build
firebase deploy --only functions

# Check Functions logs:
firebase functions:log --only onCarSaleChangePublicProjection

# Verify:
# - Trigger fires when MASTER doc changes
# - publicCars/{carId} is created/updated
# - publicCars doc has isPublished: true
```

### 3. Public Listing Verification
```bash
# Build and deploy web
cd web
npm run build
firebase deploy --only hosting

# Test public listing:
# 1. Visit buyer/public car listing page
# 2. Verify published cars appear
# 3. Verify SOLD cars never appear
# 4. Verify HIDDEN/DRAFT cars never appear
# 5. Check browser console for fallback query logs (if any)
```

### 4. Edge Cases
- [ ] Publish single car → verify appears in listing
- [ ] Bulk publish multiple cars → verify all appear
- [ ] Unpublish (HIDDEN) → verify disappears from listing
- [ ] Mark as SOLD → verify disappears from listing
- [ ] Publish car with missing seller profile → verify core fields still written
- [ ] Old doc without `isPublished` field → verify fallback query works

## Deploy Commands

### Functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions:onCarSaleChangePublicProjection
```

### Web
```bash
cd web
npm install
npm run build
firebase deploy --only hosting
```

### Full Deploy (if needed)
```bash
# Functions first (projection trigger)
cd functions
npm install
npm run build
firebase deploy --only functions

# Then web (API fixes)
cd ../web
npm install
npm run build
firebase deploy --only hosting
```

## Rollback Notes

**IMPORTANT:** This is a HOTFIX - no rollback planned. If rollback is needed:

### Rollback Functions
```bash
cd functions
git checkout HEAD~1 -- src/cars/publicCarSyncTrigger.ts src/cars/publicCarProjection.ts
npm run build
firebase deploy --only functions
```

### Rollback Web
```bash
cd web
git checkout HEAD~1 -- src/api/carsMasterApi.ts src/api/yardPublishApi.ts src/api/yardBulkStatusApi.ts src/api/publicCarsApi.ts
npm run build
firebase deploy --only hosting
```

**Rollback Impact:**
- Cars will stop appearing on public listing again
- Publish button will fail silently
- Root cause (undefined writes) will return

## Files Changed

### Web (4 files)
1. `web/src/api/carsMasterApi.ts`
   - Added `stripUndefined()` helper
   - Sanitize payload before Firestore write
   - Enhanced logging and verification

2. `web/src/api/yardPublishApi.ts`
   - Enhanced before/after status logging

3. `web/src/api/yardBulkStatusApi.ts`
   - Strip undefined from batch updates
   - Enhanced logging

4. `web/src/api/publicCarsApi.ts`
   - Added fallback query for backward compatibility
   - In-memory filtering for old docs

### Functions (2 files)
1. `functions/src/cars/publicCarSyncTrigger.ts`
   - Enhanced error handling and logging

2. `functions/src/cars/publicCarProjection.ts`
   - Fallback to core fields if seller snapshot fails
   - Enhanced error logging

## Manual Checks Performed

- [x] Code compiles without errors
- [x] No TypeScript errors
- [x] No linter errors
- [x] All undefined values stripped before Firestore writes
- [x] Canonical publish signals set in all paths
- [x] Fallback query implemented for backward compatibility
- [x] Error handling added to Functions
- [x] Logging added to all publish paths

## Remaining Risks / TODO

### Low Risk
- Fallback query may return large result sets (no limit) - monitor performance
- In-memory filtering on fallback query may be slow for large datasets

### Monitoring
- Watch Functions logs for projection errors
- Monitor public listing page load times
- Track publish success rate (before/after status matches)

### Future Improvements (NOT in this hotfix)
- Add Firestore index for `isPublished` field if not exists
- Add metrics/analytics for publish success rate
- Consider adding retry logic for transient Firestore errors
- Add unit tests for `stripUndefined()` function

## Summary

This hotfix addresses the root cause of cars not appearing on public listings:
1. **Fixed undefined writes** that caused silent Firestore failures
2. **Ensured canonical publish signals** are always set together
3. **Added backward compatibility** for old docs missing `isPublished`
4. **Enhanced error handling** to prevent silent projection failures
5. **Added comprehensive logging** for debugging

All changes are **incremental and non-destructive** - no existing functionality was removed or replaced.
