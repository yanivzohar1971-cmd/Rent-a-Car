# 📊 Monthly Supplier Import Feature

## Quick Overview

This feature enables importing monthly Excel reports from multiple suppliers, each with their own unique format. The system stores historical data, validates accuracy, and maintains a complete audit trail.

---

## 🎯 What's New

### 3 New Database Tables

1. **supplier_template** - Store Excel column mappings
2. **supplier_monthly_header** - Store monthly summaries
3. **supplier_monthly_deal** - Store individual transactions

### Key Features

✅ **Multi-Supplier Support** - Each supplier can have different Excel layouts  
✅ **Template Management** - JSON-based column mapping  
✅ **Two-Tier Import** - Headers (summaries) + Deals (details)  
✅ **Validation** - Sum checking, security scanning  
✅ **Audit Trail** - Full history with timestamps and source files  
✅ **Rollback** - Undo imports if needed  

---

## 📁 Files Created

### Documentation
```
docs/
├── DATA_SCHEMA.md              # Complete ERD + SQL + DOD
├── MIGRATION_GUIDE.md          # Database migration 21→22
├── IMPORT_FEATURE_SUMMARY.md   # Feature overview
└── IMPLEMENTATION_CHECKLIST.md # Task list
```

### Code
```
app/src/main/java/com/rentacar/app/
├── data/
│   ├── ImportEntities.kt       # NEW: 3 entity classes
│   └── ImportDaos.kt           # NEW: 4 DAO interfaces
└── import/
    └── ExcelImportService.kt   # NEW: Import orchestration
```

---

## 🚀 Quick Start

### Step 1: Apply Database Migration

Update `app/src/main/java/com/rentacar/app/di/DatabaseModule.kt`:

```kotlin
// Add MIGRATION_21_22 (see docs/MIGRATION_GUIDE.md for full code)

private val MIGRATION_21_22 = object : Migration(21, 22) {
    override fun migrate(database: SupportSQLiteDatabase) {
        // Create supplier_template table
        database.execSQL("CREATE TABLE IF NOT EXISTS supplier_template ...")
        
        // Create supplier_monthly_header table
        database.execSQL("CREATE TABLE IF NOT EXISTS supplier_monthly_header ...")
        
        // Create supplier_monthly_deal table
        database.execSQL("CREATE TABLE IF NOT EXISTS supplier_monthly_deal ...")
    }
}

// Register migration
fun provideDatabase(context: Context): AppDatabase =
    Room.databaseBuilder(...)
        .addMigrations(
            MIGRATION_18_19,
            MIGRATION_19_20,
            MIGRATION_20_21,
            MIGRATION_21_22  // ← ADD THIS
        )
        .build()
```

### Step 2: Update AppDatabase

Update `app/src/main/java/com/rentacar/app/data/AppDatabase.kt`:

```kotlin
@Database(
    entities = [
        // ... existing entities ...
        SupplierTemplate::class,        // ← ADD
        SupplierMonthlyHeader::class,   // ← ADD
        SupplierMonthlyDeal::class      // ← ADD
    ],
    version = 22,  // ← INCREMENT
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    // ... existing DAOs ...
    
    // ← ADD THESE
    abstract fun supplierTemplateDao(): SupplierTemplateDao
    abstract fun supplierMonthlyHeaderDao(): SupplierMonthlyHeaderDao
    abstract fun supplierMonthlyDealDao(): SupplierMonthlyDealDao
    abstract fun importTransactionDao(): ImportTransactionDao
}
```

### Step 3: Add Excel Library

Update `app/build.gradle`:

```gradle
dependencies {
    // ... existing dependencies ...
    
    // Excel parsing
    implementation 'org.apache.poi:poi:5.2.3'
    implementation 'org.apache.poi:poi-ooxml:5.2.3'
}
```

---

## 📖 Usage Example

### Creating a Template

```kotlin
val template = SupplierTemplate(
    supplierId = 1,
    templateName = "August 2025 Format",
    columnMappingJson = """
    {
      "header": {
        "שם סוכן": "agent_name",
        "סוג חוזה": "contract_type",
        "סכום בשקלים": "total_amount_nis",
        "סכום עמלה": "total_commission_nis"
      },
      "deals": {
        "מס החוזה": "contract_number",
        "שם מס' לקוח": "customer_name",
        "סכום בשקלים": "total_amount",
        "סכום עמלה": "commission_amount"
      }
    }
    """,
    isActive = true
)

db.supplierTemplateDao().upsert(template)
```

### Importing a File

```kotlin
val importService = ExcelImportService(context, templateDao, headerDao, dealDao)

val config = ImportConfig(
    supplierId = 1,
    year = 2025,
    month = 8,
    validateSums = true,
    tolerance = 10.0  // ±10 NIS
)

val result = importService.importExcelFile(fileUri, config)

if (result.success) {
    println("✅ Imported ${result.headersImported} headers, ${result.dealsImported} deals")
} else {
    println("❌ Import failed: ${result.errors}")
}
```

### Querying Data

```kotlin
// Get all imports for August 2025
headerDao.getByPeriod(2025, 8).collect { headers ->
    headers.forEach { header ->
        println("${header.agentName}: ₪${header.totalAmountNis}")
    }
}

// Get deals for specific agent
dealDao.getByAgent("עידן זוהר").collect { deals ->
    val total = deals.sumOf { it.totalAmount }
    println("Total for עידן זוהר: ₪$total")
}
```

---

## 🔒 Security

### What's Protected

✅ **No PAN/CVV Storage** - System rejects any Excel containing credit card data  
✅ **Pattern Detection** - Scans for card numbers (13-19 digits)  
✅ **Column Validation** - Blocks suspicious column names  
✅ **Automatic Abort** - Import stops immediately if sensitive data detected  

