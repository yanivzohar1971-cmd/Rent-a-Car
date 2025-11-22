# Room Database Schema Analysis for Delta Sync Readiness

**Analysis Date:** 2024  
**Database Version:** 31  
**Purpose:** Determine if current schema supports timestamp-based or dirty-flag-based delta sync to Firestore

---

## Executive Summary

**Current Status:** ❌ **NOT READY** for timestamp-based delta sync

**Key Findings:**
- Only 4 out of 19 entities have `updatedAt` fields suitable for delta sync
- **Zero** DAO queries currently support delta filtering (`WHERE updatedAt > :lastSync`)
- **Zero** entities have dirty flags or sync metadata
- Currently only **full sync** is feasible without schema changes

---

## 1. Complete Entity Inventory

### 1.1 Core Business Entities

| Entity Name | Table Name | Primary Key | Time/Sync Fields | Delta Sync Ready? |
|------------|------------|-------------|------------------|-------------------|
| **Customer** | `Customer` | `id: Long` | `createdAt: Long`, `updatedAt: Long` | ✅ **YES** (needs DAO query) |
| **Supplier** | `Supplier` | `id: Long` | **none** | ❌ **NO** |
| **Branch** | `Branch` | `id: Long` | **none** | ❌ **NO** |
| **Reservation** | `Reservation` | `id: Long` | `createdAt: Long`, `updatedAt: Long` | ✅ **YES** (needs DAO query) |
| **Payment** | `Payment` | `id: Long` | `date: Long` (payment date only) | ❌ **NO** |
| **CarSale** | `CarSale` | `id: Long` | `createdAt: Long`, `updatedAt: Long`, `saleDate: Long` | ✅ **YES** (needs DAO query) |

### 1.2 Reference/Catalog Entities

| Entity Name | Table Name | Primary Key | Time/Sync Fields | Delta Sync Ready? |
|------------|------------|-------------|------------------|-------------------|
| **CarType** | `CarType` | `id: Long` | **none** | ❌ **NO** |
| **Agent** | `Agent` | `id: Long` | **none** | ❌ **NO** |
| **CommissionRule** | `CommissionRule` | `id: Long` | **none** | ❌ **NO** |
| **CardStub** | `CardStub` | `id: Long` | **none** | ❌ **NO** |
| **Request** | `Request` | `id: Long` | `createdAt: Long` (no `updatedAt`) | ❌ **NO** |

### 1.3 Import/Configuration Entities

| Entity Name | Table Name | Primary Key | Time/Sync Fields | Delta Sync Ready? |
|------------|------------|-------------|------------------|-------------------|
| **SupplierTemplate** | `supplier_template` | `id: Long` | `createdAt: Long`, `updatedAt: Long` | ✅ **YES** (needs DAO query) |
| **SupplierMonthlyHeader** | `supplier_monthly_header` | `id: Long` | `importedAtUtc: Long`, `createdAt: Long`, `headerHash: String?` | ⚠️ **PARTIAL** |
| **SupplierMonthlyDeal** | `supplier_monthly_deal` | `id: Long` | `importedAtUtc: Long`, `createdAt: Long`, `rowHash: String?` | ⚠️ **PARTIAL** |
| **SupplierImportRun** | `supplier_import_run` | `id: Long` | `importTime: Long`, `fileHash: String?` | ⚠️ **PARTIAL** |
| **SupplierImportRunEntry** | `supplier_import_run_entry` | `id: Long` | **none** | ❌ **NO** |
| **SupplierPriceListHeader** | `supplier_price_list_header` | `id: Long` | `createdAt: Long` (no `updatedAt`) | ❌ **NO** |
| **SupplierPriceListItem** | `supplier_price_list_item` | `id: Long` | **none** | ❌ **NO** |

---

## 2. DAO Analysis for Delta Sync Support

### 2.1 Entities WITH `updatedAt` but NO Delta Queries

#### CustomerDao
- **Has `updatedAt`:** ✅ YES
- **Delta queries:** ❌ NO
- **Existing queries:** `getById`, `listActive`, `search`, `delete`
- **Missing:** `getUpdatedSince(lastSync: Long): Flow<List<Customer>>`

#### ReservationDao
- **Has `updatedAt`:** ✅ YES
- **Delta queries:** ❌ NO
- **Existing queries:** `getAll`, `getOpen`, `getByCustomer`, `getBySupplier`, `getByAgent`, `getByBranch`
- **Missing:** `getUpdatedSince(lastSync: Long): Flow<List<Reservation>>`

