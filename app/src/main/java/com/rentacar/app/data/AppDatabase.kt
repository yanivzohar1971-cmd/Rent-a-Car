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
}


