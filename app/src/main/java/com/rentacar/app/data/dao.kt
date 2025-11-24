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

    @Query("SELECT * FROM Customer WHERE id = :id")
    fun getById(id: Long): Flow<Customer?>

    @Query("SELECT * FROM Customer WHERE active = 1 ORDER BY lastName, firstName")
    fun listActive(): Flow<List<Customer>>

    @Query(
        "SELECT * FROM Customer WHERE active = 1 AND (firstName LIKE :q OR lastName LIKE :q OR phone LIKE :q OR IFNULL(tzId,'') LIKE :q OR IFNULL(email,'') LIKE :q) ORDER BY lastName, firstName"
    )
    fun search(q: String): Flow<List<Customer>>

    @Query("DELETE FROM Customer WHERE id = :id")
    suspend fun delete(id: Long): Int

    @Query("SELECT id FROM Customer WHERE IFNULL(tzId,'') = :tz AND id != :excludeId LIMIT 1")
    suspend fun findByTzExcluding(tz: String, excludeId: Long): Long?
    
    @Query("SELECT COUNT(*) FROM Customer")
    suspend fun getCount(): Int
}

@Dao
interface RequestDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(request: Request): Long

    @Query("SELECT * FROM Request ORDER BY createdAt DESC")
    fun getAll(): Flow<List<Request>>

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

    @Query("SELECT * FROM Supplier ORDER BY name")
    fun getAll(): Flow<List<Supplier>>

    @Query("SELECT * FROM Supplier WHERE id = :id")
    fun getById(id: Long): Flow<Supplier?>

    @Query("SELECT id FROM Supplier WHERE name = :name LIMIT 1")
    suspend fun getIdByName(name: String): Long?

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
    suspend fun upsert(supplier: Supplier): Long {
        if (supplier.id != 0L) {
            val rows = update(supplier)
            if (rows > 0) return supplier.id
            // If update didn't touch any row (e.g., fresh DB), try insert with provided id
            val inserted = insertIgnore(supplier)
            if (inserted != -1L) return inserted
            val existingId = getIdByName(supplier.name)
            return if (existingId != null) {
                update(supplier.copy(id = existingId))
                existingId
            } else {
                insertIgnore(supplier).takeIf { it != -1L } ?: 0L
            }
        }
        val insertedId = insertIgnore(supplier)
        if (insertedId != -1L) return insertedId
        val existingId = getIdByName(supplier.name)
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

    @Query("SELECT * FROM Branch WHERE supplierId = :supplierId ORDER BY name")
    fun getBySupplier(supplierId: Long): Flow<List<Branch>>

    @Query("SELECT * FROM Branch WHERE supplierId = :supplierId AND name = :name LIMIT 1")
    suspend fun findBySupplierAndName(supplierId: Long, name: String): Branch?

    @Query("DELETE FROM Branch WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM Branch")
    suspend fun getCount(): Int

    @Query("DELETE FROM Branch")
    suspend fun deleteAll(): Int

    @androidx.room.Transaction
    suspend fun upsert(branch: Branch): Long {
        if (branch.id != 0L) {
            val rows = update(branch)
            if (rows > 0) return branch.id
            // If update didn't touch any row, try insert with provided id
            val inserted = insertIgnore(branch)
            if (inserted != -1L) return inserted
            val existing = findBySupplierAndName(branch.supplierId, branch.name)
            return if (existing != null) {
                update(branch.copy(id = existing.id))
                existing.id
            } else {
                insertIgnore(branch).takeIf { it != -1L } ?: 0L
            }
        }
        val insertedId = insertIgnore(branch)
        if (insertedId != -1L) return insertedId
        val existing = findBySupplierAndName(branch.supplierId, branch.name)
        return if (existing != null) {
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

    @Query("SELECT * FROM CarType ORDER BY name")
    fun getAll(): Flow<List<CarType>>
    
    @Query("SELECT COUNT(*) FROM CarType")
    suspend fun getCount(): Int
}

@Dao
interface AgentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(agent: Agent): Long

    @Query("SELECT * FROM Agent ORDER BY name")
    fun getAll(): Flow<List<Agent>>

    @Query("DELETE FROM Agent WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM Agent")
    suspend fun getCount(): Int
}

@Dao
interface ReservationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(reservation: Reservation): Long

    @Update
    suspend fun update(reservation: Reservation)

    @Query("SELECT * FROM Reservation WHERE id = :id")
    fun getById(id: Long): Flow<Reservation?>

    @Query("SELECT * FROM Reservation ORDER BY dateFrom DESC")
    fun getAll(): Flow<List<Reservation>>

    @Query("SELECT * FROM Reservation WHERE isClosed = 0 ORDER BY dateFrom DESC")
    fun getOpen(): Flow<List<Reservation>>

    @Query("SELECT * FROM Reservation WHERE customerId = :customerId ORDER BY dateFrom DESC")
    fun getByCustomer(customerId: Long): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE supplierId = :supplierId ORDER BY dateFrom DESC")
    fun getBySupplier(supplierId: Long): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE agentId = :agentId ORDER BY dateFrom DESC")
    fun getByAgent(agentId: Long): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE branchId = :branchId ORDER BY dateFrom DESC")
    fun getByBranch(branchId: Long): Flow<List<Reservation>>
    
    @Query("SELECT * FROM Reservation WHERE supplierId = :supplierId AND externalContractNumber = :externalNumber LIMIT 1")
    suspend fun findBySupplierAndExternalNumber(supplierId: Long, externalNumber: String): Reservation?
    
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

    @Query("SELECT * FROM Payment WHERE reservationId = :reservationId ORDER BY date DESC")
    fun getForReservation(reservationId: Long): Flow<List<Payment>>
    
    @Query("SELECT COUNT(*) FROM Payment")
    suspend fun getCount(): Int
}

@Dao
interface CommissionRuleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(rule: CommissionRule): Long

    @Query("SELECT * FROM CommissionRule ORDER BY minDays")
    fun getAll(): Flow<List<CommissionRule>>
    
    @Query("SELECT COUNT(*) FROM CommissionRule")
    suspend fun getCount(): Int
}


@Dao
interface CarSaleDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(sale: CarSale): Long

    @Query("SELECT * FROM CarSale ORDER BY saleDate DESC")
    fun getAll(): Flow<List<CarSale>>

    @Query("DELETE FROM CarSale WHERE id = :id")
    suspend fun delete(id: Long): Int
    
    @Query("SELECT COUNT(*) FROM CarSale")
    suspend fun getCount(): Int
}

@Dao
interface CardStubDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(cardStub: CardStub): Long

    @Query("SELECT * FROM CardStub ORDER BY id")
    fun getAll(): Flow<List<CardStub>>

    @Query("SELECT * FROM CardStub WHERE reservationId = :reservationId ORDER BY id")
    fun getForReservation(reservationId: Long): Flow<List<CardStub>>

    @Query("DELETE FROM CardStub WHERE reservationId = :reservationId")
    suspend fun deleteForReservation(reservationId: Long): Int
    
    @Query("SELECT COUNT(*) FROM CardStub")
    suspend fun getCount(): Int
}


