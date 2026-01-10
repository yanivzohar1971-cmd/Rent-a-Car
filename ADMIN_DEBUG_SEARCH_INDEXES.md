# Admin Debug Console - Search Indexes Documentation

## Overview

This document lists the Firestore indexes required for optimal performance of the Admin Debug Console search functionality (yard and car search).

## Required Indexes

### 1. Yard Search Index

**Collection:** `yards`  
**Field:** `displayName` (ASCENDING)  
**Purpose:** Enable prefix search on yard display names  
**Query Pattern:**
```typescript
db.collection('yards')
  .where('displayName', '>=', searchLower)
  .where('displayName', '<=', searchLower + '\uf8ff')
  .limit(10)
```

**Index Definition:** (Already added to `firestore.indexes.json`)
```json
{
  "collectionGroup": "yards",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "displayName",
      "order": "ASCENDING"
    }
  ]
}
```

### 2. Car Search Index - Public Cars

**Collection:** `publicCars`  
**Field:** `licensePlatePartial` (ASCENDING)  
**Purpose:** Enable prefix search on license plate numbers in public cars collection  
**Query Pattern:**
```typescript
db.collection('publicCars')
  .where('licensePlatePartial', '>=', searchLower)
  .where('licensePlatePartial', '<=', searchLower + '\uf8ff')
  .limit(10)
```

**Index Definition:** (Already added to `firestore.indexes.json`)
```json
{
  "collectionGroup": "publicCars",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "licensePlatePartial",
      "order": "ASCENDING"
    }
  ]
}
```

### 3. Car Search Index - Yard Subcollection

**Collection Group:** `carSales`  
**Path Pattern:** `users/{yardUid}/carSales/{carId}`  
**Field:** `licensePlatePartial` (ASCENDING)  
**Purpose:** Enable prefix search on license plate numbers within a yard's carSales subcollection  
**Query Pattern:**
```typescript
db.collection(`users/${yardUid}/carSales`)
  .where('licensePlatePartial', '>=', searchLower)
  .where('licensePlatePartial', '<=', searchLower + '\uf8ff')
  .limit(10)
```

**Index Definition:** (Already added to `firestore.indexes.json`)
```json
{
  "collectionGroup": "carSales",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "licensePlatePartial",
      "order": "ASCENDING"
    }
  ]
}
```

## Performance Optimizations

### Exact Match First
- **Yard Search:** Tries exact UID match first (fastest path) before falling back to name prefix search
- **Car Search:** Tries exact carId match first (fastest path) before falling back to plate prefix search

### Aggressive Limiting
- Default limit: 10 results
- Maximum limit: 50 results (clamped in backend)
- Prevents collection scans and reduces query time

### Prefix Search Strategy
- Uses Firestore range queries (`>=` and `<=` with `\uf8ff` suffix) for prefix matching
- Normalizes query to lowercase and removes spaces for consistent matching
- Works efficiently with single-field indexes

## Deployment

To deploy these indexes:

```bash
# From project root
firebase deploy --only firestore:indexes
```

Or deploy all Firestore rules and indexes:

```bash
firebase deploy --only firestore
```

## Verification

After deployment, verify indexes are created in Firebase Console:
1. Go to Firebase Console → Firestore Database → Indexes
2. Verify all three indexes are listed and in status "Enabled"

## Error Handling

If indexes are missing, the backend functions will:
1. Log the error with correlation ID
2. Return a `failed-precondition` HttpsError with specific index requirements
3. Include instructions for creating the required index

## Performance Metrics

Search queries include timing logs:
- `[YardSearch]` - Logs elapsed time in milliseconds
- `[CarSearch]` - Logs elapsed time in milliseconds

Target performance: < 200-300ms for typical searches (with proper indexes).
