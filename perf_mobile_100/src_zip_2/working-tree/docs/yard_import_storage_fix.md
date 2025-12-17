# Yard Excel Import Storage Rules Fix

## Overview

Yard Excel import was failing with `403 Permission denied` errors when attempting to upload Excel files to Firebase Storage. The error message from Logcat was:

```
StorageException: User does not have permission to access this object. Code: -13021 HttpResult: 403
```

The Yard import function `yardImportCreateJob` returns a Storage path like `yardImports/<uid>/<jobId>.xlsx`, but this path had no Storage security rules defined, causing all uploads to be denied by default.

## Root Cause

The `yardImports/<uid>/<jobId>.xlsx` path had no Storage rule → default deny.

Firebase Storage security rules default to denying all access when no matching rule is found. The existing rules only covered:
- Public listing images
- Private user car images
- Yard gallery images
- Supplier logos

No rule existed for the `yardImports` path used by the Yard Excel import feature.

## What Was Changed

Added a new match rule in `storage.rules` for `yardImports/{userId}/{fileName}`:

- **Authenticated user only**: `request.auth != null`
- **Owner-only access**: `request.auth.uid == userId` - only the yard owner can upload files to their own directory
- **File size limit**: `request.resource.size < 10 * 1024 * 1024` (10MB max)
- **MIME type validation**: `request.resource.contentType == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"` - restricts uploads to Excel .xlsx files only
- **No client-side reads**: `allow read: if false` - client apps don't need to read these files; Cloud Functions use Admin SDK which bypasses rules

The rule was added before the default deny rule to ensure it takes precedence.

## How to Retest

1. Rebuild & reinstall the Android app if needed.
2. Open the Yard Excel Import screen.
3. Select an `.xlsx` file.
4. **Expected result**: Upload succeeds, preview is generated (no 403 error).
5. Verify that:
   - The file upload completes successfully
   - The progress indicator shows upload progress
   - After upload, the preview screen appears (waiting for Cloud Functions to parse the Excel)
   - No permission denied errors appear in Logcat

## Deployment Details

- **Project**: `carexpert-94faa`
- **Storage rules file**: `storage.rules`
- **Deployment command**: `firebase deploy --only storage`
- **Status**: Successfully deployed

