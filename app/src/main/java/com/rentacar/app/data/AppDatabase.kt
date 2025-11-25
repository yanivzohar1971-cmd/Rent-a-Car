package com.rentacar.app.data

import androidx.room.Database
import androidx.room.RoomDatabase

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
        SupplierTemplate::class,
        SupplierMonthlyHeader::class,
        SupplierMonthlyDeal::class,
        SupplierImportRun::class,
        SupplierImportRunEntry::class,
        SupplierPriceListHeader::class,
        SupplierPriceListItem::class,
        com.rentacar.app.data.sync.SyncQueueEntity::class
    ],
    version = 32,
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
    abstract fun supplierTemplateDao(): SupplierTemplateDao
    abstract fun supplierMonthlyHeaderDao(): SupplierMonthlyHeaderDao
    abstract fun supplierMonthlyDealDao(): SupplierMonthlyDealDao
    abstract fun importLogDao(): ImportLogDao
    abstract fun supplierPriceListDao(): SupplierPriceListDao
    abstract fun syncQueueDao(): com.rentacar.app.data.sync.SyncQueueDao

    // ========================================================================
    // FUTURE MIGRATION TEMPLATE (NOT ACTIVE - FOR REFERENCE ONLY)
    // ========================================================================
    //
    // This is a template showing how to use MigrationSafetyManager for
    // high-risk migrations (Level 3) in future versions (33+).
    //
    // DO NOT uncomment or register this migration until:
    // 1. AppDatabase version is incremented to 33
    // 2. The migration is fully implemented and tested
    // 3. It is registered in DatabaseModule.provideDatabase()
    //
    // See docs/rentacar-room-paranoid-migrations.md for full design.
    //
    // Example template for a future high-risk migration (NOT ACTIVE YET):
    //
    // val MIGRATION_32_33 = object : Migration(32, 33) {
    //     override fun migrate(database: SupportSQLiteDatabase) {
    //         // TODO: Context needs to be provided via a future mechanism
    //         // For now, this is a placeholder showing the intended pattern
    //         // val context: Context = ??? // Will be provided in Phase 3
    //         // val safetyManager = MigrationSafetyManager(context, database)
    //
    //         // Example high-risk tables (adjust based on actual migration needs):
    //         // val criticalTables = listOf("Reservation", "Payment", "Customer")
    //
    //         // 1) Prepare backups (Layer A: file, Layer B: tables, Layer C: JSON)
    //         // safetyManager.prepareHighRiskMigration(criticalTables, dumpJson = true)
    //
    //         // 2) Verify backups were created (for Level 3, this is required)
    //         // if (!safetyManager.verifyBackups(criticalTables)) {
    //         //     throw IllegalStateException("Backup verification failed - aborting migration")
    //         // }
    //
    //         try {
    //             MigrationLogger.logMigrationStart(32, 33, level = 3, criticalTables)
    //
    //             // 3) Perform actual schema changes here
    //             // Example: ALTER TABLE Reservation ADD COLUMN newField TEXT
    //             // database.execSQL("ALTER TABLE Reservation ADD COLUMN newField TEXT")
    //
    //             // 4) On success, drop backup tables
    //             // safetyManager.dropBackups(criticalTables)
    //
    //             MigrationLogger.logMigrationComplete(success = true, duration = 0)
    //         } catch (e: Exception) {
    //             MigrationLogger.error("High-risk migration 32->33 failed, attempting restore", e)
    //
    //             // 5) Try to restore from backup tables
    //             // try {
    //             //     safetyManager.restoreFromBackups(criticalTables)
    //             //     MigrationLogger.logRollback(attempted = true, success = true, "Restored from backup tables")
    //             // } catch (restoreException: Exception) {
    //             //     MigrationLogger.logRollback(attempted = true, success = false, "Restore failed: ${restoreException.message}")
    //             //     // If restore fails, DB file backup (Layer A) is still available for manual recovery
    //             // }
    //
    //             // 6) Re-throw to abort migration; app will still have backups on disk
    //             throw e
    //         }
    //     }
    // }
}


