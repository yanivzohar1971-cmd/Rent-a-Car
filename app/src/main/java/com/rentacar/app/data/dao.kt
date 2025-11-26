package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface CustomerDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(customer: Customer): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(customer: Customer): Long

    @Query("SELECT * FROM Customer WHERE id = :id AND user_uid = :currentUid")
    fun getById(id: Long, currentUid: String): Flow<Customer?>

    @Query("SELECT * FROM Customer WHERE active = 1 AND user_uid = :currentUid ORDER BY lastName, firstName")
    fun listActive(currentUid: String): Flow<List<Customer>>

    @Query("SELECT * FROM Customer WHERE user_uid = :currentUid ORDER BY lastName, firstName")
    fun getAll(currentUid: String): Flow<List<Customer>>

    @Query(
        "SELECT * FROM Customer WHERE active = 1 AND user_uid = :currentUid AND (firstName LIKE :q OR lastName LIKE :q OR phone LIKE :q OR IFNULL(tzId,'') LIKE :q OR IFNULL(email,'') LIKE :q) ORDER BY lastName, firstName"
    )
    fun search(q: String, currentUid: String): Flow<List<Customer>>

    @Query("DELETE FROM Customer WHERE id = :id AND user_uid = :currentUid")
    suspend fun delete(id: Long, currentUid: String): Int

    @Query("SELECT id FROM Customer WHERE IFNULL(tzId,'') = :tz AND id != :excludeId AND user_uid = :currentUid LIMIT 1")
    suspend fun findByTzExcluding(tz: String, excludeId: Long, currentUid: String): Long?
    
    @Query("SELECT COUNT(*) FROM Customer WHERE user_uid = :currentUid")
    suspend fun getCount(currentUid: String): Int
}

@Dao
interface RequestDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(request: Request): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(request: Request): Long

    @Query("SELECT * FROM Request WHERE user_uid = :currentUid ORDER BY createdAt DESC")
    fun getAll(currentUid: String): Flow<List<Request>>

    @Query("DELETE FROM Request WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM Request")
    suspend fun getCount(): Int
}

@Dao
interface SupplierDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(supplier: Supplier): Long

    @Update
    suspend fun update(supplier: Supplier): Int

    @Query("SELECT * FROM Supplier WHERE user_uid = :currentUid ORDER BY name")
    fun getAll(currentUid: String): Flow<List<Supplier>>

    @Query("SELECT * FROM Supplier WHERE id = :id AND user_uid = :currentUid")
    fun getById(id: Long, currentUid: String): Flow<Supplier?>

    @Query("SELECT id FROM Supplier WHERE name = :name AND user_uid = :currentUid LIMIT 1")
    suspend fun getIdByName(name: String, currentUid: String): Long?

    @Query("DELETE FROM Supplier WHERE id = :id")
    suspend fun delete(id: Long): Int

    @Query("UPDATE Supplier SET activeTemplateId = :templateId WHERE id = :supplierId")
    suspend fun updateTemplateForSupplier(supplierId: Long, templateId: Long): Int

    @Query("SELECT name FROM Supplier WHERE id = :supplierId LIMIT 1")
    suspend fun getSupplierNameById(supplierId: Long): String?

    @Query("SELECT import_function_code FROM Supplier WHERE id = :supplierId")
    suspend fun getImportFunctionCode(supplierId: Long): Int?

    @Query("UPDATE Supplier SET import_function_code = :functionCode WHERE id = :supplierId")
    suspend fun updateImportFunctionCode(supplierId: Long, functionCode: Int): Int

    @Query("UPDATE Supplier SET import_function_code = NULL WHERE id = :supplierId")
    suspend fun clearImportFunctionCode(supplierId: Long): Int

    @Query("SELECT import_template_id FROM Supplier WHERE id = :supplierId")
    suspend fun getImportTemplateId(supplierId: Long): Long?

    @Query("UPDATE Supplier SET import_template_id = :templateId WHERE id = :supplierId")
    suspend fun updateImportTemplateId(supplierId: Long, templateId: Long): Int

    @Query("UPDATE Supplier SET import_function_code = :functionCode, import_template_id = :templateId WHERE id = :supplierId")
    suspend fun updateImportConfig(supplierId: Long, functionCode: Int, templateId: Long): Int

    @Query("UPDATE Supplier SET import_function_code = NULL, import_template_id = NULL WHERE id = :supplierId")
    suspend fun clearImportConfig(supplierId: Long): Int
    
    @Query("SELECT COUNT(*) FROM Supplier")
    suspend fun getCount(): Int

    @Query("SELECT price_list_import_function_code FROM Supplier WHERE id = :supplierId")
    suspend fun getPriceListImportFunctionCode(supplierId: Long): Int?

    @Query("UPDATE Supplier SET price_list_import_function_code = :functionCode WHERE id = :supplierId")
    suspend fun updatePriceListImportFunctionCode(supplierId: Long, functionCode: Int?): Int

    @androidx.room.Transaction
    suspend fun upsert(supplier: Supplier, currentUid: String): Long {
        if (supplier.id != 0L) {
            val rows = update(supplier)
            if (rows > 0) return supplier.id
            // If update didn't touch any row (e.g., fresh DB), try insert with provided id
            val inserted = insertIgnore(supplier)
            if (inserted != -1L) return inserted
            val existingId = getIdByName(supplier.name, currentUid)
            return if (existingId != null) {
                update(supplier.copy(id = existingId))
                existingId
            } else {
                insertIgnore(supplier).takeIf { it != -1L } ?: 0L
            }
        }
        val insertedId = insertIgnore(supplier)
        if (insertedId != -1L) return insertedId
        val existingId = getIdByName(supplier.name, currentUid)
        return if (existingId != null) {
            update(supplier.copy(id = existingId))
            existingId
        } else {
            insertIgnore(supplier).takeIf { it != -1L } ?: 0L
        }
    }
}

