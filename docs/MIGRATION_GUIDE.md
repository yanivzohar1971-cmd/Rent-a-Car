# Database Migration Guide - Monthly Import Tables

## Overview

This migration adds support for importing and storing monthly supplier Excel reports with the following capabilities:
- Store supplier-specific Excel templates (column mappings)
- Import monthly summary headers (per agent/contract type)
- Import detailed deal/transaction data
- Full audit trail with timestamps and source files

---

## Migration from Version 21 to 22

### New Tables

1. **supplier_template** - Excel column mapping templates
2. **supplier_monthly_header** - Monthly summary/header data
3. **supplier_monthly_deal** - Monthly detailed deals/transactions

### Migration Steps

#### Step 1: Create Migration File

Create `MIGRATION_21_22` in `DatabaseModule.kt`:

```kotlin
private val MIGRATION_21_22 = object : Migration(21, 22) {
    override fun migrate(database: SupportSQLiteDatabase) {
        android.util.Log.i("Migration", "Starting migration from 21 to 22 - Adding import tables")
        
        try {
            // Create supplier_template table
            database.execSQL("""
                CREATE TABLE IF NOT EXISTS supplier_template (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    template_name TEXT NOT NULL,
                    column_mapping_json TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE CASCADE
                )
            """)
            
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_template_supplier ON supplier_template(supplier_id)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_template_active ON supplier_template(is_active)")
            database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_template_name ON supplier_template(supplier_id, template_name)")
            
            // Create supplier_monthly_header table
            database.execSQL("""
                CREATE TABLE IF NOT EXISTS supplier_monthly_header (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    agent_name TEXT NOT NULL,
                    contract_type TEXT NOT NULL,
                    total_amount_nis REAL NOT NULL,
                    total_commission_nis REAL NOT NULL,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    source_file_name TEXT NOT NULL,
                    imported_at_utc INTEGER NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT,
                    CHECK (total_amount_nis >= 0),
                    CHECK (total_commission_nis >= 0),
                    CHECK (year >= 2020 AND year <= 2100),
                    CHECK (month >= 1 AND month <= 12)
                )
            """)
            
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_header_supplier ON supplier_monthly_header(supplier_id)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_header_period ON supplier_monthly_header(year, month)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_header_agent ON supplier_monthly_header(agent_name)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_header_import ON supplier_monthly_header(imported_at_utc)")
            database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_monthly_header_unique ON supplier_monthly_header(supplier_id, agent_name, contract_type, year, month)")
            
            // Create supplier_monthly_deal table
            database.execSQL("""
                CREATE TABLE IF NOT EXISTS supplier_monthly_deal (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    header_id INTEGER NOT NULL,
                    contract_number TEXT NOT NULL,
                    deal_type TEXT,
                    deal_type_name TEXT,
                    contract_status TEXT,
                    status_name TEXT,
                    contract_start_date INTEGER,
                    contract_end_date INTEGER,
                    customer_id TEXT,
                    customer_name TEXT,
                    agent_name TEXT NOT NULL,
                    vehicle_type TEXT,
                    license_plate TEXT,
                    total_amount REAL NOT NULL,
                    commission_percent REAL,
                    commission_amount REAL NOT NULL,
                    branch_name TEXT,
                    year INTEGER NOT NULL,
                    month INTEGER NOT NULL,
                    source_file_name TEXT NOT NULL,
                    imported_at_utc INTEGER NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                    FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE RESTRICT,
                    FOREIGN KEY (header_id) REFERENCES supplier_monthly_header(id) ON DELETE CASCADE,
                    CHECK (total_amount >= 0),
                    CHECK (commission_amount >= 0),
                    CHECK (commission_percent IS NULL OR (commission_percent >= 0 AND commission_percent <= 100)),
                    CHECK (year >= 2020 AND year <= 2100),
                    CHECK (month >= 1 AND month <= 12)
                )
            """)
            
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_supplier ON supplier_monthly_deal(supplier_id)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_header ON supplier_monthly_deal(header_id)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_period ON supplier_monthly_deal(year, month)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_contract ON supplier_monthly_deal(contract_number)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_customer ON supplier_monthly_deal(customer_name)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_agent ON supplier_monthly_deal(agent_name)")
            database.execSQL("CREATE INDEX IF NOT EXISTS idx_supplier_monthly_deal_import ON supplier_monthly_deal(imported_at_utc)")
            
            android.util.Log.i("Migration", "Migration 21->22 completed successfully")
            
        } catch (e: Exception) {
            android.util.Log.e("Migration", "Migration 21->22 failed", e)
            throw e
        }
    }
}
```

#### Step 2: Update AppDatabase

Update `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`:

