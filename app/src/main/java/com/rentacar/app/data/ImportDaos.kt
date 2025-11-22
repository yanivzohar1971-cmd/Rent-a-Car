package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/**
 * DAO for SupplierTemplate
 * Manages Excel column mapping templates for suppliers
 */
@Dao
interface SupplierTemplateDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(template: SupplierTemplate): Long
    
    @Update
    suspend fun update(template: SupplierTemplate): Int
    
    @Query("SELECT * FROM supplier_template WHERE id = :id")
    fun getById(id: Long): Flow<SupplierTemplate?>
    
    @Query("SELECT * FROM supplier_template WHERE id = :id LIMIT 1")
    suspend fun getByIdDirect(id: Long): SupplierTemplate?
    
    @Query("SELECT * FROM supplier_template WHERE is_active = 1 ORDER BY created_at DESC")
    fun getAllActive(): Flow<List<SupplierTemplate>>
    
    @Query("SELECT * FROM supplier_template WHERE supplier_id = :supplierId AND is_active = 1 ORDER BY created_at DESC")
    fun getActiveTemplatesBySupplier(supplierId: Long): Flow<List<SupplierTemplate>>
    
    @Query("SELECT * FROM supplier_template WHERE supplier_id = :supplierId ORDER BY created_at DESC")
    fun getAllTemplatesBySupplier(supplierId: Long): Flow<List<SupplierTemplate>>
    
    @Query("SELECT * FROM supplier_template WHERE supplier_id = :supplierId AND template_name = :name LIMIT 1")
    suspend fun findBySupplierAndName(supplierId: Long, name: String): SupplierTemplate?
    
    @Query("DELETE FROM supplier_template WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("UPDATE supplier_template SET is_active = 0 WHERE id = :id")
    suspend fun deactivate(id: Long): Int
}

/**
 * DAO for SupplierMonthlyHeader
 * Manages monthly import header/summary records
 */
@Dao
interface SupplierMonthlyHeaderDao {
    
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(header: SupplierMonthlyHeader): Long
    
    @Update
    suspend fun update(header: SupplierMonthlyHeader): Int
    
    @androidx.room.Transaction
    suspend fun upsert(header: SupplierMonthlyHeader): Long {
        val existing = findExisting(
            header.supplierId,
            header.agentName,
            header.contractType,
            header.year,
            header.month
        )
        
        return if (existing != null) {
            val updated = header.copy(id = existing.id)
            update(updated)
            existing.id
        } else {
            insert(header)
        }
    }
    
    @Query("SELECT * FROM supplier_monthly_header WHERE id = :id")
    fun getById(id: Long): Flow<SupplierMonthlyHeader?>
    
    @Query("SELECT * FROM supplier_monthly_header WHERE supplier_id = :supplierId ORDER BY year DESC, month DESC, agent_name")
    fun getBySupplier(supplierId: Long): Flow<List<SupplierMonthlyHeader>>
    
    @Query("SELECT * FROM supplier_monthly_header WHERE supplier_id = :supplierId AND year = :year AND month = :month ORDER BY agent_name, contract_type")
    fun getBySupplierAndPeriod(supplierId: Long, year: Int, month: Int): Flow<List<SupplierMonthlyHeader>>
    
    @Query("SELECT * FROM supplier_monthly_header WHERE year = :year AND month = :month ORDER BY supplier_id, agent_name")
    fun getByPeriod(year: Int, month: Int): Flow<List<SupplierMonthlyHeader>>
    
    @Query("SELECT * FROM supplier_monthly_header WHERE agent_name = :agentName ORDER BY year DESC, month DESC")
    fun getByAgent(agentName: String): Flow<List<SupplierMonthlyHeader>>
    
    @Query("SELECT * FROM supplier_monthly_header WHERE supplier_id = :supplierId AND agent_name = :agentName AND contract_type = :contractType AND year = :year AND month = :month LIMIT 1")
    suspend fun findExisting(supplierId: Long, agentName: String, contractType: String, year: Int, month: Int): SupplierMonthlyHeader?
    