### Example Security Check

```kotlin
private fun validateSecurity(data: ExcelData): List<String> {
    val errors = mutableListOf<String>()
    
    // Check for suspicious columns
    if (columnName.contains("card") || columnName.contains("CVV")) {
        errors.add("⚠️ SECURITY: Suspicious column '$columnName'")
    }
    
    // Check for card number patterns
    if (value.matches(Regex("\\b\\d{13,19}\\b"))) {
        errors.add("⚠️ SECURITY: Possible card number detected")
    }
    
    return errors
}
```

---

## ✅ Validation

### Sum Validation

System validates that deal totals match header summaries:

```
Header: עידן זוהר, monthly
├─ Total Amount: ₪72,104.06
└─ Total Commission: ₪5,047.28

Deals (sum):
├─ Total Amount: ₪72,104.06 ✓
└─ Total Commission: ₪5,047.28 ✓

Status: ✅ VALIDATED (within tolerance)
```

### Validation Rules

- **Amount Match**: `|sum(deals) - header| <= tolerance`
- **Commission Match**: `|sum(commissions) - header| <= tolerance`
- **Default Tolerance**: ±10 NIS
- **Result**: Warnings (not blocking)

---

## 📊 Data Flow

```
Excel File
    │
    ▼
Parse with Template
    │
    ├─► Header Section
    │   ├─ Agent Name
    │   ├─ Contract Type (daily/weekly/monthly)
    │   ├─ Total Amount
    │   └─ Total Commission
    │
    └─► Deals Section
        ├─ Contract Number
        ├─ Customer Name
        ├─ Amount
        ├─ Commission
        └─ Vehicle Info
    │
    ▼
Validate
    ├─ Security Check (no PAN/CVV)
    ├─ Sum Validation
    ├─ Data Types
    └─ Business Rules
    │
    ▼
Import to Database
    ├─ Insert Headers (get IDs)
    └─ Insert Deals (link to headers)
    │
    ▼
Audit Trail
    ├─ source_file_name
    ├─ imported_at_utc
    ├─ year/month
    └─ Record counts
```

---

## 🗄️ Database Schema

### Relationships

```
Supplier
    │
    ├──► SupplierTemplate (1:many)
    │    └─ Column mappings (JSON)
    │
    ├──► SupplierMonthlyHeader (1:many)
    │    ├─ Summary per agent/type
    │    └──► SupplierMonthlyDeal (1:many)
    │         └─ Individual transactions
```

### Key Fields

**SupplierTemplate**
- `column_mapping_json` - Maps Excel columns to internal fields

**SupplierMonthlyHeader**
- `agent_name`, `contract_type`
- `total_amount_nis`, `total_commission_nis`
- `year`, `month`
- Unique: (supplier, agent, type, year, month)

**SupplierMonthlyDeal**
- `contract_number`
- `customer_name`, `agent_name`
- `total_amount`, `commission_amount`
- `vehicle_type`, `branch_name`
- Links to header via `header_id`

---

## 📚 Documentation

### Complete Guides

1. **DATA_SCHEMA.md**
   - Full ERD with all tables
   - SQL CREATE statements
   - DOD checklists for workflows

2. **MIGRATION_GUIDE.md**
   - Step-by-step migration
   - Testing procedures
   - Rollback instructions

3. **IMPORT_FEATURE_SUMMARY.md**
   - Feature overview
   - Implementation details
   - Example usage

4. **IMPLEMENTATION_CHECKLIST.md**
   - Complete task list (16 phases)
   - Priority matrix
   - Risk mitigation

---

## 🧪 Testing

### Test Cases

```kotlin
// Test template creation
@Test
fun testTemplateCreation() {
    val template = SupplierTemplate(...)
    val id = dao.upsert(template)
    assert(id > 0)
}

// Test import flow
@Test
fun testImportFlow() {
    val result = importService.importExcelFile(uri, config)
    assert(result.success)
    assert(result.headersImported > 0)
    assert(result.dealsImported > 0)
}

// Test security validation
@Test
fun testSecurityValidation() {
    val data = ExcelData(/* contains PAN */)
    val errors = validateSecurity(data)
    assert(errors.isNotEmpty())
    assert(errors.any { it.contains("SECURITY") })
}

// Test sum validation
@Test
fun testSumValidation() {
    val warnings = validateSums(headers, deals, tolerance = 10.0)
    // Should pass if sums match within tolerance
}
```

---

## 🎯 Next Steps

### Immediate (This Week)
1. Apply database migration
2. Test migration thoroughly
3. Add Excel parsing library

### Short-term (Next 2 Weeks)
1. Implement repository layer
2. Complete Excel parsing
3. Build basic import UI

### Medium-term (Next Month)
1. Add validation screens
2. Create result display
3. Comprehensive testing

### Long-term (2+ Months)
1. UAT with real data
2. Performance optimization
3. Production deployment

---

## 🆘 Support

### Common Issues

**Q: Migration fails**  
A: Check logs, restore from backup, verify SQL syntax

**Q: Sum validation fails**  
A: Adjust tolerance, verify Excel formulas, check data

**Q: Excel parsing error**  
A: Verify file format, check template mapping, test with sample

**Q: Duplicate key error**  
A: Check for existing import, use rollback, verify unique constraints

---

## 📞 Contact

For questions or issues:
- Review documentation in `docs/` folder
- Check implementation checklist for current status
- Refer to DATA_SCHEMA.md for technical details

---

**Version**: 1.0  
**Database Schema**: 22  
**Status**: Foundation Complete, Ready for Implementation  
**Last Updated**: 2025-10-25