@Dao
interface BranchDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(branch: Branch): Long

    @Update
    suspend fun update(branch: Branch): Int

    @Query("SELECT * FROM Branch WHERE supplierId = :supplierId AND user_uid = :currentUid ORDER BY name")
    fun getBySupplier(supplierId: Long, currentUid: String): Flow<List<Branch>>

    @Query("SELECT * FROM Branch WHERE id = :id")
    suspend fun getById(id: Long): Branch?

    @Query("SELECT * FROM Branch ORDER BY name")
    suspend fun getAllOnce(): List<Branch>

    @Query("SELECT * FROM Branch WHERE supplierId = :supplierId AND name = :name LIMIT 1")
    suspend fun findBySupplierAndName(supplierId: Long, name: String): Branch?

    @Query("DELETE FROM Branch WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM Branch")
    suspend fun getCount(): Int

    @Query("DELETE FROM Branch")
    suspend fun deleteAll(): Int

    @androidx.room.Transaction
    suspend fun upsert(branch: Branch, currentUid: String): Long {
        if (branch.id != 0L) {
            val rows = update(branch)
            if (rows > 0) return branch.id
            // If update didn't touch any row, try insert with provided id
            val inserted = insertIgnore(branch)
            if (inserted != -1L) return inserted
            val existing = findBySupplierAndName(branch.supplierId, branch.name)
            return if (existing != null && existing.userUid == currentUid) {
                update(branch.copy(id = existing.id))
                existing.id
            } else {
                insertIgnore(branch).takeIf { it != -1L } ?: 0L
            }
        }
        val insertedId = insertIgnore(branch)
        if (insertedId != -1L) return insertedId
        val existing = findBySupplierAndName(branch.supplierId, branch.name)
        return if (existing != null && existing.userUid == currentUid) {
            update(branch.copy(id = existing.id))
            existing.id
        } else {
            insertIgnore(branch).takeIf { it != -1L } ?: 0L
        }
    }
}

