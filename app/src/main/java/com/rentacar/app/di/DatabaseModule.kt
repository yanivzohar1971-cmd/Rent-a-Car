package com.rentacar.app.di

import android.content.Context
import androidx.room.Room
import com.rentacar.app.data.AppDatabase
import com.rentacar.app.data.CatalogRepository
import com.rentacar.app.data.ReservationRepository
import com.rentacar.app.data.Supplier
import com.rentacar.app.data.Branch
import com.rentacar.app.data.CarType
import com.rentacar.app.data.Agent
import com.rentacar.app.data.CustomerRepository
import com.rentacar.app.data.RequestRepository
import com.rentacar.app.data.CarSaleRepository
import com.rentacar.app.data.SupplierRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DatabaseModule {
    @Volatile
    private var instance: AppDatabase? = null

    // Safe migration from version 19 to 20 - adds isQuote field to Request and Reservation
    private val MIGRATION_19_20 = object : Migration(19, 20) {
        override fun migrate(database: SupportSQLiteDatabase) {
            // Create comprehensive backup before migration
            try {
                // Backup ALL tables before migration
                database.execSQL("CREATE TABLE CarSale_backup AS SELECT * FROM CarSale")
                database.execSQL("CREATE TABLE Request_backup AS SELECT * FROM Request")
                database.execSQL("CREATE TABLE Customer_backup AS SELECT * FROM Customer")
                database.execSQL("CREATE TABLE Reservation_backup AS SELECT * FROM Reservation")
                database.execSQL("CREATE TABLE Supplier_backup AS SELECT * FROM Supplier")
                database.execSQL("CREATE TABLE Branch_backup AS SELECT * FROM Branch")
                database.execSQL("CREATE TABLE CarType_backup AS SELECT * FROM CarType")
                database.execSQL("CREATE TABLE Payment_backup AS SELECT * FROM Payment")
                database.execSQL("CREATE TABLE Agent_backup AS SELECT * FROM Agent")
                database.execSQL("CREATE TABLE CommissionRule_backup AS SELECT * FROM CommissionRule")
                database.execSQL("CREATE TABLE CardStub_backup AS SELECT * FROM CardStub")
                
                // Log backup creation
                android.util.Log.i("Migration", "Emergency backup created before migration 19->20")
                
                // Create emergency JSON backup file in Downloads/MyApp/Backups/
                try {
                    val timestamp = SimpleDateFormat("dd-MM-yyyy_HH-mm-ss", Locale.getDefault()).format(Date())
                    val backupDir = File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS), "MyApp/Backups")
                    if (!backupDir.exists()) backupDir.mkdirs()
                    
                    val backupFile = File(backupDir, "emergency_migration_backup_$timestamp.json")
                    backupFile.writeText("Emergency backup created before migration to version 20 - ${Date()}")
                    
                    android.util.Log.i("Migration", "Emergency JSON backup created: ${backupFile.absolutePath}")
                } catch (backupException: Exception) {
                    android.util.Log.w("Migration", "Failed to create emergency JSON backup", backupException)
                }
                
                // Add isQuote column to Request table with default false
                database.execSQL("ALTER TABLE Request ADD COLUMN isQuote INTEGER NOT NULL DEFAULT 0")
                
                // Add isQuote column to Reservation table with default false
                database.execSQL("ALTER TABLE Reservation ADD COLUMN isQuote INTEGER NOT NULL DEFAULT 0")
                
                // Migration successful - drop backup tables
                database.execSQL("DROP TABLE CarSale_backup")
                database.execSQL("DROP TABLE Request_backup")
                database.execSQL("DROP TABLE Customer_backup")
                database.execSQL("DROP TABLE Reservation_backup")
                database.execSQL("DROP TABLE Supplier_backup")
                database.execSQL("DROP TABLE Branch_backup")
                database.execSQL("DROP TABLE CarType_backup")
                database.execSQL("DROP TABLE Payment_backup")
                database.execSQL("DROP TABLE Agent_backup")
                database.execSQL("DROP TABLE CommissionRule_backup")
                database.execSQL("DROP TABLE CardStub_backup")
                
                android.util.Log.i("Migration", "Migration 19->20 completed successfully")
            } catch (e: Exception) {
                // If migration fails, restore from backup
                android.util.Log.e("Migration", "Migration 19->20 failed, attempting rollback", e)
                try {
                    // Restore ALL tables from backup
                    database.execSQL("DROP TABLE IF EXISTS CarSale")
                    database.execSQL("ALTER TABLE CarSale_backup RENAME TO CarSale")
                    
                    database.execSQL("DROP TABLE IF EXISTS Request")
                    database.execSQL("ALTER TABLE Request_backup RENAME TO Request")
                    
                    database.execSQL("DROP TABLE IF EXISTS Customer")
                    database.execSQL("ALTER TABLE Customer_backup RENAME TO Customer")
                    
                    database.execSQL("DROP TABLE IF EXISTS Reservation")
                    database.execSQL("ALTER TABLE Reservation_backup RENAME TO Reservation")
                    
                    database.execSQL("DROP TABLE IF EXISTS Supplier")
                    database.execSQL("ALTER TABLE Supplier_backup RENAME TO Supplier")
                    
                    database.execSQL("DROP TABLE IF EXISTS Branch")
                    database.execSQL("ALTER TABLE Branch_backup RENAME TO Branch")
                    
                    database.execSQL("DROP TABLE IF EXISTS CarType")
                    database.execSQL("ALTER TABLE CarType_backup RENAME TO CarType")
                    
                    database.execSQL("DROP TABLE IF EXISTS Payment")
                    database.execSQL("ALTER TABLE Payment_backup RENAME TO Payment")
                    
                    database.execSQL("DROP TABLE IF EXISTS Agent")
                    database.execSQL("ALTER TABLE Agent_backup RENAME TO Agent")
                    
                    database.execSQL("DROP TABLE IF EXISTS CommissionRule")
                    database.execSQL("ALTER TABLE CommissionRule_backup RENAME TO CommissionRule")
                    
                    database.execSQL("DROP TABLE IF EXISTS CardStub")
                    database.execSQL("ALTER TABLE CardStub_backup RENAME TO CardStub")
                    
                    android.util.Log.i("Migration", "Rollback 19->20 completed successfully")
                } catch (restoreException: Exception) {
                    android.util.Log.e("Migration", "Rollback 19->20 failed", restoreException)
                    // If restore also fails, throw original exception
                    throw e
                }
                throw e
            }
        }
    }

    // Safe migration from version 18 to 19 - adds phone field to CarSale
    private val MIGRATION_18_19 = object : Migration(18, 19) {
        override fun migrate(database: SupportSQLiteDatabase) {
            // Create comprehensive backup before migration
            try {
                // Backup ALL tables before migration (comprehensive backup)
                database.execSQL("CREATE TABLE CarSale_backup AS SELECT * FROM CarSale")
                database.execSQL("CREATE TABLE Request_backup AS SELECT * FROM Request")
                database.execSQL("CREATE TABLE Customer_backup AS SELECT * FROM Customer")
                database.execSQL("CREATE TABLE Reservation_backup AS SELECT * FROM Reservation")
                database.execSQL("CREATE TABLE Supplier_backup AS SELECT * FROM Supplier")
                database.execSQL("CREATE TABLE Branch_backup AS SELECT * FROM Branch")
                database.execSQL("CREATE TABLE CarType_backup AS SELECT * FROM CarType")
                database.execSQL("CREATE TABLE Payment_backup AS SELECT * FROM Payment")
                database.execSQL("CREATE TABLE Agent_backup AS SELECT * FROM Agent")
                database.execSQL("CREATE TABLE CommissionRule_backup AS SELECT * FROM CommissionRule")
                database.execSQL("CREATE TABLE CardStub_backup AS SELECT * FROM CardStub")
                
                // Log backup creation
                android.util.Log.i("Migration", "Emergency backup created before migration")
                
                // Create emergency JSON backup file in Downloads/MyApp/Backups/
                try {
                    val timestamp = SimpleDateFormat("dd-MM-yyyy_HH-mm-ss", Locale.getDefault()).format(Date())
                    val backupDir = File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS), "MyApp/Backups")
                    if (!backupDir.exists()) backupDir.mkdirs()
                    
                    val backupFile = File(backupDir, "emergency_migration_backup_$timestamp.json")
                    backupFile.writeText("Emergency backup created before migration to version 19 - ${Date()}")
                    
                    android.util.Log.i("Migration", "Emergency JSON backup created: ${backupFile.absolutePath}")
                } catch (backupException: Exception) {
                    android.util.Log.w("Migration", "Failed to create emergency JSON backup", backupException)
                }
                
                // Add phone column to CarSale table with default empty string
                database.execSQL("ALTER TABLE CarSale ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
                
                // Migration successful - drop backup tables
                database.execSQL("DROP TABLE CarSale_backup")
                database.execSQL("DROP TABLE Request_backup")
                database.execSQL("DROP TABLE Customer_backup")
                database.execSQL("DROP TABLE Reservation_backup")
                database.execSQL("DROP TABLE Supplier_backup")
                database.execSQL("DROP TABLE Branch_backup")
                database.execSQL("DROP TABLE CarType_backup")
                database.execSQL("DROP TABLE Payment_backup")
                database.execSQL("DROP TABLE Agent_backup")
                database.execSQL("DROP TABLE CommissionRule_backup")
                database.execSQL("DROP TABLE CardStub_backup")
                
                android.util.Log.i("Migration", "Migration completed successfully")
            } catch (e: Exception) {
                // If migration fails, restore from backup
                android.util.Log.e("Migration", "Migration failed, attempting rollback", e)
                try {
                    // Restore CarSale
                    database.execSQL("DROP TABLE IF EXISTS CarSale")
                    database.execSQL("ALTER TABLE CarSale_backup RENAME TO CarSale")
                    
                    // Restore ALL tables from backup
                    database.execSQL("DROP TABLE IF EXISTS Request")
                    database.execSQL("ALTER TABLE Request_backup RENAME TO Request")
                    
                    database.execSQL("DROP TABLE IF EXISTS Customer")
                    database.execSQL("ALTER TABLE Customer_backup RENAME TO Customer")
                    
                    database.execSQL("DROP TABLE IF EXISTS Reservation")
                    database.execSQL("ALTER TABLE Reservation_backup RENAME TO Reservation")
                    
                    database.execSQL("DROP TABLE IF EXISTS Supplier")
                    database.execSQL("ALTER TABLE Supplier_backup RENAME TO Supplier")
                    
                    database.execSQL("DROP TABLE IF EXISTS Branch")
                    database.execSQL("ALTER TABLE Branch_backup RENAME TO Branch")
                    
                    database.execSQL("DROP TABLE IF EXISTS CarType")
                    database.execSQL("ALTER TABLE CarType_backup RENAME TO CarType")
                    
                    database.execSQL("DROP TABLE IF EXISTS Payment")
                    database.execSQL("ALTER TABLE Payment_backup RENAME TO Payment")
                    
                    database.execSQL("DROP TABLE IF EXISTS Agent")
                    database.execSQL("ALTER TABLE Agent_backup RENAME TO Agent")
                    
                    database.execSQL("DROP TABLE IF EXISTS CommissionRule")
                    database.execSQL("ALTER TABLE CommissionRule_backup RENAME TO CommissionRule")
                    
                    database.execSQL("DROP TABLE IF EXISTS CardStub")
                    database.execSQL("ALTER TABLE CardStub_backup RENAME TO CardStub")
                    
                    android.util.Log.i("Migration", "Rollback completed successfully")
                } catch (restoreException: Exception) {
                    android.util.Log.e("Migration", "Rollback failed", restoreException)
                    // If restore also fails, throw original exception
                    throw e
                }
                throw e
            }
        }
    }

    // Migration from 20 to 21: Remove unique constraint on Branch (name, supplierId)
    private val MIGRATION_20_21 = object : Migration(20, 21) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 20 to 21")
            try {
                // Drop the old unique index on (name, supplierId)
                database.execSQL("DROP INDEX IF EXISTS index_Branch_name_supplierId")
                
                // Create a new non-unique index on supplierId only
                database.execSQL("CREATE INDEX IF NOT EXISTS index_Branch_supplierId ON Branch(supplierId)")
                
                android.util.Log.i("Migration", "Migration 20->21 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 20->21 failed", e)
                throw e
            }
        }
    }

    // Migration from 21 to 22: Add import tables and activeTemplateId to Supplier
    private val MIGRATION_21_22 = object : Migration(21, 22) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 21 to 22 - Adding import tables")
            try {
                // Add activeTemplateId to Supplier table
                database.execSQL("ALTER TABLE Supplier ADD COLUMN activeTemplateId INTEGER")
                
                // Add externalContractNumber to Reservation table for supplier reconciliation
                database.execSQL("ALTER TABLE Reservation ADD COLUMN externalContractNumber TEXT")
                
                // Create supplier_template table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS SupplierTemplate (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        supplierId INTEGER NOT NULL,
                        templateName TEXT NOT NULL,
                        columnMappingJson TEXT NOT NULL,
                        isActive INTEGER NOT NULL DEFAULT 1,
                        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                        updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                        FOREIGN KEY (supplierId) REFERENCES Supplier(id) ON DELETE CASCADE
                    )
                """)
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierTemplate_supplierId ON SupplierTemplate(supplierId)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierTemplate_isActive ON SupplierTemplate(isActive)")
                database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_SupplierTemplate_supplierId_templateName ON SupplierTemplate(supplierId, templateName)")
                
                // Create supplier_monthly_header table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS SupplierMonthlyHeader (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        supplierId INTEGER NOT NULL,
                        agentName TEXT NOT NULL,
                        contractType TEXT NOT NULL,
                        totalAmountNis REAL NOT NULL,
                        totalCommissionNis REAL NOT NULL,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL,
                        sourceFileName TEXT NOT NULL,
                        importedAtUtc INTEGER NOT NULL,
                        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                        FOREIGN KEY (supplierId) REFERENCES Supplier(id) ON DELETE RESTRICT,
                        CHECK (totalAmountNis >= 0),
                        CHECK (totalCommissionNis >= 0),
                        CHECK (year >= 2020 AND year <= 2100),
                        CHECK (month >= 1 AND month <= 12)
                    )
                """)
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyHeader_supplierId ON SupplierMonthlyHeader(supplierId)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyHeader_year_month ON SupplierMonthlyHeader(year, month)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyHeader_agentName ON SupplierMonthlyHeader(agentName)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyHeader_importedAtUtc ON SupplierMonthlyHeader(importedAtUtc)")
                database.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_SupplierMonthlyHeader_unique ON SupplierMonthlyHeader(supplierId, agentName, contractType, year, month)")
                
                // Create supplier_monthly_deal table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS SupplierMonthlyDeal (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        supplierId INTEGER NOT NULL,
                        headerId INTEGER NOT NULL,
                        contractNumber TEXT NOT NULL,
                        dealType TEXT,
                        dealTypeName TEXT,
                        contractStatus TEXT,
                        statusName TEXT,
                        contractStartDate INTEGER,
                        contractEndDate INTEGER,
                        customerId TEXT,
                        customerName TEXT,
                        agentName TEXT NOT NULL,
                        vehicleType TEXT,
                        licensePlate TEXT,
                        totalAmount REAL NOT NULL,
                        commissionPercent REAL,
                        commissionAmount REAL NOT NULL,
                        branchName TEXT,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL,
                        sourceFileName TEXT NOT NULL,
                        importedAtUtc INTEGER NOT NULL,
                        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                        FOREIGN KEY (supplierId) REFERENCES Supplier(id) ON DELETE RESTRICT,
                        FOREIGN KEY (headerId) REFERENCES SupplierMonthlyHeader(id) ON DELETE CASCADE,
                        CHECK (totalAmount >= 0),
                        CHECK (commissionAmount >= 0),
                        CHECK (commissionPercent IS NULL OR (commissionPercent >= 0 AND commissionPercent <= 100)),
                        CHECK (year >= 2020 AND year <= 2100),
                        CHECK (month >= 1 AND month <= 12)
                    )
                """)
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_supplierId ON SupplierMonthlyDeal(supplierId)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_headerId ON SupplierMonthlyDeal(headerId)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_year_month ON SupplierMonthlyDeal(year, month)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_contractNumber ON SupplierMonthlyDeal(contractNumber)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_customerName ON SupplierMonthlyDeal(customerName)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_agentName ON SupplierMonthlyDeal(agentName)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_SupplierMonthlyDeal_importedAtUtc ON SupplierMonthlyDeal(importedAtUtc)")
                
                android.util.Log.i("Migration", "Migration 21->22 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 21->22 failed", e)
                throw e
            }
        }
    }

    // Migration from 22 to 23: Add import_function_code to Supplier
    private val MIGRATION_22_23 = object : Migration(22, 23) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 22 to 23 - Adding import_function_code")
            try {
                // Add import_function_code column to Supplier table
                database.execSQL("ALTER TABLE Supplier ADD COLUMN import_function_code INTEGER")
                
                android.util.Log.i("Migration", "Migration 22->23 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 22->23 failed", e)
                throw e
            }
        }
    }

    // Migration from 23 to 24: Add import_template_id to Supplier
    private val MIGRATION_23_24 = object : Migration(23, 24) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 23 to 24 - Adding import_template_id")
            try {
                // Add import_template_id column to Supplier table
                database.execSQL("ALTER TABLE Supplier ADD COLUMN import_template_id INTEGER")
                
                android.util.Log.i("Migration", "Migration 23->24 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 23->24 failed", e)
                throw e
            }
        }
    }

    // Migration from 24 to 25: Add import log tables
    private val MIGRATION_24_25 = object : Migration(24, 25) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 24 to 25 - Adding import log tables")
            try {
                // Create supplier_import_run table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS supplier_import_run (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        supplier_id INTEGER NOT NULL,
                        import_time INTEGER NOT NULL,
                        file_name TEXT NOT NULL,
                        function_code INTEGER NOT NULL,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL,
                        rows_processed INTEGER NOT NULL,
                        rows_created INTEGER NOT NULL,
                        rows_updated INTEGER NOT NULL,
                        rows_closed INTEGER NOT NULL,
                        rows_cancelled INTEGER NOT NULL,
                        rows_skipped INTEGER NOT NULL,
                        success INTEGER NOT NULL,
                        error_message TEXT,
                        FOREIGN KEY(supplier_id) REFERENCES Supplier(id) ON DELETE CASCADE
                    )
                """)
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_supplier_import_run_supplier_id ON supplier_import_run(supplier_id)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_supplier_import_run_import_time ON supplier_import_run(import_time)")
                
                // Create supplier_import_run_entry table
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS supplier_import_run_entry (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        run_id INTEGER NOT NULL,
                        row_number_in_file INTEGER NOT NULL,
                        external_contract_number TEXT,
                        action_taken TEXT NOT NULL,
                        reservation_id INTEGER,
                        amount REAL,
                        notes TEXT,
                        FOREIGN KEY(run_id) REFERENCES supplier_import_run(id) ON DELETE CASCADE
                    )
                """)
                
                database.execSQL("CREATE INDEX IF NOT EXISTS index_supplier_import_run_entry_run_id ON supplier_import_run_entry(run_id)")
                database.execSQL("CREATE INDEX IF NOT EXISTS index_supplier_import_run_entry_row_number_in_file ON supplier_import_run_entry(row_number_in_file)")
                
                android.util.Log.i("Migration", "Migration 24->25 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 24->25 failed", e)
                throw e
            }
        }
    }

    // Migration from 25 to 26: Add file_hash to supplier_import_run
    private val MIGRATION_25_26 = object : Migration(25, 26) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 25 to 26 - Adding file_hash")
            try {
                // Add file_hash column to supplier_import_run table
                database.execSQL("ALTER TABLE supplier_import_run ADD COLUMN file_hash TEXT")
                
                android.util.Log.i("Migration", "Migration 25->26 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 25->26 failed", e)
                throw e
            }
        }
    }

    // Migration from 26 to 27: Add row_hash and header_hash for idempotent imports
    private val MIGRATION_26_27 = object : Migration(26, 27) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 26 to 27 - Adding hash columns")
            try {
                // Add header_hash to supplier_monthly_header
                database.execSQL("ALTER TABLE supplier_monthly_header ADD COLUMN header_hash TEXT")
                
                // Add row_hash to supplier_monthly_deal
                database.execSQL("ALTER TABLE supplier_monthly_deal ADD COLUMN row_hash TEXT")
                
                android.util.Log.i("Migration", "Migration 26->27 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 26->27 failed", e)
                throw e
            }
        }
    }

    // Migration from 27 to 28: Placeholder (was replaced by 28->29)
    private val MIGRATION_27_28 = object : Migration(27, 28) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Migration 27->28 (no-op, replaced by 28->29)")
            // No operation - this version was skipped
        }
    }
    
    // Migration from 28 to 29: Fix scientific notation in contract numbers (stronger approach)
    private val MIGRATION_28_29 = object : Migration(28, 29) {
        override fun migrate(database: SupportSQLiteDatabase) {
            android.util.Log.i("Migration", "Starting migration from 28 to 29 - Fixing scientific notation")
            try {
                // Fix Reservation.externalContractNumber
                database.execSQL("""
                    UPDATE Reservation
                    SET externalContractNumber = 
                        REPLACE(
                            REPLACE(
                                TRIM(
                                    printf('%.0f', CAST(externalContractNumber AS REAL))
                                ),
                                '.0', ''
                            ),
                            'E', ''
                        )
                    WHERE externalContractNumber LIKE '%E%' 
                    OR externalContractNumber LIKE '%e%'
                """)
                
                // Fix Reservation.supplierOrderNumber
                database.execSQL("""
                    UPDATE Reservation
                    SET supplierOrderNumber = 
                        REPLACE(
                            REPLACE(
                                TRIM(
                                    printf('%.0f', CAST(supplierOrderNumber AS REAL))
                                ),
                                '.0', ''
                            ),
                            'E', ''
                        )
                    WHERE supplierOrderNumber LIKE '%E%' 
                    OR supplierOrderNumber LIKE '%e%'
                """)
                
                // Fix supplier_monthly_deal.contract_number
                database.execSQL("""
                    UPDATE supplier_monthly_deal
                    SET contract_number = 
                        REPLACE(
                            REPLACE(
                                TRIM(
                                    printf('%.0f', CAST(contract_number AS REAL))
                                ),
                                '.0', ''
                            ),
                            'E', ''
                        )
                    WHERE contract_number LIKE '%E%' 
                    OR contract_number LIKE '%e%'
                """)
                
                android.util.Log.i("Migration", "Migration 28->29 completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("Migration", "Migration 28->29 failed", e)
                throw e
            }
        }
    }

    fun provideDatabase(context: Context): AppDatabase =
        instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "rentacar.db"
            ).addMigrations(MIGRATION_18_19, MIGRATION_19_20, MIGRATION_20_21, MIGRATION_21_22, MIGRATION_22_23, MIGRATION_23_24, MIGRATION_24_25, MIGRATION_25_26, MIGRATION_26_27, MIGRATION_27_28, MIGRATION_28_29).build().also { db ->
                instance = db
                // Log migration for debugging
                android.util.Log.i("DatabaseModule", "Database initialized with migration support")
                seedIfEmpty(db)
            }
        }

    fun reservationRepository(context: Context): ReservationRepository {
        val db = provideDatabase(context)
        return ReservationRepository(db.reservationDao(), db.paymentDao())
    }

    fun catalogRepository(context: Context): CatalogRepository {
        val db = provideDatabase(context)
        return CatalogRepository(db.supplierDao(), db.branchDao(), db.carTypeDao(), db.agentDao())
    }

    fun customerRepository(context: Context): CustomerRepository {
        val db = provideDatabase(context)
        return CustomerRepository(db.customerDao())
    }

    fun supplierRepository(context: Context): SupplierRepository {
        val db = provideDatabase(context)
        return SupplierRepository(db.supplierDao())
    }

    fun requestRepository(context: Context): RequestRepository {
        val db = provideDatabase(context)
        return RequestRepository(db.requestDao())
    }

    fun carSaleRepository(context: Context): CarSaleRepository {
        val db = provideDatabase(context)
        return CarSaleRepository(db.carSaleDao())
    }

    private fun seedIfEmpty(db: AppDatabase) {
        CoroutineScope(Dispatchers.IO).launch {
            // Seed minimal catalog data if empty
            var needSeed = true
            db.supplierDao().getAll().collect { suppliers ->
                if (suppliers.isNotEmpty()) needSeed = false
            }
            if (!needSeed) return@launch

            val supplierId = db.supplierDao().upsert(Supplier(name = "ספק ברירת מחדל", phone = null, defaultHold = 2000))
            // No default branches
            db.carTypeDao().upsert(CarType(name = "סדאן"))
            db.carTypeDao().upsert(CarType(name = "קאמפקט"))
            
        }
    }
}


