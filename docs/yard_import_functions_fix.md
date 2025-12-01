# Yard Import Functions Deployment Fix

## Overview

The Android Yard Excel Import screen was showing a `NOT_FOUND` error after tapping the "xlsx" button. The error message displayed: "ייבוא צי: הפונקציה לא נמצאה. אנא ודא שהפונקציות מופעלות."

After investigating, we discovered that the `yardImportCreateJob`, `yardImportCommitJob`, and `yardImportParseExcel` Firebase Functions were never deployed to the Firebase project that the Android app uses. The function source code existed in `functions/src/yardImport.ts` and was properly exported in `functions/src/index.ts`, but deployment had never been executed.

The root cause was confirmed by running `firebase functions:list`, which showed only 2 functions (`resolveRoleRequest` and `setUserRole`) but none of the yardImport functions.

All three yardImport functions have now been successfully deployed to project `carexpert-94faa` in the `us-central1` region.

## Project Alignment

| Component | Project ID | Status |
|-----------|-----------|--------|
| Firebase CLI active project | `carexpert-94faa` | ✅ |
| Android app (`google-services.json`) | `carexpert-94faa` | ✅ |
| Project alignment | **MATCH** | ✅ |

The Firebase CLI and Android app were already pointing to the same project (`carexpert-94faa`), so no project switching was needed.

## Functions Deployment

### Before Deployment

When `firebase functions:list` was run initially, only these functions were present:
- `resolveRoleRequest` (callable, us-central1)
- `setUserRole` (callable, us-central1)

The yardImport functions were **NOT DEPLOYED**.

### After Deployment

All three yardImport functions are now deployed:

| Function | Version | Trigger | Location | Status |
|----------|---------|---------|----------|--------|
| `yardImportCreateJob` | v1 | callable | us-central1 | ✅ **DEPLOYED** |
| `yardImportCommitJob` | v1 | callable | us-central1 | ✅ **DEPLOYED** |
| `yardImportParseExcel` | v1 | google.storage.object.finalize | us-central1 | ✅ **DEPLOYED** |

## Root Cause

**NOT_FOUND occurred because `yardImportCreateJob` (and the other yardImport functions) were not deployed in project `carexpert-94faa` that the Android app uses.**

The function source code existed and was properly exported, but `firebase deploy --only functions` had never been run for these functions.

## What Was Done

### Verification Steps
1. ✅ Confirmed Firebase CLI active project: `carexpert-94faa`
2. ✅ Verified Android project_id: `carexpert-94faa` (matched)
3. ✅ Ran `firebase functions:list` - confirmed yardImport functions were missing
4. ✅ Verified function exports in `functions/src/yardImport.ts` and `functions/src/index.ts` - all correct

### Deployment Steps
1. ✅ Built functions: `cd functions && npm run build`
2. ✅ Deployed all functions: `firebase deploy --only functions`
3. ✅ Verified deployment: `firebase functions:list` now shows all three yardImport functions

### Commands Executed

```bash
# Check active project
firebase use

# List deployed functions (before)
firebase functions:list

# Build functions
cd functions
npm run build

# Deploy all functions
cd ..
firebase deploy --only functions

# Verify deployment (after)
firebase functions:list
```

## Next Steps for the User

- [ ] **Rebuild & reinstall the Android app** (if needed)
- [ ] **Open Yard Excel Import screen** in the Android app
- [ ] **Tap the "xlsx" button** to select a file
- [ ] **Verify that NOT_FOUND error is gone** and the import process starts
- [ ] **Confirm that preview appears** after file upload and processing

## Notes

- All functions are deployed in `us-central1` region (default)
- The Android app uses `FirebaseFunctions.getInstance()` without region specification, which defaults to `us-central1`, so there is no region mismatch.
- Function names in the code (`yardImportCreateJob`, etc.) exactly match what Android calls, so no aliasing was needed.

