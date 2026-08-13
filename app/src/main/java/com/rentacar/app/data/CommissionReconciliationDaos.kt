package com.rentacar.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SupplierCommissionImportConfigDao {
    @Query(
        """
        SELECT * FROM supplier_commission_import_config
        WHERE supplier_id = :supplierId AND user_uid = :userUid AND is_active = 1
        LIMIT 1
        """
    )
    suspend fun getActiveForSupplier(supplierId: Long, userUid: String): SupplierCommissionImportConfig?

    @Query(
        """
        SELECT * FROM supplier_commission_import_config
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        LIMIT 1
        """
    )
    suspend fun getForSupplier(supplierId: Long, userUid: String): SupplierCommissionImportConfig?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(config: SupplierCommissionImportConfig): Long

    @Query("SELECT * FROM supplier_commission_import_config WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<SupplierCommissionImportConfig>
}

@Dao
interface SupplierCommissionReportImportDao {
    @Insert
    suspend fun insert(reportImport: SupplierCommissionReportImport): Long

    @Update
    suspend fun update(reportImport: SupplierCommissionReportImport): Int

    @Query(
        """
        SELECT * FROM supplier_commission_report_import
        WHERE id = :id AND user_uid = :userUid
        LIMIT 1
        """
    )
    suspend fun getById(id: Long, userUid: String): SupplierCommissionReportImport?

    @Query(
        """
        SELECT * FROM supplier_commission_report_import
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        ORDER BY imported_at DESC
        """
    )
    fun observeForSupplier(supplierId: Long, userUid: String): Flow<List<SupplierCommissionReportImport>>

    @Query(
        """
        SELECT * FROM supplier_commission_report_import
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        ORDER BY imported_at DESC
        """
    )
    suspend fun listForSupplier(supplierId: Long, userUid: String): List<SupplierCommissionReportImport>

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM supplier_commission_report_import
            WHERE supplier_id = :supplierId AND file_hash = :fileHash AND user_uid = :userUid
        )
        """
    )
    suspend fun existsByFileHash(supplierId: Long, fileHash: String, userUid: String): Boolean

    @Query("SELECT * FROM supplier_commission_report_import WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<SupplierCommissionReportImport>
}

@Dao
interface SupplierCommissionReportLineDao {
    @Insert
    suspend fun insertAll(lines: List<SupplierCommissionReportLine>): List<Long>

    @Query(
        """
        SELECT * FROM supplier_commission_report_line
        WHERE import_id = :importId AND user_uid = :userUid
        ORDER BY source_row_number ASC
        """
    )
    suspend fun getForImport(importId: Long, userUid: String): List<SupplierCommissionReportLine>

    @Query("SELECT * FROM supplier_commission_report_line WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<SupplierCommissionReportLine>
}

@Dao
interface CommissionReconciliationItemDao {
    @Insert
    suspend fun insertAll(items: List<CommissionReconciliationItem>): List<Long>

    @Update
    suspend fun update(item: CommissionReconciliationItem): Int

    @Update
    suspend fun updateAll(items: List<CommissionReconciliationItem>): Int

    @Query(
        """
        SELECT * FROM commission_reconciliation_item
        WHERE import_id = :importId AND user_uid = :userUid
        ORDER BY id ASC
        """
    )
    suspend fun getForImport(importId: Long, userUid: String): List<CommissionReconciliationItem>

    @Query(
        """
        SELECT * FROM commission_reconciliation_item
        WHERE id = :id AND user_uid = :userUid
        LIMIT 1
        """
    )
    suspend fun getById(id: Long, userUid: String): CommissionReconciliationItem?

    @Query("SELECT * FROM commission_reconciliation_item WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<CommissionReconciliationItem>

    @Query(
        """
        SELECT COUNT(*) FROM commission_reconciliation_item
        WHERE import_id = :importId AND user_uid = :userUid AND approval_state = :state
        """
    )
    suspend fun countByApprovalState(importId: Long, userUid: String, state: String): Int
}

@Dao
interface CommissionSettlementEventDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(event: CommissionSettlementEvent): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAll(events: List<CommissionSettlementEvent>): List<Long>

    @Query(
        """
        SELECT * FROM commission_settlement_event
        WHERE reservation_id = :reservationId AND user_uid = :userUid
        """
    )
    suspend fun getForReservation(reservationId: Long, userUid: String): List<CommissionSettlementEvent>

    @Query(
        """
        SELECT * FROM commission_settlement_event
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        """
    )
    suspend fun getForSupplier(supplierId: Long, userUid: String): List<CommissionSettlementEvent>

    @Query(
        """
        SELECT * FROM commission_settlement_event
        WHERE stable_id = :stableId AND user_uid = :userUid
        LIMIT 1
        """
    )
    suspend fun getByStableId(stableId: String, userUid: String): CommissionSettlementEvent?

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM commission_settlement_event
            WHERE stable_id = :stableId AND user_uid = :userUid
              AND status IN ('APPROVED', 'PAID')
        )
        """
    )
    suspend fun existsApproved(stableId: String, userUid: String): Boolean

    @Query("SELECT * FROM commission_settlement_event WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<CommissionSettlementEvent>
}

@Dao
interface CommissionTrackingOverrideDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(override: CommissionTrackingOverride): Long

    @Query(
        """
        SELECT * FROM commission_tracking_override
        WHERE reservation_id = :reservationId AND user_uid = :userUid
        LIMIT 1
        """
    )
    suspend fun getForReservation(reservationId: Long, userUid: String): CommissionTrackingOverride?

    @Query(
        """
        SELECT * FROM commission_tracking_override
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        """
    )
    suspend fun getForSupplier(supplierId: Long, userUid: String): List<CommissionTrackingOverride>

    @Query("SELECT * FROM commission_tracking_override WHERE user_uid = :userUid")
    suspend fun getAllForUser(userUid: String): List<CommissionTrackingOverride>
}

@Dao
interface EmailCommissionReportFingerprintDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(fingerprint: EmailCommissionReportFingerprint): Long

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM email_commission_report_fingerprint
            WHERE supplier_id = :supplierId AND content_hash = :contentHash AND user_uid = :userUid
        )
        """
    )
    suspend fun existsByContentHash(supplierId: Long, contentHash: String, userUid: String): Boolean

    @Query(
        """
        SELECT EXISTS(
            SELECT 1 FROM email_commission_report_fingerprint
            WHERE supplier_id = :supplierId AND message_id = :messageId AND user_uid = :userUid
              AND message_id IS NOT NULL AND message_id != ''
        )
        """
    )
    suspend fun existsByMessageId(supplierId: Long, messageId: String, userUid: String): Boolean

    @Query(
        """
        SELECT * FROM email_commission_report_fingerprint
        WHERE supplier_id = :supplierId AND user_uid = :userUid
        ORDER BY imported_at DESC
        """
    )
    suspend fun listForSupplier(supplierId: Long, userUid: String): List<EmailCommissionReportFingerprint>
}
