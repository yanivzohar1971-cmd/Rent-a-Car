# Admin Debug Snapshot Export

This document describes how to export Firestore data to JSON snapshot files for the Admin Debug UI.

## Overview

The Admin Debug UI uses static JSON snapshot files to load yards and cars data without making Firebase function calls. This exporter script reads data from Firestore and generates the required JSON files.

## Prerequisites

1. **WSL (Windows Subsystem for Linux)** - The script is designed to run in WSL
2. **Authentication** - Choose one of the following methods:
   - **Option A**: Application Default Credentials (requires gcloud)
   - **Option B**: Service Account Key (recommended for WSL/CI, no gcloud needed)

## Authentication Methods

### Option A: Application Default Credentials (requires gcloud)

If you have Google Cloud SDK installed and configured:

```bash
# In WSL, authenticate with Google Cloud
gcloud auth application-default login

# Verify authentication
gcloud auth application-default print-access-token
```

This will open a browser window for authentication. After successful authentication, the credentials are stored locally and will be used automatically by the Firebase Admin SDK.

**Note**: This method requires `gcloud` to be installed and configured. If you don't have gcloud or prefer not to use it, use Option B instead.

### Option B: Service Account Key (recommended for WSL/CI)

This method works without gcloud and is recommended for WSL environments or CI/CD pipelines.

#### Step 1: Create Service Account

1. Go to **Google Cloud Console** → Select project: `carexpert-94faa`
2. Navigate to **IAM & Admin** → **Service Accounts**
3. Click **Create Service Account**
4. Enter a name (e.g., "admin-debug-exporter")
5. Click **Create and Continue**

#### Step 2: Grant Permissions

1. In the **Grant this service account access to project** section:
2. Add role: **Cloud Datastore User** (or **Firestore Viewer**)
   - This role provides read access to Firestore
3. Click **Continue** → **Done**

#### Step 3: Create and Download Key

1. Find your service account in the list
2. Click on it → **Keys** tab → **Add Key** → **Create new key**
3. Choose **JSON** format
4. Click **Create** - the key file will download automatically

#### Step 4: Save Key File

