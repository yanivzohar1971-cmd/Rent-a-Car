# Firestore Indexes Documentation

This document lists the Firestore composite indexes required by the application and maps them to the queries that use them.

## Indexes

### rentalCompanies Collection

**Index:** `isVisible` (ASC) + `sortOrder` (ASC)

**Used by:**
- `fetchVisibleRentalCompaniesForPlacement()` in `web/src/api/rentalCompaniesApi.ts`
- Query: `where('isVisible', '==', true).orderBy('sortOrder', 'asc')`

**Purpose:** Fetches visible rental companies ordered by sort order for display in partner ads strips on the homepage and search pages.

**Deployment:**
```bash
firebase deploy --only firestore:indexes
```

## Other Indexes

See `firestore.indexes.json` for the complete list of indexes including:
- `carSales` collection indexes
- `leads` collection indexes  
- `promotionOrders` collection indexes