#### CarSaleDao
- **Has `updatedAt`:** ✅ YES
- **Delta queries:** ❌ NO
- **Existing queries:** `getAll` (ordered by `saleDate DESC`)
- **Missing:** `getUpdatedSince(lastSync: Long): Flow<List<CarSale>>`

#### SupplierTemplateDao
- **Has `updatedAt`:** ✅ YES
- **Delta queries:** ❌ NO
- **Existing queries:** `getAllActive`, `getActiveTemplatesBySupplier`, `getAllTemplatesBySupplier` (ordered by `createdAt DESC`)
- **Missing:** `getUpdatedSince(lastSync: Long): Flow<List<SupplierTemplate>>`

### 2.2 Entities WITHOUT `updatedAt`

#### SupplierDao
- **Has `updatedAt`:** ❌ NO
- **Delta queries:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

#### BranchDao
- **Has `updatedAt`:** ❌ NO
- **Delta queries:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

#### PaymentDao
- **Has `updatedAt`:** ❌ NO (only has `date: Long` for payment date)
- **Delta queries:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

#### RequestDao
- **Has `updatedAt`:** ❌ NO (only has `createdAt`)
- **Delta queries:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

---

## 3. Migration History Analysis

### 3.1 Migrations That Added Time Fields

| Migration | Version | Tables Affected | Fields Added |
|-----------|---------|----------------|--------------|
| **MIGRATION_21_22** | 21→22 | `supplier_template` | `createdAt`, `updatedAt` |
| | | `supplier_monthly_header` | `importedAtUtc`, `createdAt` |
| | | `supplier_monthly_deal` | `importedAtUtc`, `createdAt` |
| **MIGRATION_26_27** | 26→27 | `supplier_monthly_header` | `headerHash` |
| | | `supplier_monthly_deal` | `rowHash` |
| **MIGRATION_29_30** | 29→30 | `supplier_price_list_header` | `createdAt` (no `updatedAt`) |

### 3.2 Migrations That Did NOT Add Time Fields

- **MIGRATION_18_19:** Added `phone` to `CarSale`
- **MIGRATION_19_20:** Added `isQuote` to `Request` and `Reservation`
- **MIGRATION_20_21:** No schema changes
- **MIGRATION_22_23:** Added `import_function_code` to `Supplier`
- **MIGRATION_23_24:** Added `import_template_id` to `Supplier`
- **MIGRATION_24_25:** Created import log tables
- **MIGRATION_25_26:** Added `file_hash` to `supplier_import_run`
- **MIGRATION_27_28:** No-op placeholder
- **MIGRATION_28_29:** Data fix for scientific notation
- **MIGRATION_30_31:** Added `price_list_import_function_code` to `Supplier`

**Key Finding:** No migrations added `updatedAt` to existing core entities. These fields existed from initial entity definitions.

---

## 4. Core Business Entities Detailed Assessment

### 4.1 Customer ✅
- **Has `updatedAt`:** ✅ YES (`updatedAt: Long`)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO (needs query: `getUpdatedSince(lastSync: Long)`)
- **Assessment:** Can support timestamp-based delta sync **after adding DAO query**

### 4.2 Supplier ❌
- **Has `updatedAt`:** ❌ NO
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

### 4.3 Branch ❌
- **Has `updatedAt`:** ❌ NO
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

### 4.4 Reservation ✅
- **Has `updatedAt`:** ✅ YES (`updatedAt: Long`)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO (needs query: `getUpdatedSince(lastSync: Long)`)
- **Assessment:** Can support timestamp-based delta sync **after adding DAO query**

### 4.5 Payment ❌
- **Has `updatedAt`:** ❌ NO (only has `date: Long` for payment date)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO
- **Assessment:** Requires schema change to add `updatedAt` field

### 4.6 CarSale ✅
- **Has `updatedAt`:** ✅ YES (`updatedAt: Long`)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO (needs query: `getUpdatedSince(lastSync: Long)`)
- **Assessment:** Can support timestamp-based delta sync **after adding DAO query**

### 4.7 SupplierPriceListHeader ⚠️
- **Has `updatedAt`:** ❌ NO (only has `createdAt`)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO
- **DAO delta support:** ❌ NO
- **Assessment:** Limited support; price lists are typically imported once, not frequently updated

### 4.8 SupplierMonthlyHeader / SupplierMonthlyDeal ⚠️
- **Has `updatedAt`:** ❌ NO (has `importedAtUtc` and `createdAt` only)
- **Has dirty flag:** ❌ NO
- **Has versioning:** ❌ NO (but has `headerHash`/`rowHash` for idempotency)
- **DAO delta support:** ❌ NO
- **Assessment:** Limited support; these are import records, not frequently updated