1. Create the keys directory (if it doesn't exist):
   ```bash
   mkdir -p tools/adminDebug/keys
   ```
2. Move the downloaded JSON key file to:
   ```
   tools/adminDebug/keys/carexpert-94faa-sa.json
   ```
3. **Important**: This directory is gitignored - your key will never be committed

#### Step 5: Run Exporter

**Method 1: Using helper script (recommended)**
```bash
./tools/adminDebug/runExportSnapshot.sh
```

**Method 2: Using environment variable**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your-key.json
npm run export:debugSnapshot
```

**Method 3: Using default path**
If the key is at `tools/adminDebug/keys/carexpert-94faa-sa.json`, the exporter will automatically use it:
```bash
npm run export:debugSnapshot
```

**Security Note**: Never commit service account keys to git. The `tools/adminDebug/keys/` directory is gitignored.

## Usage

### Run the Export Script

From the repository root:

```bash
npm run export:debugSnapshot
```

Or directly:

```bash
node tools/adminDebug/exportDebugSnapshot.mjs
```

### What It Does

1. **Connects to Firestore** using Application Default Credentials (if available) or Service Account key (fallback)
2. **Queries yards collection** - Exports all yards with:
   - `yardUid` (document ID)
   - `name` (from `displayName` or `yardName` field)
   - `phones` (array extracted from `phones`, `phone`, `contactPhone`, or `secondaryPhone` fields)

3. **Queries cars for each yard** - For each yard, exports cars from `users/{yardUid}/carSales` with:
   - `carId` (document ID)
   - `plateNumber` (from `licensePlatePartial` field)
   - `make` (from `brand` field)
   - `model` (from `model` field)
   - `year` (from `year` field, must be number)
   - `title` (generated as `"${brand} ${model}"` if both exist)

4. **Writes output files**:
   - `web/public/adminDebug/yards.json` - Array of yard objects
   - `web/public/adminDebug/carsByYard.json` - Object mapping yardUid to array of cars

## Output Format

### yards.json

```json
[
  {
    "yardUid": "abc123...",
    "name": "Yard Name",
    "phones": ["050-1234567", "03-1234567"]
  },
  {
    "yardUid": "def456...",
    "name": "Another Yard",
    "phones": null
  }
]
```

### carsByYard.json

```json
{
  "abc123...": [
    {
      "carId": "car123",
      "plateNumber": "12-345-67",
      "make": "Toyota",
      "model": "Corolla",
      "year": 2020,
      "title": "Toyota Corolla"
    }
  ],
  "def456...": []
}
```

## After Export

1. **Review the JSON files** - Check that the data looks correct
2. **Build the web app**:
   ```bash
   cd web
   npm run build
   ```
3. **Deploy yardsite** - Use your existing deployment script

## Troubleshooting

### "Failed to initialize Firebase Admin"

**Error**: `Failed to initialize Firebase Admin: ...` or `Could not load the default credentials`

**Solution**: 
- **If using ADC**: Make sure you've run `gcloud auth application-default login` and the authentication was successful
- **If using Service Account key**: 
  - Verify the key file exists at the expected path
  - Check that `GOOGLE_APPLICATION_CREDENTIALS` env var points to the correct file (if set)
  - Ensure the key file is valid JSON and contains `project_id`, `private_key`, and `client_email`
  - Verify the service account has "Cloud Datastore User" or "Firestore Viewer" role

### "No yards found"

**Error**: `No yards found in yards collection`

**Solution**: 
- Verify you're connected to the correct Firestore project (`carexpert-94faa`)
- Check that the `yards` collection exists and has documents
- Verify your Application Default Credentials have read access to Firestore

### "Failed to export cars for yard"

**Warning**: `Failed to export cars for yard {yardUid}: ...`

**Solution**: 
- This is a warning, not a fatal error - the script continues with other yards
- Check if the yard document exists in `users/{yardUid}`
- Verify the `carSales` subcollection exists for that yard
- Some yards may legitimately have no cars

### Permission Errors

**Error**: `PERMISSION_DENIED` or similar

**Solution**:
- **If using ADC**: Ensure your Google account has Firestore read permissions for the project. Re-authenticate: `gcloud auth application-default login`
- **If using Service Account key**: Verify the service account has "Cloud Datastore User" or "Firestore Viewer" role in IAM
- Check project ID is correct: `carexpert-94faa`

## Performance

- **Yards**: Typically exports in seconds (usually < 1000 yards)
- **Cars**: Processes yards in batches of 10 to avoid overwhelming Firestore
- **Progress**: Shows progress every 50 yards processed
- **Total time**: Usually completes in 1-5 minutes depending on data size

## Data Sources

The exporter reads from:

- **Yards**: `yards` collection (root level)
- **Cars**: `users/{yardUid}/carSales` subcollection for each yard

This matches the data structure used by the Admin Debug functions (`adminDebugListYards` and `adminDebugListYardCars`).

## Authentication Method Detection

The exporter automatically selects the authentication method with the following priority:

1. **Service Account Key (preferred)**: If a key is available, it is always used
   - Checks `GOOGLE_APPLICATION_CREDENTIALS` env var first
   - If not set, checks default path: `tools/adminDebug/keys/carexpert-94faa-sa.json`
   - If found, shows: `[Export] Auth: SERVICE_ACCOUNT_KEY` with service account email
2. **Application Default Credentials (fallback)**: Only used if no Service Account key is found
   - Requires `gcloud auth application-default login`
   - If successful, shows: `[Export] Auth: ADC (Application Default Credentials)`

**Note**: When a Service Account key exists at the default path or is set via environment variable, the exporter will always use it and will not attempt ADC. This ensures consistent authentication and avoids permission issues.

## Notes

- The script writes files atomically (temp file then rename) to avoid corruption
- Missing fields are set to `null` (not `undefined`) to match JSON format
- Phone numbers are deduplicated if multiple sources provide the same number
- Cars without a yard are not exported (only cars in `users/{yardUid}/carSales`)
- Service Account keys are gitignored - never commit them to the repository