```kotlin
@Database(
    entities = [
        Customer::class,
        Supplier::class,
        Branch::class,
        CarType::class,
        Reservation::class,
        Payment::class,
        CardStub::class,
        CommissionRule::class,
        Agent::class,
        Request::class,
        CarSale::class,
        SupplierTemplate::class,        // NEW
        SupplierMonthlyHeader::class,   // NEW
        SupplierMonthlyDeal::class      // NEW
    ],
    version = 22,  // INCREMENT
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun customerDao(): CustomerDao
    abstract fun supplierDao(): SupplierDao
    abstract fun branchDao(): BranchDao
    abstract fun carTypeDao(): CarTypeDao
    abstract fun agentDao(): AgentDao
    abstract fun reservationDao(): ReservationDao
    abstract fun paymentDao(): PaymentDao
    abstract fun commissionRuleDao(): CommissionRuleDao
    abstract fun cardStubDao(): CardStubDao
    abstract fun requestDao(): RequestDao
    abstract fun carSaleDao(): CarSaleDao
    
    // NEW DAOs
    abstract fun supplierTemplateDao(): SupplierTemplateDao
    abstract fun supplierMonthlyHeaderDao(): SupplierMonthlyHeaderDao
    abstract fun supplierMonthlyDealDao(): SupplierMonthlyDealDao
    abstract fun importTransactionDao(): ImportTransactionDao
}
```

#### Step 3: Register Migration in DatabaseModule

Update `provideDatabase()` in `DatabaseModule.kt`:

```kotlin
fun provideDatabase(context: Context): AppDatabase =
    instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(
            context.applicationContext,
            AppDatabase::class.java,
            "rentacar.db"
        )
        .addMigrations(
            MIGRATION_18_19,
            MIGRATION_19_20,
            MIGRATION_20_21,
            MIGRATION_21_22  // ADD THIS
        )
        .build()
        .also { db ->
            instance = db
            android.util.Log.i("DatabaseModule", "Database initialized with migration support")
            seedIfEmpty(db)
        }
    }
```

---

## Testing the Migration

### Test Plan

1. **Backup Current Database**
   ```kotlin
   // In your test or debug code
   val db = DatabaseModule.provideDatabase(context)
   // Trigger backup worker manually
   WorkManager.getInstance(context)
       .enqueue(OneTimeWorkRequestBuilder<BackupWorker>().build())
   ```

2. **Verify Migration Success**
   ```kotlin
   val db = DatabaseModule.provideDatabase(context)
   
   // Check tables exist
   db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", null).use { cursor ->
       while (cursor.moveToNext()) {
           Log.d("Migration", "Table: ${cursor.getString(0)}")
       }
   }
   
   // Should see:
   // - supplier_template
   // - supplier_monthly_header
   // - supplier_monthly_deal
   ```

3. **Test Template CRUD**
   ```kotlin
   val template = SupplierTemplate(
       supplierId = 1,
       templateName = "Test Template",
       columnMappingJson = """{"header":{}, "deals":{}}""",
       isActive = true
   )
   
   val templateId = db.supplierTemplateDao().upsert(template)
   assert(templateId > 0)
   ```

4. **Test Import Flow**
   ```kotlin
   val header = SupplierMonthlyHeader(
       supplierId = 1,
       agentName = "עידן זוהר",
       contractType = "monthly",
       totalAmountNis = 76415.0,
       totalCommissionNis = 5478.38,
       year = 2025,
       month = 8,
       sourceFileName = "חוברת1.xlsx",
       importedAtUtc = System.currentTimeMillis()
   )
   
   val headerId = db.supplierMonthlyHeaderDao().insert(header)
   assert(headerId > 0)
   ```

---

## Rollback Plan

If migration fails:

1. **Manual Rollback**
   ```kotlin
   database.execSQL("DROP TABLE IF EXISTS supplier_monthly_deal")
   database.execSQL("DROP TABLE IF EXISTS supplier_monthly_header")
   database.execSQL("DROP TABLE IF EXISTS supplier_template")
   ```

2. **Restore from Backup**
   - Use the JSON backup created before migration
   - Reimport data using the backup restore functionality

---

## Performance Considerations

### Indexes

All critical query paths are indexed:
- Supplier lookups (FK indexes)
- Period queries (year, month composite)
- Agent name searches
- Contract number lookups
- Import timestamp sorting

### Query Optimization

```kotlin
// Good: Use indexed columns
dao.getBySupplierAndPeriod(supplierId, 2025, 8)

// Avoid: Full table scans
// dao.getAll().filter { it.year == 2025 }
```

### Batch Operations

For large imports, use transactions:
```kotlin
@Transaction
suspend fun importBatch(headers: List<SupplierMonthlyHeader>, deals: List<SupplierMonthlyDeal>) {
    // All inserts in single transaction
}
```

---

## Data Validation

Before importing, validate:

1. **Foreign Keys**
   - Supplier exists
   - Template exists (optional)

2. **Business Rules**
   - Sum(deals.totalAmount) ≈ header.totalAmountNis
   - Sum(deals.commissionAmount) ≈ header.totalCommissionNis
   - No duplicate (supplier, agent, type, year, month)

3. **Security**
   - No PAN/CVV in any field
   - No sensitive data in JSON mappings

---

## Monitoring

Add logging for:
- Migration start/completion
- Record counts post-migration
- Any constraint violations
- Import success/failure rates

```kotlin
android.util.Log.i("Migration", "Import tables created successfully")
android.util.Log.i("Migration", "Indexes created: 15 total")
```

---

## END OF MIGRATION GUIDE