---

## 5. Summary Statistics

### 5.1 Entity Coverage

- **Total entities:** 19
- **Entities with `updatedAt`:** 4 (21%)
  - Customer
  - Reservation
  - CarSale
  - SupplierTemplate
- **Entities with `createdAt` only:** 4 (21%)
  - Request
  - SupplierPriceListHeader
  - SupplierMonthlyHeader
  - SupplierMonthlyDeal
- **Entities with no time fields:** 11 (58%)
  - Supplier, Branch, CarType, Agent, CommissionRule, CardStub, Payment, SupplierImportRunEntry, SupplierPriceListItem

### 5.2 DAO Query Coverage

- **Total DAOs:** 12
- **DAOs with delta queries:** 0 (0%)
- **DAOs that could support delta (have `updatedAt`):** 4
  - CustomerDao
  - ReservationDao
  - CarSaleDao
  - SupplierTemplateDao

---

## 6. Recommendations

### 6.1 For Immediate Delta Sync Support (Minimal Changes)

**Option A: Add DAO Queries Only**
- Add `getUpdatedSince(lastSync: Long): Flow<List<Entity>>` queries to:
  - `CustomerDao`
  - `ReservationDao`
  - `CarSaleDao`
  - `SupplierTemplateDao`
- **Limitation:** Only 4 entities can be delta-synced

### 6.2 For Comprehensive Delta Sync Support (Schema Changes Required)

**Option B: Add `updatedAt` to All Core Entities**
1. Create migration to add `updatedAt: Long` to:
   - `Supplier`
   - `Branch`
   - `Payment`
   - `Request`
   - `CardStub`
   - `Agent`
   - `CommissionRule`
   - `CarType`
   - `SupplierPriceListHeader`
   - `SupplierPriceListItem`
2. Add DAO queries: `getUpdatedSince(lastSync: Long): Flow<List<Entity>>` for all entities
3. Ensure `updatedAt` is maintained on all updates (via application logic or database triggers)

**Option C: Add Dirty Flags (More Granular Control)**
1. Add `isDirty: Boolean` field to all entities
2. Add `lastSyncTime: Long?` field to track last successful sync
3. Add DAO queries: `getDirty(): Flow<List<Entity>>` and `getUpdatedSince(lastSync: Long): Flow<List<Entity>>`
4. Mark entities as dirty on update, clear dirty flag after successful sync

---

## 7. Current Capabilities

### ✅ What IS Possible Now

1. **Full Sync:** All 19 entities can be synced in full to Firestore
2. **Partial Timestamp-Based Delta Sync:** Only for 4 entities (Customer, Reservation, CarSale, SupplierTemplate) **after adding DAO queries**

### ❌ What Is NOT Possible Now

1. **Timestamp-Based Delta Sync:** For 15 out of 19 entities (missing `updatedAt`)
2. **Dirty-Flag-Based Delta Sync:** For all entities (no dirty flags exist)
3. **Efficient Delta Sync:** No DAO queries support delta filtering

---

## 8. Conclusion

**Current Schema Status:** ❌ **NOT READY** for timestamp-based delta sync

**Primary Issues:**
1. **Missing `updatedAt` fields:** 15 out of 19 entities lack `updatedAt`
2. **Missing DAO queries:** Even entities with `updatedAt` have no delta queries
3. **No sync metadata:** No dirty flags, sync timestamps, or versioning

**To Enable Delta Sync:**
- **Minimal approach:** Add DAO queries for 4 entities that already have `updatedAt`
- **Comprehensive approach:** Add `updatedAt` to all core entities + add DAO queries + ensure `updatedAt` is maintained on updates

**Current Recommendation:** Implement **full sync** for now, or implement **partial delta sync** for the 4 entities that have `updatedAt` (after adding DAO queries).

---

## Appendix: Entity Field Details

### Customer
```kotlin
@Entity
data class Customer(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val firstName: String,
    val lastName: String,
    val phone: String,
    val tzId: String? = null,
    val address: String? = null,
    val email: String? = null,
    val isCompany: Boolean = false,
    val active: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()  // ✅ For delta sync
)
```

### Reservation
```kotlin
@Entity
data class Reservation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    // ... business fields ...
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()  // ✅ For delta sync
)
```

### Supplier
```kotlin
@Entity(indices = [Index(value = ["name"], unique = true)])
data class Supplier(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    // ... business fields ...
    // ❌ NO updatedAt field
)
```

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Database Version Analyzed:** 31