@Dao
interface CarTypeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(type: CarType): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(type: CarType): Long

    @Query("SELECT * FROM CarType WHERE user_uid = :currentUid ORDER BY name")
    fun getAll(currentUid: String): Flow<List<CarType>>
    
    @Query("SELECT COUNT(*) FROM CarType")
    suspend fun getCount(): Int
}

@Dao
interface AgentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(agent: Agent): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(agent: Agent): Long

    @Query("SELECT * FROM Agent WHERE user_uid = :currentUid ORDER BY name")
    fun getAll(currentUid: String): Flow<List<Agent>>

    @Query("DELETE FROM Agent WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM Agent")
    suspend fun getCount(): Int
}

@Dao
interface ReservationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(reservation: Reservation): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(reservation: Reservation): Long

    @Update
    suspend fun update(reservation: Reservation)

    @Query("SELECT * FROM Reservation WHERE id = :id AND user_uid = :currentUid")
    fun getById(id: Long, currentUid: String): Flow<Reservation?>

    @Query("SELECT * FROM Reservation WHERE user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getAll(currentUid: String): Flow<List<Reservation>>

    @Query("SELECT * FROM Reservation WHERE isClosed = 0 AND user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getOpen(currentUid: String): Flow<List<Reservation>>

    @Query("SELECT * FROM Reservation WHERE customerId = :customerId AND user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getByCustomer(customerId: Long, currentUid: String): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE supplierId = :supplierId AND user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getBySupplier(supplierId: Long, currentUid: String): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE agentId = :agentId AND user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getByAgent(agentId: Long, currentUid: String): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE branchId = :branchId AND user_uid = :currentUid ORDER BY dateFrom DESC")
    fun getByBranch(branchId: Long, currentUid: String): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE supplierId = :supplierId AND externalContractNumber = :externalNumber AND user_uid = :currentUid LIMIT 1")
    suspend fun findBySupplierAndExternalNumber(supplierId: Long, externalNumber: String, currentUid: String): Reservation?
    
    @Insert
    suspend fun insertReservation(reservation: Reservation): Long
    
    @Update
    suspend fun updateReservation(reservation: Reservation): Int
    
    @Query("SELECT COUNT(*) FROM Reservation")
    suspend fun getCount(): Int
}

@Dao
interface PaymentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(payment: Payment): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(payment: Payment): Long

    @Query("SELECT * FROM Payment WHERE reservationId = :reservationId AND user_uid = :currentUid ORDER BY date DESC")
    fun getForReservation(reservationId: Long, currentUid: String): Flow<List<Payment>>
    
    @Query("SELECT COUNT(*) FROM Payment")
    suspend fun getCount(): Int
}

@Dao
interface CommissionRuleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(rule: CommissionRule): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(rule: CommissionRule): Long

    @Query("SELECT * FROM CommissionRule WHERE user_uid = :currentUid ORDER BY minDays")
    fun getAll(currentUid: String): Flow<List<CommissionRule>>
    
    @Query("SELECT COUNT(*) FROM CommissionRule")
    suspend fun getCount(): Int
}


@Dao
interface CarSaleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(sale: CarSale): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(sale: CarSale): Long

    @Query("SELECT * FROM CarSale WHERE user_uid = :currentUid ORDER BY saleDate DESC")
    fun getAll(currentUid: String): Flow<List<CarSale>>

    @Query("DELETE FROM CarSale WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM CarSale")
    suspend fun getCount(): Int
}

@Dao
interface CardStubDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(cardStub: CardStub): Long
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(cardStub: CardStub): Long

    @Query("SELECT * FROM CardStub ORDER BY id")
    fun getAll(): Flow<List<CardStub>>

    @Query("SELECT * FROM CardStub WHERE reservationId = :reservationId AND user_uid = :currentUid ORDER BY id")
    fun getForReservation(reservationId: Long, currentUid: String): Flow<List<CardStub>>

    @Query("DELETE FROM CardStub WHERE reservationId = :reservationId")
    suspend fun deleteForReservation(reservationId: Long): Int
    
    @Query("SELECT COUNT(*) FROM CardStub")
    suspend fun getCount(): Int
}