    @Query("DELETE FROM supplier_monthly_header WHERE supplier_id = :supplierId AND year = :year AND month = :month AND source_file_name = :fileName")
    suspend fun deleteByImport(supplierId: Long, year: Int, month: Int, fileName: String): Int
    
    @Query("SELECT DISTINCT year FROM supplier_monthly_header ORDER BY year DESC")
    fun getDistinctYears(): Flow<List<Int>>
    
    @Query("SELECT DISTINCT agent_name FROM supplier_monthly_header ORDER BY agent_name")
    fun getDistinctAgents(): Flow<List<String>>
}

/**
 * DAO for SupplierMonthlyDeal
 * Manages monthly import deal/transaction records
 */
@Dao
interface SupplierMonthlyDealDao {
    
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(deal: SupplierMonthlyDeal): Long
    
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAll(deals: List<SupplierMonthlyDeal>): List<Long>
    
    @Update
    suspend fun update(deal: SupplierMonthlyDeal): Int
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE supplier_id = :supplierId AND contract_number = :contractNumber LIMIT 1")
    suspend fun findBySupplierAndContract(supplierId: Long, contractNumber: String): SupplierMonthlyDeal?
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE id = :id")
    fun getById(id: Long): Flow<SupplierMonthlyDeal?>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE header_id = :headerId ORDER BY contract_number")
    fun getByHeader(headerId: Long): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE supplier_id = :supplierId ORDER BY year DESC, month DESC, contract_number")
    fun getBySupplier(supplierId: Long): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE supplier_id = :supplierId AND year = :year AND month = :month ORDER BY contract_number")
    fun getBySupplierAndPeriod(supplierId: Long, year: Int, month: Int): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE year = :year AND month = :month ORDER BY supplier_id, contract_number")
    fun getByPeriod(year: Int, month: Int): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE agent_name = :agentName ORDER BY year DESC, month DESC")
    fun getByAgent(agentName: String): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE contract_number = :contractNumber ORDER BY year DESC, month DESC")
    fun getByContractNumber(contractNumber: String): Flow<List<SupplierMonthlyDeal>>
    
    @Query("SELECT * FROM supplier_monthly_deal WHERE customer_name LIKE :query OR contract_number LIKE :query ORDER BY year DESC, month DESC")
    fun search(query: String): Flow<List<SupplierMonthlyDeal>>
    
    @Query("DELETE FROM supplier_monthly_deal WHERE supplier_id = :supplierId AND year = :year AND month = :month AND source_file_name = :fileName")
    suspend fun deleteByImport(supplierId: Long, year: Int, month: Int, fileName: String): Int
    
    @Query("SELECT SUM(total_amount) FROM supplier_monthly_deal WHERE header_id = :headerId")
    suspend fun sumTotalAmountByHeader(headerId: Long): Double?
    
    @Query("SELECT SUM(commission_amount) FROM supplier_monthly_deal WHERE header_id = :headerId")
    suspend fun sumCommissionByHeader(headerId: Long): Double?
    
    @Query("SELECT COUNT(*) FROM supplier_monthly_deal WHERE header_id = :headerId")
    suspend fun countByHeader(headerId: Long): Int
}

/**
 * Data class for aggregated header validation
 */
data class HeaderAggregation(
    val agentName: String,
    val contractType: String,
    val totalAmount: Double,
    val totalCommission: Double,
    val dealCount: Int
)

/**
 * Combined DAO for import operations that require transactions
 */
@Dao
interface ImportTransactionDao {
    
