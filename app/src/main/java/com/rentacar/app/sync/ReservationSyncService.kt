package com.rentacar.app.sync

import android.util.Log
import com.rentacar.app.data.*
import com.rentacar.app.data.auth.CurrentUserProvider
import kotlinx.coroutines.flow.firstOrNull

class ReservationSyncService(
    private val reservationDao: ReservationDao,
    private val supplierMonthlyDealDao: SupplierMonthlyDealDao,
    private val customerDao: CustomerDao,
    private val branchDao: BranchDao,
    private val carTypeDao: CarTypeDao
) {
    
    companion object {
        private const val TAG = "ReservationSyncService"
    }
    
    /**
     * Dispatcher: Routes to the correct sync strategy based on function code
     */
    suspend fun syncSupplierDealsToReservations(
        supplierId: Long,
        year: Int,
        month: Int,
        functionCode: Int
    ) {
        Log.i(TAG, "Dispatching sync with functionCode=$functionCode for supplier=$supplierId, year=$year, month=$month")
        
        when (functionCode) {
            1 -> syncSupplierDealsToReservations1(supplierId, year, month)
            2 -> syncSupplierDealsToReservations2(supplierId, year, month)
            else -> {
                Log.w(TAG, "Unknown functionCode=$functionCode, falling back to strategy 1")
                syncSupplierDealsToReservations1(supplierId, year, month)
            }
        }
    }
    
    /**
     * Strategy 1: Standard monthly import sync logic
     * This is the current implementation
     */
    private suspend fun syncSupplierDealsToReservations1(supplierId: Long, year: Int, month: Int) {
        Log.i(TAG, "Starting sync strategy 1 for supplier=$supplierId, year=$year, month=$month")
        
        try {
            // Get all deals for this supplier/period
            val deals = supplierMonthlyDealDao.getBySupplierAndPeriod(supplierId, year, month)
                .firstOrNull() ?: emptyList()
            
            Log.i(TAG, "Found ${deals.size} deals to sync")
            
            var created = 0
            var updated = 0
            var skipped = 0
            var errors = 0
            
            for (deal in deals) {
                try {
                    when (syncSingleDeal(deal)) {
                        SyncResult.CREATED -> created++
                        SyncResult.UPDATED -> updated++
                        SyncResult.SKIPPED -> skipped++
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error syncing deal ${deal.contractNumber}: ${e.message}", e)
                    errors++
                    // Continue with next deal
                }
            }
            
            Log.i(TAG, "Sync complete: created=$created, updated=$updated, skipped=$skipped, errors=$errors")
            
        } catch (e: Exception) {
            Log.e(TAG, "Fatal error during sync: ${e.message}", e)
            throw e
        }
    }
    
    /**
     * Strategy 2: Alternative sync logic for suppliers with different Excel format/business rules
     * TODO: Implement alternative mapping logic when needed
     */
    private suspend fun syncSupplierDealsToReservations2(supplierId: Long, year: Int, month: Int) {
        Log.i(TAG, "Starting sync strategy 2 for supplier=$supplierId, year=$year, month=$month")
        
        // TODO: Implement alternative logic here
        // For now, fallback to strategy 1
        Log.w(TAG, "Strategy 2 not yet implemented, falling back to strategy 1")
        syncSupplierDealsToReservations1(supplierId, year, month)
    }
    
    private enum class SyncResult {
        CREATED, UPDATED, SKIPPED
    }
    
    /**
     * Sync a single deal to a reservation
     */
    private suspend fun syncSingleDeal(deal: SupplierMonthlyDeal): SyncResult {
        // Try to find existing reservation
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val existing = reservationDao.findBySupplierAndExternalNumber(
            supplierId = deal.supplierId,
            externalNumber = deal.contractNumber,
            currentUid = currentUid
        )
        
        return if (existing == null) {
            createReservationFromDeal(deal)
            SyncResult.CREATED
        } else {
            updateReservationFromDeal(existing, deal)
            SyncResult.UPDATED
        }
    }
    
    /**
     * Create a new reservation from supplier deal
     */
    private suspend fun createReservationFromDeal(deal: SupplierMonthlyDeal) {
        // Find or create customer
        val customerId = findOrCreateCustomer(deal)
        
        // Find or use default branch
        val branchId = findOrCreateBranch(deal)
        
        // Find or use default car type
        val carTypeId = findOrCreateCarType(deal)
        
        val newReservation = Reservation(
            customerId = customerId,
            supplierId = deal.supplierId,
            branchId = branchId,
            carTypeId = carTypeId,
            carTypeName = deal.vehicleType,
            agentId = null,  // We don't have agent mapping from deal
            dateFrom = deal.contractStartDate ?: System.currentTimeMillis(),
            dateTo = deal.contractEndDate ?: (System.currentTimeMillis() + 86400000), // +1 day default
            actualReturnDate = null,
            includeVat = true,
            vatPercentAtCreation = null,
            airportMode = false,
            agreedPrice = deal.totalAmount,
            kmIncluded = 0,  // Unknown from deal
            requiredHoldAmount = 2000,  // Default
            periodTypeDays = calculatePeriodType(deal.contractStartDate, deal.contractEndDate),
            commissionPercentUsed = deal.commissionPercent,
            status = mapSupplierStatusToReservationStatus(deal),
            isClosed = isClosedStatus(mapSupplierStatusToReservationStatus(deal)),
            supplierOrderNumber = deal.contractNumber,  // Also store here for compatibility
            externalContractNumber = deal.contractNumber,  // Primary sync key
            notes = "אוטומטית מדוח ספק: ${deal.sourceFileName}",
            isQuote = false,
            createdAt = deal.importedAtUtc,
            updatedAt = System.currentTimeMillis()
        )
        
        val id = reservationDao.insertReservation(newReservation)
        Log.i(TAG, "Created reservation $id from deal ${deal.contractNumber}")
    }
    
    /**
     * Update existing reservation from supplier deal
     */
    private suspend fun updateReservationFromDeal(existing: Reservation, deal: SupplierMonthlyDeal) {
        val newStatus = mapSupplierStatusToReservationStatus(deal)
        
        // Don't downgrade status
        if (shouldSkipStatusUpdate(existing.status, newStatus)) {
            Log.d(TAG, "Skipping status downgrade for ${deal.contractNumber}: ${existing.status} -> $newStatus")
            return
        }
        
        // Update supplier-driven fields only
        val updated = existing.copy(
            dateFrom = deal.contractStartDate ?: existing.dateFrom,
            dateTo = deal.contractEndDate ?: existing.dateTo,
            agreedPrice = deal.totalAmount,
            carTypeName = deal.vehicleType ?: existing.carTypeName,
            status = newStatus,
            isClosed = isClosedStatus(newStatus),
            commissionPercentUsed = deal.commissionPercent ?: existing.commissionPercentUsed,
            updatedAt = System.currentTimeMillis()
        )
        
        reservationDao.updateReservation(updated)
        Log.i(TAG, "Updated reservation ${existing.id} from deal ${deal.contractNumber}")
    }
    
    /**
     * Map supplier status to our ReservationStatus
     */
    private fun mapSupplierStatusToReservationStatus(deal: SupplierMonthlyDeal): ReservationStatus {
        val status = deal.statusName?.trim() ?: deal.contractStatus?.trim() ?: ""
        
        return when {
            status.contains("שולם", ignoreCase = true) -> ReservationStatus.Paid
            status.contains("סגור", ignoreCase = true) -> ReservationStatus.Paid
            status.contains("Paid", ignoreCase = true) -> ReservationStatus.Paid
            status.contains("Closed", ignoreCase = true) -> ReservationStatus.Paid
            
            status.contains("בוטל", ignoreCase = true) -> ReservationStatus.Cancelled
            status.contains("Cancelled", ignoreCase = true) -> ReservationStatus.Cancelled
            status.contains("מבוטל", ignoreCase = true) -> ReservationStatus.Cancelled
            
            status.contains("פתוח", ignoreCase = true) -> ReservationStatus.Confirmed
            status.contains("Active", ignoreCase = true) -> ReservationStatus.Confirmed
            status.contains("מאושר", ignoreCase = true) -> ReservationStatus.Confirmed
            status.contains("אושר", ignoreCase = true) -> ReservationStatus.Confirmed
            
            else -> ReservationStatus.Confirmed  // Default fallback
        }
    }
    
    /**
     * Check if status is closed (Paid or Cancelled)
     */
    private fun isClosedStatus(status: ReservationStatus): Boolean {
        return status == ReservationStatus.Paid || status == ReservationStatus.Cancelled
    }
    
    /**
     * Determine if we should skip status update to prevent downgrades
     */
    private fun shouldSkipStatusUpdate(currentStatus: ReservationStatus, newStatus: ReservationStatus): Boolean {
        // Define status hierarchy
        val statusOrder = mapOf(
            ReservationStatus.Draft to 0,
            ReservationStatus.SentToSupplier to 1,
            ReservationStatus.SentToCustomer to 2,
            ReservationStatus.Confirmed to 3,
            ReservationStatus.Paid to 4,
            ReservationStatus.Cancelled to 4  // Same level as Paid, but different path
        )
        
        val currentOrder = statusOrder[currentStatus] ?: 0
        val newOrder = statusOrder[newStatus] ?: 0
        
        // Skip if new status is lower than current (downgrade)
        // Exception: Allow moving to Cancelled from any state
        return currentOrder > newOrder && newStatus != ReservationStatus.Cancelled
    }
    
    /**
     * Calculate period type from dates
     */
    private fun calculatePeriodType(startDate: Long?, endDate: Long?): Int {
        if (startDate == null || endDate == null) return 1
        
        val days = ((endDate - startDate) / (1000 * 60 * 60 * 24)).toInt()
        return when {
            days <= 6 -> 1    // Daily
            days <= 23 -> 7   // Weekly
            else -> 24        // Monthly
        }
    }
    
    /**
     * Find or create customer from deal
     */
    private suspend fun findOrCreateCustomer(deal: SupplierMonthlyDeal): Long {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val customerName = deal.customerName ?: "לקוח לא ידוע"
        
        // Try to find by name (basic matching)
        val customers = customerDao.listActive(currentUid).firstOrNull() ?: emptyList()
        val found = customers.find { 
            it.firstName.contains(customerName, ignoreCase = true) ||
            it.lastName.contains(customerName, ignoreCase = true) ||
            "${it.firstName} ${it.lastName}".contains(customerName, ignoreCase = true)
        }
        
        if (found != null) {
            return found.id
        }
        
        // Create new customer
        val nameParts = customerName.split(" ", limit = 2)
        val newCustomer = Customer(
            firstName = nameParts.firstOrNull() ?: customerName,
            lastName = nameParts.getOrNull(1) ?: "",
            phone = deal.customerId ?: "0000000000",  // Use customer ID as placeholder
            tzId = deal.customerId,
            address = null,
            email = null,
            isCompany = false,
            active = true,
            createdAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis()
        )
        
        return customerDao.upsert(newCustomer)
    }
    
    /**
     * Find or create branch from deal
     */
    private suspend fun findOrCreateBranch(deal: SupplierMonthlyDeal): Long {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val branchName = deal.branchName
        
        if (branchName != null) {
            // Try to find by supplier and name
            val branch = branchDao.findBySupplierAndName(deal.supplierId, branchName)
            if (branch != null) {
                return branch.id
            }
            
            // Create new branch
            val newBranch = Branch(
                name = branchName,
                address = null,
                city = null,
                street = null,
                phone = null,
                supplierId = deal.supplierId
            )
            return branchDao.upsert(newBranch, currentUid)
        }
        
        // Get first branch for this supplier
        val branches = branchDao.getBySupplier(deal.supplierId, currentUid).firstOrNull() ?: emptyList()
        if (branches.isNotEmpty()) {
            return branches.first().id
        }
        
            // Create default branch
        val defaultBranch = Branch(
            name = "סניף ראשי",
            address = null,
            city = null,
            street = null,
            phone = null,
            supplierId = deal.supplierId
        )
        return branchDao.upsert(defaultBranch, currentUid)
    }
    
    /**
     * Find or create car type from deal
     */
    private suspend fun findOrCreateCarType(deal: SupplierMonthlyDeal): Long {
        val currentUid = CurrentUserProvider.requireCurrentUid()
        val vehicleType = deal.vehicleType
        
        if (vehicleType != null) {
            // Try to find by name
            val carTypes = carTypeDao.getAll(currentUid).firstOrNull() ?: emptyList()
            val found = carTypes.find { it.name.equals(vehicleType, ignoreCase = true) }
            if (found != null) {
                return found.id
            }
            
            // Create new car type
            val newCarType = CarType(
                name = vehicleType
            )
            return carTypeDao.upsert(newCarType)
        }
        
        // Get first available car type
        val carTypes = carTypeDao.getAll(currentUid).firstOrNull() ?: emptyList()
        if (carTypes.isNotEmpty()) {
            return carTypes.first().id
        }
        
        // Create default car type
        val defaultCarType = CarType(
            name = "לא צוין"
        )
        return carTypeDao.upsert(defaultCarType)
    }
}