    /**
     * Import a complete monthly report in a single transaction
     * Returns pair of (headersInserted, dealsInserted)
     */
    @Transaction
    suspend fun importMonthlyReport(
        headers: List<SupplierMonthlyHeader>,
        deals: List<SupplierMonthlyDeal>,
        headerDao: SupplierMonthlyHeaderDao,
        dealDao: SupplierMonthlyDealDao
    ): Pair<Int, Int> {
        var headersInserted = 0
        var dealsInserted = 0
        
        // Map to store header ID mapping (agent+type -> id)
        val headerIdMap = mutableMapOf<String, Long>()
        
        // Insert headers
        for (header in headers) {
            val headerId = headerDao.insert(header)
            val key = "${header.agentName}|${header.contractType}"
            headerIdMap[key] = headerId
            headersInserted++
        }
        
        // Insert deals with correct header_id
        for (deal in deals) {
            val key = "${deal.agentName}|${extractContractType(deal)}"
            val headerId = headerIdMap[key] ?: throw IllegalStateException("No header found for deal: $key")
            
            val dealWithHeaderId = deal.copy(headerId = headerId)
            dealDao.insert(dealWithHeaderId)
            dealsInserted++
        }
        
        return Pair(headersInserted, dealsInserted)
    }
    
    /**
     * Rollback/delete an entire import by supplier, period, and filename
     */
    @Transaction
    suspend fun rollbackImport(
        supplierId: Long,
        year: Int,
        month: Int,
        fileName: String,
        headerDao: SupplierMonthlyHeaderDao,
        dealDao: SupplierMonthlyDealDao
    ): Pair<Int, Int> {
        // Delete deals first (due to FK constraint)
        val dealsDeleted = dealDao.deleteByImport(supplierId, year, month, fileName)
        
        // Then delete headers
        val headersDeleted = headerDao.deleteByImport(supplierId, year, month, fileName)
        
        return Pair(headersDeleted, dealsDeleted)
    }
    
    /**
     * Extract contract type from deal (helper function)
     * This would need to match based on business logic
     */
    private fun extractContractType(deal: SupplierMonthlyDeal): String {
        // This is a placeholder - actual logic would determine type from deal data
        // Could be based on deal duration, explicit field, etc.
        return "monthly" // Default assumption
    }
}

/**
 * DAO for SupplierPriceListHeader and SupplierPriceListItem
 * Manages price list data for suppliers
 */
@Dao
interface SupplierPriceListDao {
    @Insert
    suspend fun insertHeader(header: SupplierPriceListHeader): Long

    @Insert
    suspend fun insertItems(items: List<SupplierPriceListItem>)

    @Query("SELECT * FROM supplier_price_list_header WHERE supplier_id = :supplierId ORDER BY year DESC, month DESC, created_at DESC")
    suspend fun getHeadersForSupplier(supplierId: Long): List<SupplierPriceListHeader>

    @Query("SELECT * FROM supplier_price_list_header WHERE supplier_id = :supplierId ORDER BY year DESC, month DESC, created_at DESC")
    fun observePriceListHeadersForSupplier(supplierId: Long): Flow<List<SupplierPriceListHeader>>

    @Query("SELECT COUNT(*) FROM supplier_price_list_header WHERE supplier_id = :supplierId")
    suspend fun getPriceListCountForSupplier(supplierId: Long): Int

    @Query("SELECT * FROM supplier_price_list_header WHERE id = :headerId LIMIT 1")
    suspend fun getHeaderById(headerId: Long): SupplierPriceListHeader?

    @Query("SELECT * FROM supplier_price_list_item WHERE header_id = :headerId ORDER BY manufacturer, model")
    suspend fun getItemsForHeader(headerId: Long): List<SupplierPriceListItem>
    
    @Query("SELECT * FROM supplier_price_list_item WHERE header_id = :headerId ORDER BY manufacturer, model")
    fun observeItemsForHeader(headerId: Long): Flow<List<SupplierPriceListItem>>
    
    @Query("SELECT COUNT(*) FROM supplier_price_list_item WHERE header_id = :headerId")
    suspend fun getItemCountForHeader(headerId: Long): Int

    @Query("""
        UPDATE supplier_price_list_header
        SET is_active = 0
        WHERE supplier_id = :supplierId AND (year != :year OR month != :month)
    """)
    suspend fun deactivateOtherPriceListsForPeriod(
        supplierId: Long,
        year: Int,
        month: Int
    )
}

